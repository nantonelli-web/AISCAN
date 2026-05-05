/**
 * POST /api/snapchat-ads/scan
 *
 * Snapchat Ads Library scrape via Snap's official public REST API
 * (https://adsapi.snapchat.com/v1/ads_library). No Apify, no token.
 * See project memory `project_snapchat_ads_api`.
 *
 * Coverage: ads served in the EU in the last 12 months. Outside that
 * window the API returns nothing — the dropdown UI surfaces the limit
 * up-front so the user knows what they're getting.
 *
 * Mirrors the structure of /api/tiktok-ads/scan (concurrency gate →
 * credits → job row → scrape → upsert → mark stale → finalise).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeSnapchatAds } from "@/lib/snapchat/ads-service";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300;

const schema = z.object({
  competitor_id: z.string().uuid(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  countries: z.array(z.string().length(2)).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  max_results: z.number().int().min(1).max(2000).optional(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { competitor_id, date_from, date_to, countries, status, max_results } =
    parsed.data;

  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select("id, workspace_id, page_name, country")
    .eq("id", competitor_id)
    .single();
  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();

  // Stale-job sweep + concurrency gate (same pattern as the other ad scans).
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: "Timeout (stale)",
    })
    .eq("competitor_id", competitor.id)
    .eq("status", "running")
    .lt("started_at", tenMinAgo);

  const rate = await checkScanConcurrency(admin, {
    workspaceId: competitor.workspace_id,
    competitorId: competitor.id,
  });
  if (!rate.ok) {
    return NextResponse.json({ error: rate.reason }, { status: 429 });
  }

  const credits = await consumeCredits(
    user.id,
    "scan_snapchat_ads",
    `Snapchat Ads: ${competitor.page_name}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 1 },
      { status: 402 },
    );
  }

  // Resolve scan countries: explicit body override > brand's country
  // column (comma-separated ISO-2 list) > library default (EU-27).
  let scanCountries: string[] | undefined = countries?.map((c) =>
    c.toLowerCase(),
  );
  if (!scanCountries || scanCountries.length === 0) {
    const fromBrand = (competitor.country ?? "")
      .split(",")
      .map((c: string) => c.trim().toLowerCase())
      .filter(Boolean);
    scanCountries = fromBrand.length > 0 ? fromBrand : undefined;
  }

  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
      // Distinct from `snapchat` (organic profile snapshot) so the
      // brand-page job history can label them separately.
      source: "snapchat_ads",
      date_from: date_from ?? null,
      date_to: date_to ?? null,
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    await refundCredits(
      user.id,
      "scan_snapchat_ads",
      `Snapchat Ads: ${competitor.page_name}`,
    );
    if ((jobErr as { code?: string } | null)?.code === "23505") {
      return NextResponse.json({ error: "already_running" }, { status: 429 });
    }
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 },
    );
  }

  try {
    const result = await scrapeSnapchatAds({
      brandName: competitor.page_name,
      countries: scanCountries,
      dateFrom: date_from ? new Date(date_from) : undefined,
      dateTo: date_to ? new Date(date_to) : undefined,
      status: status ?? "ACTIVE",
      maxResults: max_results ?? 500,
    });

    // Abort checkpoint — user clicked Stop while we were paginating.
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_snapchat_ads",
          `Snapchat Ads aborted: ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          job_id: job.id,
          records: 0,
        });
      }
    }

    if (result.ads.length > 0) {
      const nowIso = new Date().toISOString();
      const rows = result.ads.map((a) => ({
        ...a,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        scan_countries: scanCountries ?? null,
        scan_status_filter: status ?? "ACTIVE",
        scraped_at: nowIso,
        last_seen_in_scan_at: nowIso,
      }));
      const { error: upErr } = await admin
        .from("mait_snapchat_ads")
        .upsert(rows, { onConflict: "workspace_id,ad_id" });
      if (upErr) {
        console.error("[SnapchatAds route] Upsert error:", upErr);
        throw upErr;
      }
    }

    // Any cached comparison containing this brand is now out of date.
    await admin
      .from("mait_comparisons")
      .update({ stale: true })
      .contains("competitor_ids", [competitor.id]);

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.ads.length,
        cost_cu: result.costCu,
        // No apify_run_id — Snap's API has no run concept.
        apify_run_id: null,
      })
      .eq("id", job.id);

    await admin
      .from("mait_competitors")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", competitor.id);

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.ads.length,
      pages_fetched: result.pagesFetched,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Snapchat Ads scrape failed";
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    await refundCredits(
      user.id,
      "scan_snapchat_ads",
      `Snapchat Ads error: ${competitor.page_name}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
