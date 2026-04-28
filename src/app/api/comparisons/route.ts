import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inferObjective } from "@/lib/analytics/objective-inference";
import {
  classifyAdFormat,
  computeAdDurationDays,
  normalizeCtaLabel,
} from "@/lib/analytics/ad-shared";
import {
  analyzeCopy,
  analyzeVisuals,
  type BrandAdData,
} from "@/lib/ai/creative-analysis";
import { cleanInstagramUsername } from "@/lib/instagram/service";

export const maxDuration = 300;

/**
 * Bump this when the math/shape of `technical_data` changes so older
 * cached rows are recomputed instead of silently returning stale
 * numbers. The frontend treats `data_version < CURRENT_DATA_VERSION`
 * as a cache miss in fetchComparison.
 *
 * History:
 *   - v0: legacy rows (default before this column existed)
 *   - v1: country filter applied to technical stats SQL query
 *   - v2: shared duration / CTA / format helpers — sub-day campaigns
 *         now count as 1 day instead of being dropped, format mix
 *         uses the displayFormat-aware classifier
 *   - v3: latestAds payload includes video_url + ad_text so the
 *         Compare grid can render video creatives + text-only
 *         fallbacks instead of the empty "Ad" placeholder
 *   - v4: Advantage+ aggregate metric removed; BenchmarkData and
 *         BrandData totals no longer carry advantagePlusPercent
 *   - v5: country filter no longer dropped Google ads (which have
 *         NULL scan_countries by design); cached rows from v4 with a
 *         country filter set show 0 ads for Google brands and must
 *         regenerate
 */
const CURRENT_DATA_VERSION = 5;

/* ── Schemas ─────────────────────────────────────────────── */

const postSchema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(2).max(3),
  locale: z.enum(["it", "en"]).optional(),
  channel: z.enum(["all", "meta", "google", "instagram"]).optional().default("meta"),
  countries: z.array(z.string()).optional(),
  /** Optional ISO dates. When supplied, the refresh-rate / posts-per-week
   *  metrics use this window instead of the legacy fixed 90d. */
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sections: z
    .array(z.enum(["technical", "copy", "visual"]))
    .min(1)
    .optional()
    .default(["technical"]),
});

const deleteSchema = z.object({
  competitor_ids: z.array(z.string().uuid()).min(2).max(3),
  locale: z.enum(["it", "en"]).optional(),
});

/* ── Helpers ─────────────────────────────────────────────── */

/** Sort IDs to ensure consistent cache keys */
function sortedIds(ids: string[]): string[] {
  return [...ids].sort();
}

/** Resolve workspace_id from the current user */
async function getWorkspaceId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  return profile?.workspace_id ?? null;
}

/* ── Technical stats computation (same logic as /api/competitors/compare) ── */

type AdRow = {
  ad_archive_id: string;
  headline: string | null;
  ad_text: string | null;
  description: string | null;
  cta: string | null;
  image_url: string | null;
  video_url: string | null;
  platforms: string[] | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  raw_data: Record<string, unknown> | null;
};

async function computeTechnicalStats(
  ids: string[],
  admin: ReturnType<typeof createAdminClient>,
  source?: "meta" | "google",
  /** Window for the refresh-rate metric, in absolute milliseconds. The
   *  caller computes it from optional date_from/date_to (default 90d).
   *  When provided, the underlying ad query is also filtered to ads
   *  overlapping the window, so EVERY metric (totals, format mix, CTA,
   *  duration, ...) is scoped to the same range. */
  refreshRate?: { fromMs: number; toMs: number; weeks: number },
  /** ISO dates the SQL filter uses (must equal the bounds of `refreshRate`).
   *  Kept separate because PostgREST wants ISO strings, not ms. */
  dateFilter?: { from: string; to: string },
  /** ISO-2 country codes selected in the Compare UI. When provided,
   *  the underlying ad query is restricted to ads whose scan_countries
   *  overlap the selection — same contract as Benchmarks. */
  countriesFilter?: string[],
) {
  return Promise.all(
    ids.map(async (id) => {
      // Paginated walk — the previous .limit(500) gave the Compare view a
      // different sample from the Benchmarks view for brands with more
      // than 500 ads, so the two pages reported different top CTAs / top
      // platforms for the same brand. 5k safety cap matches the heavier
      // cap on the Benchmarks page.
      async function fetchAllAds(): Promise<AdRow[]> {
        const PAGE = 1000;
        const SAFETY_CAP = 5_000;
        const rows: AdRow[] = [];
        for (let from = 0; from < SAFETY_CAP; from += PAGE) {
          let q = admin
            .from("mait_ads_external")
            .select(
              "ad_archive_id, headline, ad_text, description, cta, image_url, video_url, platforms, status, start_date, end_date, created_at, raw_data"
            )
            .eq("competitor_id", id)
            // created_at alone is not unique (bulk upserts share the
            // same millisecond); ad_archive_id breaks ties so pagination
            // is deterministic and no row appears in two pages.
            .order("created_at", { ascending: false })
            .order("ad_archive_id", { ascending: false })
            .range(from, from + PAGE - 1);
          if (source) q = q.eq("source", source);
          // Same overlap predicate as benchmarks.ts: ad started on/before
          // dateTo AND (still active OR ended on/after dateFrom). This
          // keeps Compare and Benchmarks reading the same dataset for the
          // same window.
          if (dateFilter) {
            q = q.lte("start_date", dateFilter.to);
            q = q.or(
              `end_date.gte.${dateFilter.from},end_date.is.null,status.eq.ACTIVE`
            );
          }
          // Country overlap (PostgREST `.overlaps` → array && operator).
          // Ads with scan_countries=NULL never overlap and are dropped
          // when the user has narrowed the filter — same semantics as
          // the Benchmarks ad-level filter.
          //
          // ⚠ Google Ads have scan_countries = NULL by design (the
          // Google Ads Transparency API is not country-scoped, see
          // google-ads-service.ts normalize). Applying the overlap
          // would drop 100% of them, which is what caused the empty
          // Compare technical view on Google channel. Skip the
          // predicate when source==="google" so the country chip
          // becomes a no-op for that channel — Meta still honours
          // the filter as before.
          if (
            countriesFilter &&
            countriesFilter.length > 0 &&
            source !== "google"
          ) {
            q = q.overlaps("scan_countries", countriesFilter);
          }
          const { data, error } = await q;
          if (error || !data || data.length === 0) break;
          rows.push(...(data as AdRow[]));
          if (data.length < PAGE) break;
        }
        // Dedupe by ad_archive_id — belt-and-suspenders against any
        // page overlap that survives the tiebreaker.
        const seen = new Set<string>();
        const unique: AdRow[] = [];
        for (const r of rows) {
          if (!r.ad_archive_id || seen.has(r.ad_archive_id)) continue;
          seen.add(r.ad_archive_id);
          unique.push(r);
        }
        return unique;
      }

      const [{ data: comp }, adsList] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        fetchAllAds(),
      ]);
      const active = adsList.filter((a) => a.status === "ACTIVE");

      // Format mix — share the bucket logic with Benchmarks/Report.
      // The previous inline image_url/!video_url heuristic missed
      // carousel and DPA entirely, so the same brand was reported
      // with different format mixes across surfaces.
      let imageCount = 0;
      let videoCount = 0;
      for (const a of adsList) {
        const bucket = classifyAdFormat(a);
        if (bucket === "video") videoCount++;
        else if (bucket === "image") imageCount++;
        // carousel / dpa / unknown intentionally not surfaced on the
        // Compare technical card — only image vs video is rendered there.
      }

      // CTA counts — shared normalizer so case + separator variants
      // collapse identically to Benchmarks ("Shop Now" == "SHOP_NOW").
      const ctaMap = new Map<string, number>();
      for (const a of adsList) {
        if (!a.cta) continue;
        const key = normalizeCtaLabel(a.cta);
        if (!key) continue;
        ctaMap.set(key, (ctaMap.get(key) ?? 0) + 1);
      }
      const topCtas = [...ctaMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Platforms
      const platMap = new Map<string, number>();
      for (const a of adsList) {
        for (const p of a.platforms ?? []) {
          platMap.set(p, (platMap.get(p) ?? 0) + 1);
        }
      }
      const platforms = [...platMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      // Duration — shared helper clamps sub-day campaigns to 1 day
      // (was `if (days < 1) continue` which silently dropped them
      // and made avg duration disagree with Benchmarks).
      const durations: number[] = [];
      for (const a of adsList) {
        const days = computeAdDurationDays(a);
        if (days != null) durations.push(days);
      }
      const avgDuration =
        durations.length > 0
          ? Math.round(
              durations.reduce((a, b) => a + b, 0) / durations.length
            )
          : 0;

      // Copy length
      const lengths = adsList
        .map((a) => (a.ad_text ?? "").length)
        .filter((l) => l > 0);
      const avgCopyLength =
        lengths.length > 0
          ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
          : 0;

      // Refresh rate over the caller-supplied window (default 90d).
      // Driven by start_date (real Meta launch), not created_at (our DB
      // insert time). When the scraper recently imported a brand's
      // catalog, every row has created_at near "now" and falsely inflates
      // the rate. Ads without a start_date are skipped.
      const fromMs = refreshRate?.fromMs ?? Date.now() - 90 * 86_400_000;
      const toMs = refreshRate?.toMs ?? Date.now();
      const weeks = refreshRate?.weeks ?? 90 / 7;
      const recent = adsList.filter((a) => {
        if (!a.start_date) return false;
        const t = new Date(a.start_date).getTime();
        return Number.isFinite(t) && t >= fromMs && t <= toMs;
      }).length;
      const adsPerWeek = Math.round((recent / weeks) * 10) / 10;

      // Latest ads. Many Marina-style brands run video creatives where
      // image_url is null but video_url has the asset; without
      // exposing video_url here the Compare grid would fall back to
      // the empty "Ad" placeholder for every video. Carry both, plus
      // ad_text as a copy-only fallback for text-heavy creatives that
      // ship without any media.
      const latestAds = adsList
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )
        .slice(0, 5)
        .map((a) => ({
          headline: a.headline,
          image_url: a.image_url,
          video_url: a.video_url,
          ad_text: a.ad_text,
          ad_archive_id: a.ad_archive_id,
        }));

      // Infer campaign objective
      const objectiveInference = inferObjective(
        adsList.map((a) => a.raw_data)
      );

      return {
        id,
        name: comp?.page_name ?? "—",
        kind: "ads" as const,
        totalAds: adsList.length,
        activeAds: active.length,
        imageCount,
        videoCount,
        topCtas,
        platforms,
        avgDuration,
        avgCopyLength,
        adsPerWeek,
        latestAds,
        objectiveInference,
      };
    })
  );
}

/** Fetch brand ad data for AI analysis (latest 15 ads per brand) */
async function fetchBrandAdData(
  ids: string[],
  admin: ReturnType<typeof createAdminClient>
): Promise<BrandAdData[]> {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  return Promise.all(
    ids.map(async (id) => {
      const [{ data: comp }, { data: ads }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        admin
          .from("mait_ads_external")
          .select("headline, ad_text, description, cta, image_url")
          .eq("competitor_id", id)
          .gte("created_at", tenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      return {
        brandName: comp?.page_name ?? "Unknown",
        competitorId: id,
        ads: (ads ?? []) as {
          headline: string | null;
          ad_text: string | null;
          description: string | null;
          cta: string | null;
          image_url: string | null;
        }[],
      };
    })
  );
}

/* ── Organic (Instagram) technical stats ─────────────────── */

type OrganicRow = {
  post_id: string;
  post_url: string | null;
  post_type: string | null;
  caption: string | null;
  display_url: string | null;
  video_url: string | null;
  likes_count: number | null;
  comments_count: number | null;
  video_views: number | null;
  hashtags: string[] | null;
  posted_at: string | null;
  created_at: string;
};

async function computeOrganicStats(
  ids: string[],
  admin: ReturnType<typeof createAdminClient>,
  refreshRate?: { fromMs: number; toMs: number; weeks: number },
  /** Same as in computeTechnicalStats — filters the post query so every
   *  metric is scoped to the chosen window. */
  dateFilter?: { from: string; to: string },
) {
  return Promise.all(
    ids.map(async (id) => {
      const postsQuery = admin
        .from("mait_organic_posts")
        .select(
          "post_id, post_url, post_type, caption, display_url, video_url, likes_count, comments_count, video_views, hashtags, posted_at, created_at"
        )
        .eq("competitor_id", id)
        .eq("platform", "instagram")
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (dateFilter) {
        postsQuery
          .gte("posted_at", dateFilter.from)
          .lte("posted_at", dateFilter.to + "T23:59:59Z");
      }
      const [{ data: comp }, { data: posts }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name, instagram_username, instagram_profile")
          .eq("id", id)
          .single(),
        postsQuery,
      ]);

      const list = (posts ?? []) as OrganicRow[];

      // Format mix: distinguish image / video / reel
      let imageCount = 0;
      let videoCount = 0;
      let reelCount = 0;
      for (const p of list) {
        const t = (p.post_type ?? "").toLowerCase();
        if (t.includes("reel")) reelCount++;
        else if (p.video_url || t.includes("video")) videoCount++;
        else imageCount++;
      }

      // Engagement averages
      const likes = list.map((p) => p.likes_count ?? 0);
      const comments = list.map((p) => p.comments_count ?? 0);
      const views = list
        .map((p) => p.video_views ?? 0)
        .filter((v) => v > 0);
      const avg = (arr: number[]) =>
        arr.length === 0
          ? 0
          : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      const avgLikes = avg(likes);
      const avgComments = avg(comments);
      const avgViews = avg(views);

      // Top hashtags
      const tagMap = new Map<string, number>();
      for (const p of list) {
        for (const raw of p.hashtags ?? []) {
          const tag = raw.trim().toLowerCase();
          if (!tag) continue;
          tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
        }
      }
      const topHashtags = [...tagMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Caption length
      const captionLengths = list
        .map((p) => (p.caption ?? "").length)
        .filter((l) => l > 0);
      const avgCaptionLength =
        captionLengths.length > 0
          ? Math.round(
              captionLengths.reduce((a, b) => a + b, 0) / captionLengths.length
            )
          : 0;

      // Cadence (posts/week over the caller-supplied window, default 90d).
      // Use posted_at (real Instagram publish date); fall back to nothing
      // when it's missing. Previously a created_at fallback falsely
      // counted back-filled posts as "recent" right after a scan.
      const fromMs = refreshRate?.fromMs ?? Date.now() - 90 * 86_400_000;
      const toMs = refreshRate?.toMs ?? Date.now();
      const weeks = refreshRate?.weeks ?? 90 / 7;
      const recent = list.filter((p) => {
        if (!p.posted_at) return false;
        const when = new Date(p.posted_at).getTime();
        return Number.isFinite(when) && when >= fromMs && when <= toMs;
      }).length;
      const postsPerWeek = Math.round((recent / weeks) * 10) / 10;

      // Latest posts (5 most recent)
      const latestPosts = list.slice(0, 5).map((p) => ({
        post_id: p.post_id,
        caption: p.caption,
        display_url: p.display_url,
        post_url: p.post_url,
        likes: p.likes_count ?? 0,
        comments: p.comments_count ?? 0,
      }));

      // Legacy rows may store a full URL in instagram_username — clean
      // it server-side so the UI always gets a plain handle to display.
      const rawHandle = comp?.instagram_username ?? null;
      const cleanHandle = rawHandle ? cleanInstagramUsername(rawHandle) : null;
      // Legacy profiles may have "None,Brand" in businessCategoryName
      // because the cleanup was added after the first scans. Normalize
      // on read so existing rows display correctly.
      type RawProfile = {
        fullName: string | null;
        biography: string | null;
        followersCount: number | null;
        followsCount: number | null;
        postsCount: number | null;
        profilePicUrl: string | null;
        verified: boolean;
        businessCategoryName: string | null;
      } | null;
      const storedProfile = (comp?.instagram_profile ?? null) as RawProfile;
      const cleanedProfile: RawProfile = storedProfile
        ? {
            ...storedProfile,
            businessCategoryName: (() => {
              const raw = storedProfile.businessCategoryName;
              if (!raw) return null;
              const parts = raw
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s && s.toLowerCase() !== "none");
              return parts.length > 0 ? parts.join(" · ") : null;
            })(),
          }
        : null;
      return {
        id,
        name: comp?.page_name ?? "—",
        kind: "organic" as const,
        instagramUsername: cleanHandle ?? rawHandle,
        profile: cleanedProfile as {
          fullName: string | null;
          biography: string | null;
          followersCount: number | null;
          followsCount: number | null;
          postsCount: number | null;
          profilePicUrl: string | null;
          verified: boolean;
          businessCategoryName: string | null;
        } | null,
        totalPosts: list.length,
        imageCount,
        videoCount,
        reelCount,
        avgLikes,
        avgComments,
        avgViews,
        topHashtags,
        postsPerWeek,
        avgCaptionLength,
        latestPosts,
      };
    })
  );
}

/** Fetch brand organic-post data shaped as BrandAdData so the existing
 * AI analyzers can reuse the same pipeline on captions + display_urls. */
async function fetchBrandOrganicData(
  ids: string[],
  admin: ReturnType<typeof createAdminClient>
): Promise<BrandAdData[]> {
  return Promise.all(
    ids.map(async (id) => {
      const [{ data: comp }, { data: posts }] = await Promise.all([
        admin
          .from("mait_competitors")
          .select("id, page_name")
          .eq("id", id)
          .single(),
        admin
          .from("mait_organic_posts")
          .select("caption, display_url, hashtags")
          .eq("competitor_id", id)
          .eq("platform", "instagram")
          .order("posted_at", { ascending: false, nullsFirst: false })
          .limit(12),
      ]);

      const rows = (posts ?? []) as {
        caption: string | null;
        display_url: string | null;
        hashtags: string[] | null;
      }[];

      return {
        brandName: comp?.page_name ?? "Unknown",
        competitorId: id,
        ads: rows.map((p) => ({
          headline: null,
          ad_text: p.caption,
          description: (p.hashtags ?? []).slice(0, 10).map((h) => `#${h}`).join(" ") || null,
          cta: null,
          image_url: p.display_url,
        })),
      };
    })
  );
}

/* ── GET /api/comparisons?ids=X,Y,Z&locale=it ───────────── */

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const locale = url.searchParams.get("locale") ?? "it";

  if (!idsParam) {
    return NextResponse.json(
      { error: "Missing ids parameter" },
      { status: 400 }
    );
  }

  const ids = sortedIds(idsParam.split(",").filter(Boolean));
  if (ids.length < 2 || ids.length > 3) {
    return NextResponse.json(
      { error: "Provide 2-3 competitor IDs" },
      { status: 400 }
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mait_comparisons")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("locale", locale)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    current_data_version: CURRENT_DATA_VERSION,
  });
}

/* ── POST /api/comparisons ───────────────────────────────── */

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const ids = sortedIds(parsed.data.competitor_ids);
  const locale = parsed.data.locale ?? "it";
  const sections = parsed.data.sections;

  // Check if we already have a cached record to merge with
  const { data: existing } = await admin
    .from("mait_comparisons")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("locale", locale)
    .single();

  // Build update payload — only include countries if the client supplied
  // them, so follow-up POSTs for AI sections don't overwrite with [].
  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    competitor_ids: ids,
    locale,
    channel: parsed.data.channel,
    stale: false,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.countries !== undefined) {
    payload.countries = parsed.data.countries;
  }
  // Persist the window so the GET cache check can tell whether the
  // stored technical_data was computed for this exact range. NULL keeps
  // the legacy "no window → 90d default" semantics for old rows.
  payload.date_from = parsed.data.date_from ?? null;
  payload.date_to = parsed.data.date_to ?? null;
  // Stamp the schema/math version so any cache row written before a
  // formula change is automatically invalidated by the client.
  payload.data_version = CURRENT_DATA_VERSION;

  const isOrganic = parsed.data.channel === "instagram";

  // Refresh-rate window — same shape used in benchmarks.ts. Defaults to
  // a rolling 90d ending today when the caller does not supply dates.
  const refreshToMs = parsed.data.date_to
    ? new Date(parsed.data.date_to + "T23:59:59Z").getTime()
    : Date.now();
  const refreshFromMs = parsed.data.date_from
    ? new Date(parsed.data.date_from).getTime()
    : refreshToMs - 90 * 86_400_000;
  const refreshDays = Math.max(
    1,
    Math.round((refreshToMs - refreshFromMs) / 86_400_000),
  );
  const refreshWindow = {
    fromMs: refreshFromMs,
    toMs: refreshToMs,
    weeks: refreshDays / 7,
  };

  // Technical data — branch on channel. Instagram pulls from organic
  // posts and returns a differently-shaped record (kind: "organic").
  // dateFilter (when caller supplied dates) narrows the SQL queries so
  // every Compare metric — not just refresh rate — sees the same set
  // of ads/posts the user has windowed to.
  const dateFilter =
    parsed.data.date_from && parsed.data.date_to
      ? { from: parsed.data.date_from, to: parsed.data.date_to }
      : undefined;
  // Country filter: same overlap semantics as Benchmarks. Empty list
  // and undefined both mean "no narrowing"; an explicit subset of the
  // brand's configured countries restricts the ad query so the
  // Compare numbers reflect the user's selection.
  const countriesFilter =
    Array.isArray(parsed.data.countries) && parsed.data.countries.length > 0
      ? parsed.data.countries.map((c) => c.toUpperCase())
      : undefined;
  if (sections.includes("technical")) {
    if (isOrganic) {
      payload.technical_data = await computeOrganicStats(
        ids,
        admin,
        refreshWindow,
        dateFilter,
      );
    } else {
      const source = parsed.data.channel === "all"
        ? undefined
        : (parsed.data.channel as "meta" | "google");
      payload.technical_data = await computeTechnicalStats(
        ids,
        admin,
        source,
        refreshWindow,
        dateFilter,
        countriesFilter,
      );
    }
  }

  // AI sections (copy / visual) — fetch brand data once if needed.
  // For organic, captions + display_urls are mapped into the BrandAdData
  // shape so the same analyzers work unchanged.
  const needsAi = sections.includes("copy") || sections.includes("visual");
  if (needsAi) {
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY non configurato." },
        { status: 503 }
      );
    }
    const brands = isOrganic
      ? await fetchBrandOrganicData(ids, admin)
      : await fetchBrandAdData(ids, admin);
    const aiLocale = locale as "it" | "en";

    const aiTasks: Promise<void>[] = [];

    if (sections.includes("copy")) {
      aiTasks.push(
        analyzeCopy(brands, aiLocale).then((result) => {
          payload.copy_analysis = result;
        })
      );
    }

    if (sections.includes("visual")) {
      aiTasks.push(
        analyzeVisuals(brands, aiLocale).then((result) => {
          payload.visual_analysis = result;
        })
      );
    }

    await Promise.all(aiTasks);
  }

  // If the underlying content kind changed (ads ↔ organic) since we last
  // stored this comparison, any previously cached AI (copy/visual) refers
  // to the old content and must not leak. Compare by technical_data[0].kind
  // so we also catch legacy rows that have no channel column value.
  const existingKind: "ads" | "organic" = Array.isArray(existing?.technical_data)
    && (existing!.technical_data as Array<{ kind?: string }>)[0]?.kind === "organic"
    ? "organic"
    : "ads";
  const newKind: "ads" | "organic" = isOrganic ? "organic" : "ads";
  if (existing && existingKind !== newKind) {
    if (!sections.includes("copy")) payload.copy_analysis = null;
    if (!sections.includes("visual")) payload.visual_analysis = null;
  }

  // Upsert
  let result;
  if (existing) {
    // Merge: keep existing fields that we're not regenerating
    const merged = { ...existing, ...payload };
    const { data, error } = await admin
      .from("mait_comparisons")
      .update(merged)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      console.error("[api/comparisons]", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    result = data;
  } else {
    // Insert new
    payload.created_at = new Date().toISOString();
    const { data, error } = await admin
      .from("mait_comparisons")
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[api/comparisons]", error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    result = data;
  }

  // The window length is computed metadata, not stored in the
  // comparisons table — surface it on the response so the UI can
  // label "Refresh rate (Nd)" without re-deriving the window.
  return NextResponse.json({
    ...result,
    refresh_rate_window_days: refreshDays,
    current_data_version: CURRENT_DATA_VERSION,
  });
}

/* ── DELETE /api/comparisons ─────────────────────────────── */

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No workspace" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const ids = sortedIds(parsed.data.competitor_ids);
  const locale = parsed.data.locale ?? "it";

  await admin
    .from("mait_comparisons")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("competitor_ids", `{${ids.join(",")}}`)
    .eq("locale", locale);

  return NextResponse.json({ ok: true });
}
