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
import { refundJobCreditOnce } from "@/lib/apify/batch-safety";
import { checkScanConcurrency } from "@/lib/rate-limit/scan-concurrency";
import { logger } from "@/lib/logger";

export const maxDuration = 300; // seconds

const schema = z.object({
  competitor_id: z.string().uuid(),
  max_videos: z.number().int().min(1).max(200).optional(),
  // Date range — YouTube actor doesn't filter server-side, so we
  // apply the window post-fetch and persist date_from/to on the
  // job row for consistency with the paid + Instagram chips.
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Batched flow flag, vedi /api/instagram/scan/route.ts
  batched: z.literal(true).optional(),
  job_id: z.string().uuid().optional(),
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

  // Batched flow: skip checks gia' fatti dal batch endpoint.
  const isBatched = !!parsed.data.batched && !!parsed.data.job_id;

  if (!isBatched) {
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
      return NextResponse.json({ error: rate.reason }, { status: rate.reason === "cost_cap" ? 402 : 429 });
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
    // Batched: mark the pre-created job failed BEFORE refunding so the
    // zombie cleanup can't refund it a second time.
    if (isBatched && parsed.data.job_id) {
      await admin
        .from("mait_scrape_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: "YouTube channel URL not configured",
        })
        .eq("id", parsed.data.job_id)
        .eq("status", "running");
    }
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

  // Job row: in batched flow viene da batch, altrimenti creiamo qui.
  let job: { id: string };
  if (isBatched) {
    job = { id: parsed.data.job_id as string };
  } else {
    const { data: jobIns, error: jobErr } = await admin
      .from("mait_scrape_jobs")
      .insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        status: "running",
        source: "youtube",
        date_from: parsed.data.date_from ?? null,
        date_to: parsed.data.date_to ?? null,
      })
      .select("id")
      .single();
    if (jobErr || !jobIns) {
      await refundCredits(
        user.id,
        "scan_youtube",
        `YouTube scan: ${competitor.page_name}`,
      );
      if ((jobErr as { code?: string } | null)?.code === "23505") {
        return NextResponse.json({ error: "already_running" }, { status: 429 });
      }
      return NextResponse.json(
        { error: jobErr?.message ?? "Job error" },
        { status: 500 },
      );
    }
    job = jobIns;
  }

  try {
    const result = await scrapeYouTubeChannel({
      channelUrl,
      maxVideos: parsed.data.max_videos ?? 30,
      workspaceId: competitor.workspace_id,
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
        await refundJobCreditOnce(admin, job.id, () =>
          refundCredits(
            user.id,
            "scan_youtube",
            `YouTube scan aborted: ${competitor.page_name}`,
          ),
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
        .update({
          youtube_profile: result.channel,
          // Last-writer-wins su profile_picture_url.
          ...(result.channel.avatar_url
            ? { profile_picture_url: result.channel.avatar_url }
            : {}),
        })
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
        logger.error(
          "channel snapshot error",
          {
            channel: "youtube/scan",
            event: "scan.channel_snapshot_failed",
            workspaceId: competitor.workspace_id,
            competitorId: competitor.id,
            userId: user.id,
            jobId: job.id,
          },
          snapErr,
        );
        throw snapErr;
      }

      // Snapshot unificato in mait_brand_metric_snapshots (migration
      // 0056). YouTube ha gia' la sua history in mait_youtube_channels
      // ma il channel-tabs UI consulta la tabella unificata per
      // calcolare i delta sui canali in modo coerente.
      await admin.from("mait_brand_metric_snapshots").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        channel: "youtube",
        followers_count: result.channel.subscriber_count ?? null,
        videos_count: result.channel.total_videos ?? null,
        views_count: result.channel.total_views ?? null,
        raw_metrics: result.channel as unknown as Record<string, unknown>,
      });
    }

    // Any cached comparison containing this brand is now out of date.
    await admin
      .from("mait_comparisons")
      .update({ stale: true })
      .contains("competitor_ids", [competitor.id]);

    logger.info(`scrape done: ${result.videos.length} videos`, {
      channel: "youtube/scan",
      event: "scan.scrape_done",
      workspaceId: competitor.workspace_id,
      competitorId: competitor.id,
      userId: user.id,
      jobId: job.id,
    });

    // Apply user-requested date window AFTER fetch (YouTube actor
    // has no server-side date filter — same approach as TikTok).
    // Drops videos with `posted_at` outside [date_from, date_to];
    // videos with no resolvable date are dropped only when a window
    // is requested (otherwise they pass through).
    const fromMs = parsed.data.date_from
      ? Date.parse(`${parsed.data.date_from}T00:00:00Z`)
      : null;
    const toMs = parsed.data.date_to
      ? Date.parse(`${parsed.data.date_to}T23:59:59Z`)
      : null;
    const filteredVideos = result.videos.filter((v) => {
      if (!fromMs && !toMs) return true;
      if (!v.posted_at) return false;
      const t = Date.parse(v.posted_at);
      if (Number.isNaN(t)) return false;
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
      return true;
    });

    if (filteredVideos.length > 0) {
      // Apify ha finito: stampa subito apify_run_id (prima del
      // salvataggio thumbnail, la parte lenta) cosi' il batch poll
      // mostra "Salvataggio immagini..." invece di far sembrare il job
      // impallato. Vedi instagram/scan per il razionale completo.
      await admin
        .from("mait_scrape_jobs")
        .update({ apify_run_id: result.runId ?? null })
        .eq("id", job.id);

      // Persist video thumbnails so the brand grid does not break
      // even if Google rotates the URL (it does, occasionally).
      const mediaRows = filteredVideos.map((v) => ({
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
      // Bumped on every upsert (anche sui video gia' esistenti) cosi'
      // il batch reconcile distingue una ri-scansione riuscita da un
      // job morto prima di salvare. Vedi mait_ads_external / 0057.
      const seenAt = new Date().toISOString();
      const rows = filteredVideos.map((v) => ({
        ...v,
        thumbnail_url: storedUrls.get(v.video_id) ?? v.thumbnail_url,
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        last_seen_in_scan_at: seenAt,
      }));

      const { error: upErr } = await admin
        .from("mait_youtube_videos")
        .upsert(rows, { onConflict: "workspace_id,video_id" });
      if (upErr) {
        logger.error(
          "videos upsert error",
          {
            channel: "youtube/scan",
            event: "scan.upsert_failed",
            workspaceId: competitor.workspace_id,
            competitorId: competitor.id,
            userId: user.id,
            jobId: job.id,
          },
          upErr,
        );
        throw upErr;
      }
      logger.debug("upsert OK", {
        channel: "youtube/scan",
        event: "scan.upsert_ok",
        workspaceId: competitor.workspace_id,
        competitorId: competitor.id,
        jobId: job.id,
      });
    }

    // Abort checkpoint #2: stop landed AFTER the upsert (rare race).
    {
      const { data: jobNow } = await admin
        .from("mait_scrape_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (jobNow?.status === "failed") {
        await refundJobCreditOnce(admin, job.id, () =>
          refundCredits(
            user.id,
            "scan_youtube",
            `YouTube scan aborted (post-commit): ${competitor.page_name}`,
          ),
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
        records_count: filteredVideos.length,
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

    if (filteredVideos.length > 0) {
      await admin.from("mait_alerts").insert({
        workspace_id: competitor.workspace_id,
        competitor_id: competitor.id,
        type: "new_ads",
        message: `${filteredVideos.length} video YouTube sincronizzati per ${competitor.page_name}.`,
      });
    }

    return NextResponse.json({
      ok: true,
      job_id: job.id,
      records: filteredVideos.length,
      channel_url: channelUrl,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "YouTube scrape failed";
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
    await refundJobCreditOnce(admin, job.id, () =>
      refundCredits(
        user.id,
        "scan_youtube",
        `YouTube scan: ${competitor.page_name}`,
      ),
    );
    const httpStatus =
      billingCode === "MISSING_KEY" || billingCode === "INVALID_KEY" ? 400 : 500;
    return NextResponse.json({ error: message, code: billingCode }, { status: httpStatus });
  }
}
