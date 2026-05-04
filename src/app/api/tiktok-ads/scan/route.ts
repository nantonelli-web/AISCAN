/**
 * POST /api/tiktok-ads/scan
 *
 * Dual-actor TikTok Ads scan endpoint. The `source` body field
 * picks which actor runs:
 *
 *   source = "library"          → silva95gustavo/tiktok-ads-scraper
 *                                 (DSA EU/EEA/UK, brand-specific, cheap)
 *   source = "creative_center"  → beyondops/tiktok-ad-library-scraper
 *                                 (50+ countries, market intel, $0.00001/result)
 *
 * The two paths share input validation, rate-limit gating, credit
 * accounting, and DB upsert layout — they differ only in the actor
 * input shape and which optional brand context they need.
 *
 * Decision history: see project memory `project_tiktok_ads_actors`
 * (2026-05-04). Single-endpoint dual-source intentionally — splitting
 * into /scan-library and /scan-cc would duplicate the rate-limit and
 * credit-accounting boilerplate without buying anything.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeTiktokAdsLibrary } from "@/lib/tiktok-ads/silva-service";
import {
  scrapeTiktokCreativeCenter,
  type CcIndustry,
  type CcObjective,
  type CcAdFormat,
  type CcOrderBy,
  type CcPeriod,
} from "@/lib/tiktok-ads/beyondops-service";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300;

// Input schema — discriminated union on `source`. Library path
// requires a competitor (we filter by advertiser); Creative Center
// path is workspace-level and accepts an optional competitor link
// purely for "what trends in my brand's industry" associations.
const librarySchema = z.object({
  source: z.literal("library"),
  competitor_id: z.string().uuid(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  region: z.string().optional(),
  max_results: z.number().int().min(1).max(500).optional(),
});

const ccSchema = z.object({
  source: z.literal("creative_center"),
  competitor_id: z.string().uuid().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
  objective: z.string().optional(),
  period: z.enum(["7", "30", "180"]).optional(),
  ad_format: z.enum(["spark_ads", "non_spark_ads", "collection_ads"]).optional(),
  order_by: z.enum(["for_you", "like", "ctr", "impression"]).optional(),
  max_results: z.number().int().min(1).max(100).optional(),
});

const schema = z.discriminatedUnion("source", [librarySchema, ccSchema]);

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

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      {
        error:
          "APIFY_API_TOKEN non configurato. Aggiungilo nelle Environment Variables di Vercel e ridepiega.",
      },
      { status: 503 },
    );
  }

  const admin = createAdminClient();

  // ── Library path ───────────────────────────────────────────────
  if (parsed.data.source === "library") {
    const { competitor_id, date_from, date_to, region, max_results } = parsed.data;

    const { data: competitor, error: compErr } = await supabase
      .from("mait_competitors")
      .select("id, workspace_id, page_name, tiktok_advertiser_id")
      .eq("id", competitor_id)
      .single();
    if (compErr || !competitor) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    // Stale-job sweep + concurrency gate.
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
      "scan_tiktok_ads",
      `TikTok Ads (DSA): ${competitor.page_name}`,
    );
    if (!credits.ok) {
      return NextResponse.json(
        { error: "Insufficient credits", balance: credits.balance, cost: 2 },
        { status: 402 },
      );
    }

    const { data: job, error: jobErr } = await admin
      .from("mait_scrape_jobs")
      .insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        status: "running",
        // Mark the source as "tiktok_ads" so the brand-detail "last
        // scan" badge can distinguish it from the organic TikTok
        // scan (`source: "tiktok"`). Same pattern as Meta vs Google.
        source: "tiktok_ads",
        date_from: date_from ?? null,
        date_to: date_to ?? null,
      })
      .select("id")
      .single();
    if (jobErr || !job) {
      await refundCredits(
        user.id,
        "scan_tiktok_ads",
        `TikTok Ads (DSA): ${competitor.page_name}`,
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
      const result = await scrapeTiktokAdsLibrary({
        brandName: competitor.page_name,
        advertiserId: competitor.tiktok_advertiser_id,
        region,
        dateFrom: date_from ? new Date(date_from) : undefined,
        dateTo: date_to ? new Date(date_to) : undefined,
        maxResults: max_results ?? 200,
        workspaceId: competitor.workspace_id,
      });

      // Abort checkpoint — same pattern as the other scan routes.
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_tiktok_ads",
          `TikTok Ads (DSA) aborted: ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          job_id: job.id,
          records: 0,
        });
      }

      // Mark cached comparisons stale.
      await admin
        .from("mait_comparisons")
        .update({ stale: true })
        .contains("competitor_ids", [competitor.id]);

      if (result.ads.length > 0) {
        const rows = result.ads.map((a) => ({
          ...a,
          workspace_id: competitor.workspace_id,
          competitor_id: competitor.id,
          last_seen_in_scan_at: new Date().toISOString(),
        }));
        const { error: upErr } = await admin
          .from("mait_tiktok_ads")
          .upsert(rows, { onConflict: "workspace_id,ad_id,source" });
        if (upErr) {
          console.error("[TikTokAds route] Library upsert error:", upErr);
          throw upErr;
        }
      }

      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          records_count: result.ads.length,
          cost_cu: result.costCu ?? 0,
          apify_run_id: result.runId ?? null,
          key_used: result.credentials?.keyRecordId ?? null,
          billing_mode_at_run: result.credentials?.billingMode ?? null,
        })
        .eq("id", job.id);

      await admin
        .from("mait_competitors")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", competitor.id);

      return NextResponse.json({
        ok: true,
        source: "library",
        job_id: job.id,
        records: result.ads.length,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "TikTok DSA scrape failed";
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
        "scan_tiktok_ads",
        `TikTok Ads (DSA) error: ${competitor.page_name}`,
      );
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Creative Center path ──────────────────────────────────────
  // Workspace-level scan. competitor_id is OPTIONAL — passing it
  // links the resulting rows to the brand for filtering on its
  // detail page; omitting it leaves them as workspace-wide market
  // intel (used by the planned "Trending TikTok ads" Monitoring
  // tool).
  const cc = parsed.data;

  // Resolve workspace_id either via the linked competitor or via
  // the user's profile. Either path produces the same workspace
  // scope for the upsert.
  let workspaceId: string;
  let competitorRow: { id: string; page_name: string; workspace_id: string } | null = null;

  if (cc.competitor_id) {
    const { data: c, error } = await supabase
      .from("mait_competitors")
      .select("id, page_name, workspace_id")
      .eq("id", cc.competitor_id)
      .single();
    if (error || !c) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }
    competitorRow = c;
    workspaceId = c.workspace_id;
  } else {
    const { data: profile } = await supabase
      .from("mait_users")
      .select("workspace_id")
      .eq("id", user.id)
      .single();
    if (!profile?.workspace_id) {
      return NextResponse.json({ error: "No workspace" }, { status: 400 });
    }
    workspaceId = profile.workspace_id;
  }

  const credits = await consumeCredits(
    user.id,
    "scan_tiktok_cc",
    `TikTok CC: ${cc.country ?? "global"} ${cc.industry ?? ""}`.trim(),
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 1 },
      { status: 402 },
    );
  }

  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: workspaceId,
      competitor_id: competitorRow?.id ?? null,
      status: "running",
      source: "tiktok_cc",
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    await refundCredits(
      user.id,
      "scan_tiktok_cc",
      "TikTok CC scan",
    );
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 },
    );
  }

  try {
    const result = await scrapeTiktokCreativeCenter({
      country: cc.country,
      industry: cc.industry as CcIndustry | undefined,
      objective: cc.objective as CcObjective | undefined,
      period: (cc.period as CcPeriod | undefined) ?? "30",
      adFormat: cc.ad_format as CcAdFormat | undefined,
      orderBy: cc.order_by as CcOrderBy | undefined,
      maxResults: cc.max_results ?? 20,
      workspaceId,
    });

    if (result.ads.length > 0) {
      const rows = result.ads.map((a) => ({
        ...a,
        workspace_id: workspaceId,
        competitor_id: competitorRow?.id ?? null,
        last_seen_in_scan_at: new Date().toISOString(),
      }));
      const { error: upErr } = await admin
        .from("mait_tiktok_ads")
        .upsert(rows, { onConflict: "workspace_id,ad_id,source" });
      if (upErr) {
        console.error("[TikTokAds route] CC upsert error:", upErr);
        throw upErr;
      }
    }

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.ads.length,
        cost_cu: result.costCu ?? 0,
        apify_run_id: result.runId ?? null,
        key_used: result.credentials?.keyRecordId ?? null,
        billing_mode_at_run: result.credentials?.billingMode ?? null,
      })
      .eq("id", job.id);

    if (competitorRow) {
      await admin
        .from("mait_competitors")
        .update({ last_scraped_at: new Date().toISOString() })
        .eq("id", competitorRow.id);
    }

    return NextResponse.json({
      ok: true,
      source: "creative_center",
      job_id: job.id,
      records: result.ads.length,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "TikTok CC scrape failed";
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
      "scan_tiktok_cc",
      "TikTok CC scan error",
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
