import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scrapeTikTokPosts,
  cleanTikTokUsername,
} from "@/lib/tiktok/service";
import { storeAdImages, storeProfilePicture } from "@/lib/media/store-ad-images";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300; // seconds

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_posts: z.number().int().min(1).max(200).optional(),
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
      { status: 503 },
    );
  }

  // Validate ownership via RLS read
  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select("id, workspace_id, page_name, tiktok_username, country")
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();

  // Stale-job cleanup + concurrency gate BEFORE charging credits.
  const tenMinAgoPre = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin
    .from("mait_scrape_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error: "Timeout (stale)",
    })
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

  const credits = await consumeCredits(
    user.id,
    "scan_tiktok",
    `TikTok scan: ${competitor.page_name}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 2 },
      { status: 402 },
    );
  }

  // Resolve tiktok_username, normalising legacy entries the same way the
  // Instagram scan does. If the stored value is a URL or @handle, save
  // the cleaned form back so future scans skip the cleanup.
  let ttUsername: string | null = competitor.tiktok_username ?? null;
  if (ttUsername) {
    const cleaned = cleanTikTokUsername(ttUsername);
    if (cleaned && cleaned !== ttUsername) {
      await admin
        .from("mait_competitors")
        .update({ tiktok_username: cleaned })
        .eq("id", competitor.id);
      ttUsername = cleaned;
    } else if (cleaned) {
      ttUsername = cleaned;
    } else {
      ttUsername = null;
    }
  }

  if (!ttUsername) {
    await refundCredits(
      user.id,
      "scan_tiktok",
      `TikTok scan: ${competitor.page_name}`,
    );
    return NextResponse.json(
      {
        error:
          "TikTok username non configurato per questo brand. Aggiungilo dal profilo del brand prima di lanciare lo scan.",
      },
      { status: 400 },
    );
  }

  // Create job row (same pattern as Meta/Google/Instagram). Date range
  // is recorded as null because the TikTok actor pulls the most recent
  // N posts without a date filter — the scan window is implicit.
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
      source: "tiktok",
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    await refundCredits(
      user.id,
      "scan_tiktok",
      `TikTok scan: ${competitor.page_name}`,
    );
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 },
    );
  }

  try {
    const result = await scrapeTikTokPosts({
      username: ttUsername,
      maxPosts: parsed.data.max_posts ?? 30,
      country: competitor.country ?? undefined,
    });

    // Abort checkpoint #1: user clicked Stop while Apify was still
    // returning. Skip every downstream side-effect so partial data
    // never lands and the job row keeps the failed state set by
    // /api/apify/abort. Mirrors the Instagram scan pattern.
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_tiktok",
          `TikTok scan aborted: ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          job_id: job.id,
          records: 0,
        });
      }
    }

    // Profile snapshot — store on the competitor row for the brand
    // header (followers, verified, bio). Avatar URL is on TikTok CDN
    // and expires; download once and replace with a permanent
    // Supabase URL (same trick as the Instagram pipeline).
    if (result.profile) {
      if (result.profile.avatarUrl) {
        const permanent = await storeProfilePicture(
          admin,
          competitor.workspace_id,
          `tt_${competitor.id}`,
          result.profile.avatarUrl,
        );
        if (permanent) {
          result.profile.avatarUrl = permanent;
        }
      }
      await admin
        .from("mait_competitors")
        .update({ tiktok_profile: result.profile })
        .eq("id", competitor.id);
    }

    // Any cached comparison containing this brand is now out of date —
    // mark stale so the user sees the banner.
    await admin
      .from("mait_comparisons")
      .update({ stale: true })
      .contains("competitor_ids", [competitor.id]);

    console.log(
      `[TikTok route] Scrape done: ${result.records.length} records, runId=${result.runId}`,
    );

    if (result.records.length > 0) {
      // Persist cover thumbnails to permanent storage. TikTok cover
      // URLs sit on tiktokcdn.com / .net with short signed TTLs, just
      // like fbcdn — without this the brand grid breaks within a day.
      const mediaRows = result.records.map((r) => ({
        ad_archive_id: r.post_id,
        image_url: r.cover_url,
      }));
      await storeAdImages(
        admin,
        competitor.workspace_id,
        mediaRows,
        // Using "instagram" as the subdir keeps the storage path
        // taxonomy minimal until we add a "tiktok" branch to the
        // bucket layout in storeAdImages. The function already
        // accepts an arbitrary string, so this works without changes.
        "instagram",
      );

      const storedUrls = new Map(
        mediaRows.map((m) => [m.ad_archive_id, m.image_url]),
      );
      const rows = result.records.map((r) => ({
        ...r,
        cover_url: storedUrls.get(r.post_id) ?? r.cover_url,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      }));

      const { error: upErr } = await admin
        .from("mait_tiktok_posts")
        .upsert(rows, { onConflict: "workspace_id,post_id" });
      if (upErr) {
        console.error(`[TikTok route] Upsert error:`, upErr);
        throw upErr;
      }
      console.log(`[TikTok route] Upsert OK`);
    }

    // Abort checkpoint #2: stop landed AFTER the upsert (rare race).
    // Partial data is in DB; we keep the job row honestly marked
    // failed/aborted instead of overwriting to succeeded.
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_tiktok",
          `TikTok scan aborted (post-commit): ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          partial_records: result.records.length,
          job_id: job.id,
        });
      }
    }

    // Update job as succeeded
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.records.length,
        cost_cu: result.costCu ?? 0,
        apify_run_id: result.runId ?? null,
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
        message: `${result.records.length} post TikTok sincronizzati per ${competitor.page_name}.`,
      });
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.records.length,
      username: ttUsername,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "TikTok scrape failed";
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
      "scan_tiktok",
      `TikTok scan: ${competitor.page_name}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
