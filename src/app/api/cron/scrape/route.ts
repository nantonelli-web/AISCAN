import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeMetaAds } from "@/lib/apify/service";
import { scrapeGoogleAds } from "@/lib/apify/google-ads-service";
import { storeAdImages, storeProfilePicture } from "@/lib/media/store-ad-images";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Vercel Cron entrypoint. Triggered by the schedules in vercel.json.
 * Requires `Authorization: Bearer <CRON_SECRET>` on every request.
 * If CRON_SECRET is missing from env, the endpoint refuses to run.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const frequency = url.searchParams.get("frequency") ?? "daily";
  if (!["daily", "weekly", "manual"].includes(frequency)) {
    return NextResponse.json({ error: "Invalid frequency" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find all competitors whose monitor_config.frequency matches.
  const { data: competitors, error } = await admin
    .from("mait_competitors")
    .select("id, workspace_id, page_id, page_name, page_url, country, monitor_config, google_advertiser_id, google_domain");

  if (error) {
    console.error("[cron/scrape competitors list]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  type CompRow = {
    id: string;
    workspace_id: string;
    page_id: string | null;
    page_name: string | null;
    page_url: string;
    country: string | null;
    google_advertiser_id: string | null;
    google_domain: string | null;
    monitor_config: { frequency?: string; max_items?: number } | null;
  };

  const due = ((competitors ?? []) as CompRow[]).filter(
    (c) => (c.monitor_config?.frequency ?? "manual") === frequency
  );

  const results: Array<{
    competitor_id: string;
    status: "ok" | "error";
    records?: number;
    error?: string;
  }> = [];

  for (const c of due) {
    const { data: job } = await admin
      .from("mait_scrape_jobs")
      .insert({
        workspace_id: c.workspace_id,
        competitor_id: c.id,
        status: "running",
      })
      .select("id")
      .single();

    if (!job) {
      results.push({ competitor_id: c.id, status: "error", error: "job_create" });
      continue;
    }

    try {
      const result = await scrapeMetaAds({
        pageId: c.page_id ?? undefined,
        pageName: (c as { page_name?: string }).page_name ?? undefined,
        pageUrl: c.page_url,
        country: c.country ?? undefined,
        maxItems: c.monitor_config?.max_items ?? 500,
        active: true,
      });

      // Meta ads
      if (result.records.length > 0) {
        const rows = result.records.map((r) => ({
          ...r,
          source: "meta" as const,
          workspace_id: c.workspace_id,
          competitor_id: c.id,
        }));
        await storeAdImages(admin, c.workspace_id, rows, "meta");

        // Save profile picture permanently
        const snap = (result.records[0]?.raw_data as Record<string, unknown>)?.snapshot as Record<string, unknown> | undefined;
        const ppUrl = snap?.pageProfilePictureUrl as string | undefined;
        if (ppUrl) {
          const permUrl = await storeProfilePicture(admin, c.workspace_id, c.id, ppUrl);
          if (permUrl) {
            await admin.from("mait_competitors").update({ profile_picture_url: permUrl }).eq("id", c.id);
          }
        }

        await admin
          .from("mait_ads_external")
          .upsert(rows, { onConflict: "workspace_id,ad_archive_id,source" });
      }

      let totalRecords = result.records.length;

      // Google Ads (if configured)
      if (c.google_advertiser_id || c.google_domain) {
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
          const gResult = await scrapeGoogleAds({
            advertiserId: c.google_advertiser_id ?? undefined,
            advertiserDomain: c.google_domain ?? undefined,
            dateFrom: thirtyDaysAgo,
            maxResults: c.monitor_config?.max_items ?? 500,
          });
          if (gResult.records.length > 0) {
            const gRows = gResult.records.map((r) => ({
              ...r,
              source: "google" as const,
              workspace_id: c.workspace_id,
              competitor_id: c.id,
            }));
            await admin
              .from("mait_ads_external")
              .upsert(gRows, { onConflict: "workspace_id,ad_archive_id,source" });
            totalRecords += gResult.records.length;
          }
        } catch {
          // Google scrape failure should not block the Meta result
        }
      }

      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          records_count: totalRecords,
          cost_cu: result.costCu,
          apify_run_id: result.runId,
        })
        .eq("id", job.id);

      await admin
        .from("mait_competitors")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", c.id);

      if (totalRecords > 0) {
        await admin.from("mait_alerts").insert({
          workspace_id: c.workspace_id,
          competitor_id: c.id,
          type: "new_ads",
          message: `Cron ${frequency}: ${totalRecords} ads sincronizzate.`,
        });
      }

      results.push({
        competitor_id: c.id,
        status: "ok",
        records: totalRecords,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Scrape failed";
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: message,
        })
        .eq("id", job.id);
      await admin.from("mait_alerts").insert({
        workspace_id: c.workspace_id,
        competitor_id: c.id,
        type: "sync_error",
        message: `Cron ${frequency} fallito: ${message}`,
      });
      results.push({ competitor_id: c.id, status: "error", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    frequency,
    processed: results.length,
    results,
  });
}
