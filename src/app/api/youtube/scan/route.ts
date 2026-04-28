import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scrapeYouTubeChannel,
  cleanYouTubeChannelUrl,
} from "@/lib/youtube/service";
import { storeAdImages, storeProfilePicture } from "@/lib/media/store-ad-images";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";

export const maxDuration = 300; // seconds

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_videos: z.number().int().min(1).max(200).optional(),
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

  const { data: competitor, error: compErr } = await supabase
    .from("mait_competitors")
    .select("id, workspace_id, page_name, youtube_channel_url")
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
    "scan_youtube",
    `YouTube scan: ${competitor.page_name}`,
  );
  if (!credits.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credits.balance, cost: 1 },
      { status: 402 },
    );
  }

  // Resolve youtube_channel_url, normalising legacy entries the same
  // way the Instagram/TikTok/Snapchat scans do.
  let channelUrl: string | null = competitor.youtube_channel_url ?? null;
  if (channelUrl) {
    const cleaned = cleanYouTubeChannelUrl(channelUrl);
    if (cleaned && cleaned !== channelUrl) {
      await admin
        .from("mait_competitors")
        .update({ youtube_channel_url: cleaned })
        .eq("id", competitor.id);
      channelUrl = cleaned;
    } else if (cleaned) {
      channelUrl = cleaned;
    } else {
      channelUrl = null;
    }
  }

  if (!channelUrl) {
    await refundCredits(
      user.id,
      "scan_youtube",
      `YouTube scan: ${competitor.page_name}`,
    );
    return NextResponse.json(
      {
        error:
          "URL canale YouTube non configurato per questo brand. Aggiungilo dal profilo del brand prima di lanciare lo scan.",
      },
      { status: 400 },
    );
  }

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
    await refundCredits(
      user.id,
      "scan_youtube",
      `YouTube scan: ${competitor.page_name}`,
    );
    return NextResponse.json(
      { error: jobErr?.message ?? "Job error" },
      { status: 500 },
    );
  }

  try {
    const result = await scrapeYouTubeChannel({
      channelUrl,
      maxVideos: parsed.data.max_videos ?? 30,
    });

    // Abort checkpoint #1: user clicked Stop while Apify was still
    // running. Skip every downstream side-effect.
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_youtube",
          `YouTube scan aborted: ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          job_id: job.id,
          records: 0,
        });
      }
    }

    // Channel snapshot — store on the competitor row for the brand
    // header (subscribers, banner, verification). Avatar + banner
    // sit on yt3.googleusercontent.com which is generally stable, but
    // we permanent them anyway so the brand grid does not depend on
    // Google's CDN being hot.
    if (result.channel) {
      if (result.channel.avatar_url) {
        const permanent = await storeProfilePicture(
          admin,
          competitor.workspace_id,
          `yt_${competitor.id}`,
          result.channel.avatar_url,
        );
        if (permanent) {
          result.channel.avatar_url = permanent;
        }
      }
      if (result.channel.banner_url) {
        const permanentBanner = await storeProfilePicture(
          admin,
          competitor.workspace_id,
          `yt_banner_${competitor.id}`,
          result.channel.banner_url,
        );
        if (permanentBanner) {
          result.channel.banner_url = permanentBanner;
        }
      }
      await admin
        .from("mait_competitors")
        .update({ youtube_profile: result.channel })
        .eq("id", competitor.id);

      // Append a row to the snapshot history table — one row per
      // scan, never an upsert. Same trend pattern as Snapchat.
      const { error: snapErr } = await admin
        .from("mait_youtube_channels")
        .insert({
          ...result.channel,
          workspace_id: competitor.workspace_id,
          competitor_id: competitor.id,
        });
      if (snapErr) {
        console.error(`[YouTube route] Channel snapshot error:`, snapErr);
        throw snapErr;
      }
    }

    // Any cached comparison containing this brand is now out of date.
    await admin
      .from("mait_comparisons")
      .update({ stale: true })
      .contains("competitor_ids", [competitor.id]);

    console.log(
      `[YouTube route] Scrape done: ${result.videos.length} videos, runId=${result.runId}`,
    );

    if (result.videos.length > 0) {
      // Persist video thumbnails so the brand grid does not break
      // even if Google rotates the URL (it does, occasionally).
      const mediaRows = result.videos.map((v) => ({
        ad_archive_id: v.video_id,
        image_url: v.thumbnail_url ?? "",
      }));
      await storeAdImages(
        admin,
        competitor.workspace_id,
        mediaRows,
        // Reuse the "instagram" subdir for the same reason as the
        // TikTok scan: the storage layout already accepts arbitrary
        // strings; no need for a "youtube" branch yet.
        "instagram",
      );

      const storedUrls = new Map(
        mediaRows.map((m) => [m.ad_archive_id, m.image_url]),
      );
      const rows = result.videos.map((v) => ({
        ...v,
        thumbnail_url: storedUrls.get(v.video_id) ?? v.thumbnail_url,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
      }));

      const { error: upErr } = await admin
        .from("mait_youtube_videos")
        .upsert(rows, { onConflict: "workspace_id,video_id" });
      if (upErr) {
        console.error(`[YouTube route] Upsert error:`, upErr);
        throw upErr;
      }
      console.log(`[YouTube route] Upsert OK`);
    }

    // Abort checkpoint #2: stop landed AFTER the upsert (rare race).
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundCredits(
          user.id,
          "scan_youtube",
          `YouTube scan aborted (post-commit): ${competitor.page_name}`,
        );
        return NextResponse.json({
          ok: false,
          aborted: true,
          partial_records: result.videos.length,
          job_id: job.id,
        });
      }
    }

    await admin
      .from("mait_scrape_jobs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        records_count: result.videos.length,
        cost_cu: result.costCu ?? 0,
        apify_run_id: result.runId ?? null,
      })
      .eq("id", job.id);

    await admin
      .from("mait_competitors")
      .update({ last_scraped_at: new Date().toISOString() })
      .eq("id", competitor.id);

    if (result.videos.length > 0) {
      await admin.from("mait_alerts").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        type: "new_ads",
        message: `${result.videos.length} video YouTube sincronizzati per ${competitor.page_name}.`,
      });
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: result.videos.length,
      channel_url: channelUrl,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "YouTube scrape failed";
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
      "scan_youtube",
      `YouTube scan: ${competitor.page_name}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
