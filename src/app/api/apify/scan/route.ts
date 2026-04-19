import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeMetaAds } from "@/lib/apify/service";
import { resolvePageId } from "@/lib/meta/resolve-page-id";
import { sendNewAdsNotification } from "@/lib/email/resend";
import { storeAdImages } from "@/lib/media/store-ad-images";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";

export const maxDuration = 300; // seconds (Vercel hobby allows 60; pro 300)

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_items: z.number().int().min(1).max(1000).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  active_status: z.enum(["ACTIVE", "ALL"]).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    .select("id, workspace_id, page_id, page_url, page_name, country")
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
  }

  // Credit check
  const credits = await consumeCredits(user.id, "scan_meta", `Meta Ads scan: ${competitor.page_name}`);
  if (!credits.ok) {
    return NextResponse.json({ error: "Insufficient credits", balance: credits.balance, cost: 5 }, { status: 402 });
  }

  const admin = createAdminClient();

  // Cleanup stale jobs: any "running" job older than 10 min → mark failed
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString(), error: "Timeout (stale)" })
    .eq("competitor_id", competitor.id)
    .eq("status", "running")
    .lt("started_at", tenMinAgo);

  // If page_id was never resolved, try again now
  let pageId = competitor.page_id;
  if (!pageId) {
    const resolved = await resolvePageId(
      competitor.page_url,
      competitor.page_name ?? undefined
    );
    if (resolved) {
      pageId = resolved;
      await admin
        .from("mait_competitors")
        .update({ page_id: resolved })
        .eq("id", competitor.id);
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
    return NextResponse.json({ error: jobErr?.message ?? "Job error" }, { status: 500 });
  }

  try {
    const result = await scrapeMetaAds({
      pageId: pageId ?? undefined,
      pageName: competitor.page_name ?? undefined,
      pageUrl: competitor.page_url,
      country: competitor.country ?? undefined,
      maxItems: parsed.data.max_items ?? 200,
      active: parsed.data.active_status !== "ALL",
      dateFrom: parsed.data.date_from,
      dateTo: parsed.data.date_to,
    });

    // Download images to permanent storage, then upsert ads
    if (result.records.length > 0) {
      const rows = result.records.map((r) => ({
        ...r,
        source: "meta" as const,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      }));

      await storeAdImages(admin, competitor.workspace_id, rows, "meta");

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
        message: `${result.records.length} ads sincronizzate.`,
      });

      // Mark any cached comparisons that include this competitor as stale
      await admin
        .from("mait_comparisons")
        .update({ stale: true, updated_at: new Date().toISOString() })
        .contains("competitor_ids", [competitor.id]);

      // Send email notification to workspace members
      try {
        const { data: members } = await admin
          .from("mait_users")
          .select("email")
          .eq("workspace_id", competitor.workspace_id);
        const emails = (members ?? []).map((m) => m.email).filter(Boolean);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await sendNewAdsNotification(emails, {
          competitorName: competitor.page_name ?? "Competitor",
          adsCount: result.records.length,
          ads: result.records.slice(0, 5).map((r) => ({
            headline: r.headline,
            adText: r.ad_text,
            imageUrl: r.image_url,
            adLibraryUrl: r.ad_archive_id
              ? `https://www.facebook.com/ads/library/?id=${r.ad_archive_id}`
              : appUrl,
          })),
          dashboardUrl: `${appUrl}/competitors/${competitor.id}`,
        });
      } catch {
        // Email failure should not block the scan response
      }
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.records.length,
      debug: { startUrl: result.startUrl, pageId: pageId ?? null },
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
    await refundCredits(user.id, "scan_meta", `Meta Ads scan: ${competitor.page_name}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
