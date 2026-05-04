import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scrapeInstagramPosts,
  scrapeInstagramProfile,
  cleanInstagramUsername,
} from "@/lib/instagram/service";
import { storeAdImages, storeProfilePicture } from "@/lib/media/store-ad-images";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300; // seconds

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_posts: z.number().int().min(1).max(500).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    .select("id, workspace_id, page_name, instagram_username")
    .eq("id", parsed.data.competitor_id)
    .single();

  if (compErr || !competitor) {
    return NextResponse.json(
      { error: "Competitor not found" },
      { status: 404 }
    );
  }

  const admin = createAdminClient();

  // Stale-job cleanup + concurrency gate BEFORE charging credits.
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

  const credits = await consumeCredits(user.id, "scan_instagram", `Instagram scan: ${competitor.page_name}`);
  if (!credits.ok) {
    return NextResponse.json({ error: "Insufficient credits", balance: credits.balance, cost: 2 }, { status: 402 });
  }

  // Resolve instagram_username. If the stored value is a full URL or
  // "@handle" (legacy rows), normalize it and write the clean form back.
  let igUsername: string | null = competitor.instagram_username ?? null;
  if (igUsername) {
    const cleaned = cleanInstagramUsername(igUsername);
    if (cleaned && cleaned !== igUsername) {
      await admin
        .from("mait_competitors")
        .update({ instagram_username: cleaned })
        .eq("id", competitor.id);
      igUsername = cleaned;
    } else if (cleaned) {
      igUsername = cleaned;
    }
  }

  if (!igUsername) {
    // Try to extract from the most recent ad's raw_data
    const { data: latestAd } = await admin
      .from("mait_ads_external")
      .select("raw_data")
      .eq("competitor_id", competitor.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestAd?.raw_data) {
      const raw = latestAd.raw_data as Record<string, unknown>;
      const snapshot = raw.snapshot as Record<string, unknown> | undefined;
      igUsername =
        (raw.pageInstagramUser as string) ??
        (snapshot?.pageInstagramUser as string) ??
        null;
    }

    // Clean before persisting so we never store @handles or URLs
    igUsername = cleanInstagramUsername(igUsername);

    if (igUsername) {
      await admin
        .from("mait_competitors")
        .update({ instagram_username: igUsername })
        .eq("id", competitor.id);
    }
  }

  if (!igUsername) {
    // Refund credits since the scan cannot proceed
    await refundCredits(user.id, "scan_instagram", `Instagram scan: ${competitor.page_name}`);
    return NextResponse.json(
      {
        error:
          "Instagram username non trovato. Aggiungilo manualmente nel profilo del brand o lancia prima uno scan ads.",
      },
      { status: 400 }
    );
  }

  // Create job row (same pattern as Meta/Google scans). Persist the
  // requested window so /competitors can show the period covered by
  // the latest scan beneath the run date.
  const { data: job, error: jobErr } = await admin
    .from("mait_scrape_jobs")
    .insert({
      workspace_id: competitor.workspace_id,
      competitor_id: competitor.id,
      status: "running",
      source: "instagram",
      date_from: parsed.data.date_from ?? null,
      date_to: parsed.data.date_to ?? null,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    if ((jobErr as { code?: string } | null)?.code === "23505") {
      await refundCredits(
        user.id,
        "scan_instagram",
        `Instagram scan race-rejected: ${competitor.page_name}`,
      );
      return NextResponse.json({ error: "already_running" }, { status: 429 });
    }
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 }
    );
  }

  try {
    // Fetch posts and profile in parallel — profile gives us
    // followers/bio/etc to show alongside per-post stats.
    const [result, profile] = await Promise.all([
      scrapeInstagramPosts({
        username: igUsername,
        maxPosts: parsed.data.max_posts ?? 30,
        dateFrom: parsed.data.date_from,
        dateTo: parsed.data.date_to,
        workspaceId: competitor.workspace_id,
      }),
      scrapeInstagramProfile(igUsername, competitor.workspace_id),
    ]);

    // Abort checkpoint: user clicked Stop while Apify was still
    // returning. Skip every downstream side-effect (profile update,
    // comparison invalidation, posts upsert, success update) so
    // partial data never lands and the job row keeps the failed
    // state set by /api/apify/abort.
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_instagram",
          `Instagram scan aborted: ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          job_id: job.id,
          records: 0,
        });
      }
    }

    if (profile) {
      // Instagram CDN URLs for profile pics expire — download once and
      // replace with a permanent Supabase-hosted URL.
      if (profile.profilePicUrl) {
        const permanent = await storeProfilePicture(
          admin,
          competitor.workspace_id,
          `ig_${competitor.id}`,
          profile.profilePicUrl
        );
        if (permanent) {
          profile.profilePicUrl = permanent;
        } else {
          console.warn(
            `[Instagram scan] profile pic storage failed for ${competitor.page_name}, keeping CDN URL`
          );
        }
      } else {
        console.warn(
          `[Instagram scan] scrape returned no profilePicUrl for ${competitor.page_name}`
        );
      }
      await admin
        .from("mait_competitors")
        .update({ instagram_profile: profile })
        .eq("id", competitor.id);
    } else {
      console.warn(
        `[Instagram scan] profile scrape returned null for ${competitor.page_name}`
      );
    }

    // Any cached comparison containing this brand is now out of date
    // (new posts/profile data) — mark stale so the user sees the banner.
    await admin
      .from("mait_comparisons")
      .update({ stale: true })
      .contains("competitor_ids", [competitor.id]);

    // Download images to permanent storage, then upsert
    console.log(`[Instagram route] Scrape done: ${result.records.length} records, runId=${result.runId}`);
    if (result.records.length > 0) {
      // Map to storeAdImages format (expects ad_archive_id + image_url)
      const mediaRows = result.records.map((r) => ({
        ad_archive_id: r.post_id,
        image_url: r.display_url,
      }));
      await storeAdImages(admin, competitor.workspace_id, mediaRows, "instagram");

      // Apply stored URLs back to records
      const storedUrls = new Map(mediaRows.map((m) => [m.ad_archive_id, m.image_url]));
      const rows = result.records.map((r) => ({
        ...r,
        display_url: storedUrls.get(r.post_id) ?? r.display_url,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        platform: "instagram" as const,
      }));

      console.log(`[Instagram route] Upserting ${rows.length} posts...`);
      const { error: upErr } = await admin
        .from("mait_organic_posts")
        .upsert(rows, { onConflict: "workspace_id,platform,post_id" });
      if (upErr) {
        console.error(`[Instagram route] Upsert error:`, upErr);
        throw upErr;
      }
      console.log(`[Instagram route] Upsert OK`);
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
          "scan_instagram",
          `Instagram scan aborted (post-commit): ${competitor.page_name}`,
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
        key_used: result.credentials?.keyRecordId ?? null,
        billing_mode_at_run: result.credentials?.billingMode ?? null,
      })
      .eq("id", job.id);

    // Stamp last_scraped_at on the brand row — drives the
    // "freshness" pill on the brands list ("Today" / "3 days ago"
    // / "Never scanned"). Every other scan route (Meta, Google,
    // TikTok, Snapchat, YouTube) already does this; Instagram was
    // missing it and the brand card kept showing "Never scanned"
    // even after a successful run (user-flagged 2026-05-04).
    await admin
      .from("mait_competitors")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", competitor.id);

    // Create alert
    if (result.records.length > 0) {
      await admin.from("mait_alerts").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        type: "new_ads",
        message: `${result.records.length} post Instagram organici sincronizzati per ${competitor.page_name}.`,
      });
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.records.length,
      username: igUsername,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Instagram scrape failed";
    const billingCode =
      e && typeof e === "object" && "code" in (e as object)
        ? ((e as { code: unknown }).code as string)
        : null;
    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: message,
      })
      .eq("id", job.id);
    // Refund credits on failure
    await refundCredits(user.id, "scan_instagram", `Instagram scan: ${competitor.page_name}`);
    const httpStatus =
      billingCode === "MISSING_KEY" || billingCode === "INVALID_KEY" ? 400 : 500;
    return NextResponse.json({ error: message, code: billingCode }, { status: httpStatus });
  }
}
