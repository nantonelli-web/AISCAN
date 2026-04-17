import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeGoogleAds } from "@/lib/apify/google-ads-service";
import { storeAdImages } from "@/lib/media/store-ad-images";

export const maxDuration = 300;

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_items: z.number().int().min(1).max(1000).optional(),
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
    // Parse all country codes from competitor config
    const countryCodes = competitor.country
      ? competitor.country.split(",").map((c: string) => c.trim()).filter(Boolean)
      : undefined;

    const result = await scrapeGoogleAds({
      advertiserId: competitor.google_advertiser_id ?? undefined,
      advertiserDomain: competitor.google_domain ?? undefined,
      advertiserName: !competitor.google_advertiser_id && !competitor.google_domain
        ? competitor.page_name ?? undefined
        : undefined,
      countryCodes,
      maxResults: parsed.data.max_items ?? 200,
    });

    // Download images to permanent storage, then upsert
    if (result.records.length > 0) {
      const rows = result.records.map((r) => ({
        ...r,
        source: "google" as const,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      }));

      await storeAdImages(admin, competitor.workspace_id, rows, "google");

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
      debug: { startUrl: result.startUrl },
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
