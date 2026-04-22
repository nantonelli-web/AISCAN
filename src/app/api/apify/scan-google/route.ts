import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scrapeGoogleAds,
  cleanAdvertiserDomain,
} from "@/lib/apify/google-ads-service";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300;

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_items: z.number().int().min(1).max(1000).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      {
        error:
          "APIFY_API_TOKEN non configurato. Aggiungilo nelle Environment Variables di Vercel e ridepiega.",
      },
      { status: 503 }
    );
  }

  // Validate ownership via RLS read
  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select(
      "id, workspace_id, page_name, google_advertiser_id, google_domain, country"
    )
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 }
    );
  }

  if (!competitor.google_advertiser_id && !competitor.google_domain) {
    return NextResponse.json(
      {
        error:
          "Nessun Google Advertiser ID o dominio configurato per questo competitor.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Cleanup stale jobs + concurrency gate BEFORE charging credits.
  const tenMinAgoPre = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString(), error: "Timeout (stale)" })
    .eq("competitor_id", competitor.id)
    .eq("status", "running")
    .lt("started_at", tenMinAgoPre);

  const rate = await checkScanConcurrency(admin, {
    workspaceId: competitor.workspace_id,
    competitorId: competitor.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.reason }, { status: 429 });
  }

  const credits = await consumeCredits(user.id, "scan_google", `Google Ads scan: ${competitor.page_name}`);
  if (!credits.ok) {
    return NextResponse.json({ error: "Insufficient credits", balance: credits.balance, cost: 2 }, { status: 402 });
  }

  // Auto-heal legacy google_domain values stored as full URLs.
  if (competitor.google_domain) {
    const cleaned = cleanAdvertiserDomain(competitor.google_domain);
    if (cleaned && cleaned !== competitor.google_domain) {
      await admin
        .from("mait_competitors")
        .update({ google_domain: cleaned })
        .eq("id", competitor.id);
      competitor.google_domain = cleaned;
    }
  }

  // Create job row
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 }
    );
  }

  try {
    const result = await scrapeGoogleAds({
      advertiserId: competitor.google_advertiser_id ?? undefined,
      advertiserDomain: competitor.google_domain ?? undefined,
      advertiserName: !competitor.google_advertiser_id && !competitor.google_domain
        ? competitor.page_name ?? undefined
        : undefined,
      dateFrom: parsed.data.date_from,
      dateTo: parsed.data.date_to,
      maxResults: parsed.data.max_items ?? 200,
    });

    // Upsert ads (no image download — Google CDN URLs are persistent)
    if (result.records.length > 0) {
      const rows = result.records.map((r) => ({
        ...r,
        source: "google" as const,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      }));

      const { error: upErr } = await admin
        .from("mait_ads_external")
        .upsert(rows, { onConflict: "workspace_id,ad_archive_id,source" });
      if (upErr) throw upErr;
    }

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.records.length,
        cost_cu: result.costCu,
        apify_run_id: result.runId,
      })
      .eq("id", job.id);

    await admin
      .from("mait_competitors")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", competitor.id);

    if (result.records.length > 0) {
      await admin.from("mait_alerts").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        type: "new_ads",
        message: `${result.records.length} Google Ads sincronizzate.`,
      });

      // Mark any cached comparisons that include this competitor as stale
      await admin
        .from("mait_comparisons")
        .update({ stale: true, updated_at: new Date().toISOString() })
        .contains("competitor_ids", [competitor.id]);
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.records.length,
      debug: { startUrl: result.startUrl, ...result.debug },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Scrape failed";
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    // Refund credits on failure
    await refundCredits(user.id, "scan_google", `Google Ads scan: ${competitor.page_name}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
