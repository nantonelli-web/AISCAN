import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Returns the competitor row + the last 10 scrape_jobs for a given
 * competitor id, so we can see exactly why a scan is silent / does
 * not update last_scraped_at.
 *
 * Common failure modes the response surfaces:
 *   - status = "running" with old started_at  → Lambda timed out or
 *     the orchestrator threw before reaching the success branch
 *   - status = "failed" + error                → Apify rejected the
 *     run or the actor exited non-SUCCEEDED
 *   - status = "succeeded" + records_count = 0 → Apify completed but
 *     returned an empty dataset (page_id wrong, page deleted, etc.)
 *
 * GET /api/competitors/scan-debug?id=<competitor_id>
 *   (param name is `id`, not `competitor_id` — historic naming)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const competitorId = url.searchParams.get("id");
    if (!competitorId) {
      return NextResponse.json(
        { error: "Missing ?id=<competitor_id>" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("mait_users")
      .select("workspace_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (
      !profile?.workspace_id ||
      !["super_admin", "admin"].includes(profile.role)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    const [{ data: competitor }, { data: jobs }] = await Promise.all([
      admin
        .from("mait_competitors")
        .select(
          "id, workspace_id, page_name, page_id, page_url, country, monitor_config, last_scraped_at, instagram_username, google_advertiser_id, google_domain, profile_picture_url, created_at",
        )
        .eq("id", competitorId)
        .eq("workspace_id", profile.workspace_id)
        .maybeSingle(),
      admin
        .from("mait_scrape_jobs")
        .select(
          "id, status, started_at, completed_at, records_count, cost_cu, error, apify_run_id, date_from, date_to",
        )
        .eq("workspace_id", profile.workspace_id)
        .eq("competitor_id", competitorId)
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found in this workspace" },
        { status: 404 },
      );
    }

    const now = Date.now();
    const annotatedJobs = (jobs ?? []).map((j) => {
      const startedAtMs = j.started_at ? new Date(j.started_at).getTime() : null;
      const ageMin =
        startedAtMs !== null
          ? Math.round((now - startedAtMs) / 60000)
          : null;
      const stuckRunning =
        j.status === "running" && ageMin !== null && ageMin > 10;
      return {
        ...j,
        ageMinutes: ageMin,
        likelyStuck: stuckRunning,
      };
    });

    const summary = {
      lastJob: annotatedJobs[0] ?? null,
      runningCount: annotatedJobs.filter((j) => j.status === "running").length,
      failedCount: annotatedJobs.filter((j) => j.status === "failed").length,
      succeededCount: annotatedJobs.filter((j) => j.status === "succeeded")
        .length,
      mostRecentSucceeded:
        annotatedJobs.find((j) => j.status === "succeeded") ?? null,
    };

    // ── DB-side stats on mait_ads_external ─────────────────────
    // Surfaces inflation that the records_count in the latest job
    // can't explain on its own — typically stale ACTIVE rows from
    // older scans whose start_date sits outside the most recent
    // scan window, so the reconcile pass never had a chance to
    // flip them to INACTIVE.
    const lastSucceeded = annotatedJobs.find((j) => j.status === "succeeded");
    const lastWindowFrom = lastSucceeded?.date_from ?? null;
    const wsId = profile.workspace_id;

    const [
      totalAdsRes,
      activeRes,
      metaRes,
      googleRes,
      staleRes,
      earliestRes,
      latestRes,
      countryRowsRes,
    ] = await Promise.all([
      admin
        .from("mait_ads_external")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId),
      admin
        .from("mait_ads_external")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("status", "ACTIVE"),
      admin
        .from("mait_ads_external")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("source", "meta"),
      admin
        .from("mait_ads_external")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("source", "google"),
      // The reconcile only flips ACTIVE→INACTIVE for rows whose
      // start_date is INSIDE the just-scanned window. Anything
      // older that is still ACTIVE means either the brand actually
      // ran a long-lived ad (legit) or the row is a zombie left
      // over from an older scan (the bug we are hunting).
      lastWindowFrom
        ? admin
            .from("mait_ads_external")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", wsId)
            .eq("competitor_id", competitorId)
            .eq("status", "ACTIVE")
            .lt("start_date", lastWindowFrom)
        : Promise.resolve({ count: null as number | null }),
      admin
        .from("mait_ads_external")
        .select("start_date")
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .not("start_date", "is", null)
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from("mait_ads_external")
        .select("start_date")
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .not("start_date", "is", null)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // scan_countries is meta-specific (Google ads carry no
      // per-country signal). Capped at 5000 rows so a runaway
      // brand cannot blow up the response payload.
      admin
        .from("mait_ads_external")
        .select("scan_countries")
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .not("scan_countries", "is", null)
        .limit(5000),
    ]);

    const totalAds = totalAdsRes.count ?? 0;
    const active = activeRes.count ?? 0;
    const inactive = Math.max(0, totalAds - active);

    const byCountry: Record<string, number> = {};
    for (const row of countryRowsRes.data ?? []) {
      const codes = (row as { scan_countries: string[] | null }).scan_countries;
      if (!Array.isArray(codes)) continue;
      for (const c of codes) {
        if (typeof c === "string" && c) {
          byCountry[c] = (byCountry[c] ?? 0) + 1;
        }
      }
    }

    const dbStats = {
      totalAds,
      active,
      inactive,
      bySource: {
        meta: metaRes.count ?? 0,
        google: googleRes.count ?? 0,
      },
      byCountry,
      earliestStart: earliestRes.data?.start_date ?? null,
      latestStart: latestRes.data?.start_date ?? null,
      // null when no successful scan exists — without a window we
      // cannot say whether an ACTIVE row is "outside" or not.
      staleActiveOutsideLastWindow:
        lastWindowFrom !== null ? (staleRes.count ?? 0) : null,
      lastSucceededWindowFrom: lastWindowFrom,
      countryRowsTruncated: (countryRowsRes.data?.length ?? 0) >= 5000,
    };

    // ── Media health: image / video / carousel diagnostics ──────
    // Surfaces three classes of broken creatives:
    //  - image_url is null → extraction failed at scrape time
    //  - image_url is on fbcdn (not Supabase) → storeAdImages did
    //    not run or failed; the URL will expire within hours/days
    //  - displayFormat=VIDEO but video_url is null → video field
    //    extraction failed (or actor changed shape)
    //
    // Light first pass: project only the columns we need across
    // every Meta ad (capped at 5000 rows) to compute aggregates.
    // Heavy second pass: pull a few full rows for each problem
    // bucket so the user can see exactly what raw_data looks like.
    const SAMPLE_CAP = 5000;
    const { data: lightRows } = await admin
      .from("mait_ads_external")
      .select(
        "id, image_url, video_url, status, displayFormat:raw_data->snapshot->>displayFormat",
      )
      .eq("workspace_id", wsId)
      .eq("competitor_id", competitorId)
      .eq("source", "meta")
      .limit(SAMPLE_CAP);

    type LightRow = {
      id: string;
      image_url: string | null;
      video_url: string | null;
      status: string | null;
      displayFormat: string | null;
    };
    const rows = (lightRows ?? []) as LightRow[];

    let imageWithSupabase = 0;
    let imageWithFbcdn = 0;
    let imageNull = 0;
    let imageOther = 0;
    let videosTotal = 0;
    let videosWithUrl = 0;
    const formatBreakdown: Record<string, number> = {};
    for (const r of rows) {
      // Image bucket
      if (!r.image_url) imageNull++;
      else if (r.image_url.includes("supabase.co/storage")) imageWithSupabase++;
      else if (
        r.image_url.includes("fbcdn.net") ||
        r.image_url.includes("cdninstagram.com") ||
        r.image_url.startsWith("https://scontent.")
      )
        imageWithFbcdn++;
      else imageOther++;
      // Video bucket
      const fmt = (r.displayFormat ?? "").toUpperCase();
      formatBreakdown[fmt || "(null)"] =
        (formatBreakdown[fmt || "(null)"] ?? 0) + 1;
      if (fmt === "VIDEO") {
        videosTotal++;
        if (r.video_url) videosWithUrl++;
      }
    }

    // Heavy samples: 5 rows in each problem bucket with full
    // raw_data so we can see exactly what came back from Apify.
    // Each query is keyed off a different problem; running them in
    // parallel keeps the latency tight.
    const SAMPLE_FIELDS =
      "id, ad_archive_id, headline, image_url, video_url, status, raw_data";
    const [
      { data: samplesNoImage },
      { data: samplesFbcdnImage },
      { data: samplesVideoNoUrl },
      { data: samplesCarousel },
    ] = await Promise.all([
      admin
        .from("mait_ads_external")
        .select(SAMPLE_FIELDS)
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("source", "meta")
        .is("image_url", null)
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("mait_ads_external")
        .select(SAMPLE_FIELDS)
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("source", "meta")
        .not("image_url", "is", null)
        .not("image_url", "ilike", "%supabase%")
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("mait_ads_external")
        .select(SAMPLE_FIELDS)
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("source", "meta")
        .filter("raw_data->snapshot->>displayFormat", "eq", "VIDEO")
        .is("video_url", null)
        .order("created_at", { ascending: false })
        .limit(5),
      // Carousel sample — the user reports some carousels also miss
      // images. These have displayFormat in {DPA, DCO, CAROUSEL}.
      // We pull samples regardless of image_url state so the user
      // can compare a healthy carousel with a broken one.
      admin
        .from("mait_ads_external")
        .select(SAMPLE_FIELDS)
        .eq("workspace_id", wsId)
        .eq("competitor_id", competitorId)
        .eq("source", "meta")
        .filter("raw_data->snapshot->>displayFormat", "in", "(DPA,DCO,CAROUSEL)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Slim the sample rows: raw_data is huge (50–200 KB each), but
    // for diagnosis we only need the subset that drives the UI's
    // image/video resolution. Project the JSON paths we care about
    // and drop the rest.
    type RawSample = {
      id: string;
      ad_archive_id: string | null;
      headline: string | null;
      image_url: string | null;
      video_url: string | null;
      status: string | null;
      raw_data: Record<string, unknown> | null;
    };
    function slim(row: RawSample) {
      const raw = (row.raw_data ?? {}) as Record<string, unknown>;
      const snapshot = (raw.snapshot ?? {}) as Record<string, unknown>;
      const cards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
      const images = Array.isArray(snapshot.images) ? snapshot.images : [];
      const videos = Array.isArray(snapshot.videos) ? snapshot.videos : [];
      const firstCard = (cards[0] ?? {}) as Record<string, unknown>;
      const firstImage = (images[0] ?? {}) as Record<string, unknown>;
      const firstVideo = (videos[0] ?? {}) as Record<string, unknown>;
      // Country-related field probe — exposes every path where Apify
      // could conceivably encode the "this ad is also served in
      // these other countries" signal. We dump them raw (no merge,
      // no fallback) so the user can see exactly what is populated
      // and what is null/missing on a real fresh sample. From this
      // we decide whether the "served also in" UI feature is
      // implementable with 100% confidence.
      const regulationData =
        (raw.regionalRegulationData as Record<string, unknown> | null) ?? null;
      const countrySignals = {
        // Top-level on the ad object — historically null per past
        // codebase observations but worth re-checking on every audit.
        targetedOrReachedCountries:
          (raw.targetedOrReachedCountries as unknown) ?? null,
        // Same field but inside snapshot — different actors put it here.
        snapshot_targetedOrReachedCountries:
          (snapshot.targetedOrReachedCountries as unknown) ?? null,
        // Country code on the ad header (usually the "this ad is from
        // a Page based in <country>" badge).
        snapshot_country: (snapshot.country as unknown) ?? null,
        // EU DSA regulation block — when populated, holds an array
        // of countries the ad was served in for legal transparency.
        regulationData_country:
          (regulationData?.country as unknown) ?? null,
        regulationData_finalLocation:
          (regulationData?.finalLocation as unknown) ?? null,
        // Some actor versions ship a flat `reachByCountry` list.
        reachByCountry: (raw.reachByCountry as unknown) ?? null,
        snapshot_reachByCountry:
          (snapshot.reachByCountry as unknown) ?? null,
        // The DSA-style age/country/gender breakdown contains country
        // codes too — extract just the unique country list as a quick
        // proxy for "where the ad was actually delivered".
        deliveryCountriesFromBreakdown: (() => {
          const arr = (raw.ageCountryGenderReachBreakdown ??
            raw.age_country_gender_reach_breakdown) as
            | Array<Record<string, unknown>>
            | null
            | undefined;
          if (!Array.isArray(arr)) return null;
          const codes = new Set<string>();
          for (const row of arr) {
            const c = (row?.country ?? row?.countryCode) as string | undefined;
            if (typeof c === "string" && c) codes.add(c);
          }
          return [...codes];
        })(),
      };
      return {
        id: row.id,
        ad_archive_id: row.ad_archive_id,
        headline: row.headline,
        status: row.status,
        image_url: row.image_url,
        video_url: row.video_url,
        displayFormat: snapshot.displayFormat ?? null,
        adSnapshotUrl: raw.adSnapshotUrl ?? null,
        countrySignals,
        snapshot: {
          cardCount: cards.length,
          imageCount: images.length,
          videoCount: videos.length,
          firstCardImage:
            (firstCard.originalImageUrl as string | null) ??
            (firstCard.resizedImageUrl as string | null) ??
            (firstCard.videoPreviewImageUrl as string | null) ??
            null,
          firstCardVideo:
            (firstCard.videoHdUrl as string | null) ??
            (firstCard.videoSdUrl as string | null) ??
            null,
          firstImageUrl:
            (firstImage.originalImageUrl as string | null) ??
            (firstImage.resizedImageUrl as string | null) ??
            null,
          firstVideoHd:
            (firstVideo.videoHdUrl as string | null) ?? null,
          firstVideoSd:
            (firstVideo.videoSdUrl as string | null) ?? null,
          firstVideoPreview:
            (firstVideo.videoPreviewImageUrl as string | null) ?? null,
        },
      };
    }

    const mediaHealth = {
      // Aggregates over up to SAMPLE_CAP Meta rows (truncated flag
      // tells the user when their brand exceeds the cap)
      sampledRows: rows.length,
      sampledTruncated: rows.length >= SAMPLE_CAP,
      imageHealth: {
        withSupabaseUrl: imageWithSupabase,
        withFbcdnUrl: imageWithFbcdn,
        withOtherUrl: imageOther,
        nullImageUrl: imageNull,
        // Broken = anything that is not a permanent Supabase URL.
        // fbcdn is the dominant case; "other" is hosts we have not
        // explicitly classified yet (worth investigating if non-zero).
        likelyBrokenPct:
          rows.length > 0
            ? Math.round(
                ((imageWithFbcdn + imageOther + imageNull) / rows.length) * 100,
              )
            : 0,
      },
      videoHealth: {
        videosTotal,
        videosWithUrl,
        videosWithoutUrl: videosTotal - videosWithUrl,
        // No videos are persisted — every video_url points at fbcdn
        // and expires within hours. The CSP fix unblocks playback;
        // permanent storage is still TODO if we want videos to last.
        note:
          "video_url points directly at fbcdn — expires after a few hours. CSP media-src fix lets fresh videos play; older ones may still 404 from CDN.",
      },
      formatBreakdown,
      samples: {
        withoutImage: (samplesNoImage as RawSample[] | null)?.map(slim) ?? [],
        withFbcdnImage:
          (samplesFbcdnImage as RawSample[] | null)?.map(slim) ?? [],
        videoFormatNoUrl:
          (samplesVideoNoUrl as RawSample[] | null)?.map(slim) ?? [],
        carousel: (samplesCarousel as RawSample[] | null)?.map(slim) ?? [],
      },
    };

    return NextResponse.json({
      ok: true,
      competitor,
      summary,
      dbStats,
      mediaHealth,
      jobs: annotatedJobs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[scan-debug]", e);
    return NextResponse.json(
      { error: "Server error", detail: message },
      { status: 500 },
    );
  }
}
