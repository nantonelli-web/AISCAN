import { createClient } from "@/lib/supabase/server";
import { ChannelTabs } from "./channel-tabs";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeChannel,
  MaitYoutubeVideo,
} from "@/types";

// ─── SERP brand-tab shapes (declared here, consumed by ChannelTabs) ──
interface BrandSerpQueryMeta {
  id: string;
  query: string;
  country: string;
  language: string;
  device: string;
  label: string | null;
  last_scraped_at: string | null;
}

interface BrandSerpRunSummary {
  id: string;
  query_id: string;
  scraped_at: string;
  organic_count: number;
  paid_count: number;
  paid_products_count: number;
  has_ai_overview: boolean;
}

interface BrandSerpMatch {
  run_id: string;
  query_id: string;
  result_type: string;
  position: number | null;
  url: string | null;
  title: string | null;
}

export interface BrandSerpQueryRank {
  query_id: string;
  query: string;
  country: string;
  language: string;
  device: string;
  label: string | null;
  last_scraped_at: string | null;
  run: BrandSerpRunSummary | null;
  best_organic_position: number | null;
  best_paid_position: number | null;
  organic_match_count: number;
  paid_match_count: number;
  top_match: BrandSerpMatch | null;
}

/**
 * The heavy half of the brand detail page — 30 ads + 30 organic
 * posts, each carrying full raw_data (50–200 KB on Meta). Lifted out
 * of /competitors/[id]/page.tsx into its own async server component
 * so it can stream behind a Suspense boundary while the lightweight
 * shell (hero, scan card, job history) renders immediately.
 *
 * Without this split, the user clicked a brand and stared at the
 * previous route until the entire heavy fetch + JSON serialization
 * + RSC payload finished. With it, the brand chrome paints almost
 * instantly and the channel grid fades in on its own timeline.
 *
 * Same query shape as the previous in-line fetch — no behaviour
 * change beyond when it lands.
 */
export async function BrandChannelsSection({
  competitorId,
  googleDomain,
  channelTotals,
  activeTotals,
  availableCountries,
  tab,
  statusFilter,
  countriesFilter,
}: {
  competitorId: string;
  /** Brand's normalized google_domain (eTLD+1) — drives the SERP rank
   *  match. null when the brand has no Google domain configured; the
   *  SERP tab is hidden in that case. */
  googleDomain: string | null;
  /** Real DB-wide counts per channel (head+exact queries done in the
   *  parent page). The lazy ad/post lists are capped at 30 for
   *  performance, so the filter chips would otherwise display the
   *  loaded length (always 30) instead of the brand actual totals. */
  channelTotals: {
    meta: number;
    google: number;
    instagram: number;
    tiktok: number;
    snapchat: number;
    youtube: number;
    youtubeChannelSnaps: number;
    serpQueries: number;
  };
  /** DB-wide active-only counts per source — drive the Status pill
   *  badge (Active / Inactive) so the row reflects the brand reality
   *  rather than the loaded sample. */
  activeTotals: { meta: number; google: number };
  /** Brand-wide country list, computed once in the page shell from
   *  every Meta ad we have for the brand. Stable across filter
   *  changes so the dropdown always offers every market. */
  availableCountries: { code: string; count: number; name: string }[];
  /** Active filters from the URL — drive the DB query so the 30-row
   *  cap operates AFTER filtering, not before. Without this the
   *  Country pill on a big brand showed "1 of 415" because the 30
   *  most-recent ads happened to have only one matching country. */
  tab: "all" | "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube" | "serp";
  statusFilter: "active" | "inactive" | null;
  countriesFilter: string[];
}) {
  const supabase = await createClient();

  // Build the ads query incrementally so each filter is applied at the
  // database. The 30-row cap is the LAST step, so we get the 30 most
  // recent ads MATCHING the filter set, not the 30 most recent overall.
  let adsQuery = supabase
    .from("mait_ads_external")
    .select(
      "id, workspace_id, competitor_id, ad_archive_id, headline, ad_text, cta, image_url, video_url, landing_url, platforms, status, start_date, end_date, created_at, raw_data, source, scan_countries",
    )
    .eq("competitor_id", competitorId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(30);

  // Channel filter: meta / google narrow source. Instagram does not
  // touch ads (organic posts are a separate table) — we still issue
  // the query so the React tree shape stays stable, but we narrow it
  // to a no-result set to skip the wire transfer.
  if (tab === "meta") adsQuery = adsQuery.eq("source", "meta");
  else if (tab === "google") adsQuery = adsQuery.eq("source", "google");
  else if (
    tab === "instagram" ||
    tab === "tiktok" ||
    tab === "snapchat" ||
    tab === "youtube" ||
    tab === "serp"
  )
    adsQuery = adsQuery.eq("source", "__none__");

  if (statusFilter === "active") adsQuery = adsQuery.eq("status", "ACTIVE");
  else if (statusFilter === "inactive") adsQuery = adsQuery.neq("status", "ACTIVE");

  // Country filter — only applied when the active tab is Meta or
  // "all". Google ads have scan_countries = NULL by design (the
  // Apify Google actor is not country-scoped), so applying the
  // overlap on the google tab dropped 100% of them. On the all tab
  // we still apply it because the Meta subset benefits and Google
  // rows are simply not affected (NULL never overlaps, but the user
  // sees them via the dedicated google count query below which
  // already skips this predicate).
  if (countriesFilter.length > 0 && tab !== "google") {
    adsQuery = adsQuery.overlaps("scan_countries", countriesFilter);
  }

  // Per-source filtered counts: feed the "(X of Y)" caption above
  // each grid section so Y reflects the active filters. Without
  // these, the caption would still show the brand-wide channel
  // total (e.g. "30 of 415" while the user is filtering by GB,
  // even though the GB-filtered total is 134).
  let metaCountQuery = supabase
    .from("mait_ads_external")
    .select("id", { count: "exact", head: true })
    .eq("competitor_id", competitorId)
    .eq("source", "meta");
  if (statusFilter === "active") metaCountQuery = metaCountQuery.eq("status", "ACTIVE");
  else if (statusFilter === "inactive") metaCountQuery = metaCountQuery.neq("status", "ACTIVE");
  if (countriesFilter.length > 0) {
    metaCountQuery = metaCountQuery.overlaps("scan_countries", countriesFilter);
  }
  let googleCountQuery = supabase
    .from("mait_ads_external")
    .select("id", { count: "exact", head: true })
    .eq("competitor_id", competitorId)
    .eq("source", "google");
  if (statusFilter === "active") googleCountQuery = googleCountQuery.eq("status", "ACTIVE");
  else if (statusFilter === "inactive") googleCountQuery = googleCountQuery.neq("status", "ACTIVE");
  // ⚠ Do NOT apply a country overlap on Google — Google ads carry
  // scan_countries = NULL (the Apify Google actor is not
  // country-scoped) and the predicate would silently drop 100% of
  // them. Country filter is intentionally a no-op on this channel.

  const [
    { data: ads },
    { data: organicPosts },
    { data: tiktokPosts },
    { data: snapchatProfiles },
    { data: youtubeChannelSnaps },
    { data: youtubeVideos },
    { count: metaFiltered },
    { count: googleFiltered },
  ] = await Promise.all([
    adsQuery,
    supabase
      .from("mait_organic_posts")
      .select(
        "id, workspace_id, competitor_id, platform, post_id, post_url, post_type, caption, display_url, video_url, likes_count, comments_count, shares_count, video_views, video_play_count, hashtags, mentions, tagged_users, posted_at, raw_data, created_at"
      )
      .eq("competitor_id", competitorId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase
      .from("mait_tiktok_posts")
      .select(
        "id, workspace_id, competitor_id, post_id, post_url, caption, text_language, cover_url, video_url, duration_seconds, is_slideshow, is_pinned, is_ad, is_sponsored, play_count, digg_count, share_count, comment_count, collect_count, music_id, music_name, music_author, music_original, hashtags, mentions, posted_at, raw_data, created_at"
      )
      .eq("competitor_id", competitorId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30),
    // Snapshot history: ordered most-recent-first so the brand-detail
    // tab can show the latest snapshot at the top and the trend below.
    // 30-row cap is generous — even daily scans for a year is ~365.
    supabase
      .from("mait_snapchat_profiles")
      .select(
        "id, workspace_id, competitor_id, username, display_name, profile_url, profile_type, business_profile_id, bio, website_url, category, subcategory, is_verified, address, profile_picture_url, snapcode_image_url, hero_image_url, subscriber_count, lens_count, highlight_count, spotlight_count, has_story, has_curated_highlights, has_spotlight_highlights, related_accounts, account_created_at, profile_updated_at, scraped_at, raw_data"
      )
      .eq("competitor_id", competitorId)
      .order("scraped_at", { ascending: false })
      .limit(30),
    // YouTube channel snapshots: same trend pattern as Snapchat.
    supabase
      .from("mait_youtube_channels")
      .select(
        "id, workspace_id, competitor_id, channel_id, channel_username, channel_url, input_channel_url, channel_name, channel_description, channel_location, avatar_url, banner_url, is_verified, is_age_restricted, subscriber_count, total_videos, total_views, description_links, channel_joined_at, scraped_at, raw_data"
      )
      .eq("competitor_id", competitorId)
      .order("scraped_at", { ascending: false })
      .limit(30),
    // YouTube videos: same per-post pattern as TikTok. Capped at 30
    // for the initial paint; expand later if we add a Load more.
    supabase
      .from("mait_youtube_videos")
      .select(
        "id, workspace_id, competitor_id, video_id, video_url, channel_id, title, description, thumbnail_url, type, duration_seconds, view_count, like_count, comment_count, posted_at, posted_relative, created_at, raw_data"
      )
      .eq("competitor_id", competitorId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30),
    metaCountQuery,
    googleCountQuery,
  ]);

  const adsList = (ads ?? []) as MaitAdExternal[];
  const organicList = (organicPosts ?? []) as MaitOrganicPost[];
  const tiktokList = (tiktokPosts ?? []) as MaitTikTokPost[];
  const snapchatList = (snapchatProfiles ?? []) as MaitSnapchatProfile[];
  const youtubeChannelList = (youtubeChannelSnaps ?? []) as MaitYoutubeChannel[];
  const youtubeVideoList = (youtubeVideos ?? []) as MaitYoutubeVideo[];

  // ─── SERP rank fetch ─────────────────────────────────────────
  // Three-step fetch (linked queries → latest run per query →
  // brand-matching results) so the SERP tab can render rankings
  // without N+1 round trips. Skipped entirely when the brand has
  // no google_domain (the tab itself is hidden in that case).
  const serpQueries: BrandSerpQueryRank[] = [];
  if (googleDomain && channelTotals.serpQueries > 0) {
    const { data: linkRows } = await supabase
      .from("mait_serp_query_brands")
      .select(
        "query_id, mait_serp_queries(id, query, country, language, device, label, last_scraped_at)",
      )
      .eq("competitor_id", competitorId);

    const queries = (linkRows ?? [])
      .map((r) => {
        const q = (r as { mait_serp_queries: unknown }).mait_serp_queries as
          | BrandSerpQueryMeta
          | BrandSerpQueryMeta[]
          | null;
        if (!q) return null;
        return Array.isArray(q) ? q[0] ?? null : q;
      })
      .filter((q): q is BrandSerpQueryMeta => !!q);

    if (queries.length > 0) {
      const queryIds = queries.map((q) => q.id);
      // Latest run per query — pull every run for these queries,
      // ordered most-recent-first, then take the first one we see
      // for each query_id.
      const { data: runRows } = await supabase
        .from("mait_serp_runs")
        .select(
          "id, query_id, scraped_at, organic_count, paid_count, paid_products_count, has_ai_overview",
        )
        .in("query_id", queryIds)
        .order("scraped_at", { ascending: false });

      const latestRunByQuery = new Map<string, BrandSerpRunSummary>();
      for (const r of (runRows ?? []) as BrandSerpRunSummary[]) {
        if (!latestRunByQuery.has(r.query_id)) {
          latestRunByQuery.set(r.query_id, r);
        }
      }

      // Brand-matching results across those latest runs — single
      // round trip with `in` on run_id + equality on the normalized
      // domain. Index `idx_mait_serp_results_domain` keeps it fast.
      const runIds = [...latestRunByQuery.values()].map((r) => r.id);
      const matchesByRun = new Map<string, BrandSerpMatch[]>();
      if (runIds.length > 0) {
        const { data: matchRows } = await supabase
          .from("mait_serp_results")
          .select("run_id, query_id, result_type, position, url, title")
          .in("run_id", runIds)
          .eq("normalized_domain", googleDomain);
        for (const m of (matchRows ?? []) as BrandSerpMatch[]) {
          const list = matchesByRun.get(m.run_id) ?? [];
          list.push(m);
          matchesByRun.set(m.run_id, list);
        }
      }

      // Fold queries + runs + matches into the shape the tab needs.
      for (const q of queries) {
        const run = latestRunByQuery.get(q.id) ?? null;
        const matches = run ? matchesByRun.get(run.id) ?? [] : [];
        const organicMatches = matches.filter(
          (m) => m.result_type === "organic",
        );
        const paidMatches = matches.filter(
          (m) =>
            m.result_type === "paid" || m.result_type === "paid_product",
        );
        const bestPos = (list: BrandSerpMatch[]) => {
          const positions = list
            .map((m) => m.position)
            .filter((n): n is number => typeof n === "number" && n > 0);
          return positions.length > 0 ? Math.min(...positions) : null;
        };
        serpQueries.push({
          query_id: q.id,
          query: q.query,
          country: q.country,
          language: q.language,
          device: q.device,
          label: q.label,
          last_scraped_at: q.last_scraped_at ?? run?.scraped_at ?? null,
          run,
          best_organic_position: bestPos(organicMatches),
          best_paid_position: bestPos(paidMatches),
          organic_match_count: organicMatches.length,
          paid_match_count: paidMatches.length,
          // Store the top match for inline rendering — title + URL
          // is enough to remind the user "you rank for X with this
          // page".
          top_match:
            organicMatches[0] ?? paidMatches[0] ?? null,
        });
      }

      // Sort: queries with a known organic rank first (best rank
      // ascending), then queries with only paid rank, then queries
      // with no match. Within each group, alphabetical.
      serpQueries.sort((a, b) => {
        const ao = a.best_organic_position ?? Infinity;
        const bo = b.best_organic_position ?? Infinity;
        if (ao !== bo) return ao - bo;
        const ap = a.best_paid_position ?? Infinity;
        const bp = b.best_paid_position ?? Infinity;
        if (ap !== bp) return ap - bp;
        return a.query.localeCompare(b.query);
      });
    }
  }

  // Organic engagement: Instagram returns -1 on accounts with hidden
  // likes — treat negatives as unknown so a brand with hidden likes
  // does not produce "-1" or 0-skewed averages.
  const validLikes = organicList
    .map((p) => p.likes_count ?? -1)
    .filter((n) => n >= 0);
  const validComments = organicList
    .map((p) => p.comments_count ?? -1)
    .filter((n) => n >= 0);
  const validViews = organicList
    .map((p) => p.video_views ?? -1)
    .filter((n) => n >= 0);
  const avgLikes =
    validLikes.length > 0
      ? Math.round(validLikes.reduce((s, n) => s + n, 0) / validLikes.length)
      : null;
  const avgComments =
    validComments.length > 0
      ? Math.round(validComments.reduce((s, n) => s + n, 0) / validComments.length)
      : null;
  const totalViews = validViews.reduce((s, n) => s + n, 0);

  // TikTok engagement averages — same defensive treatment as Instagram
  // (negative counters are treated as missing, not zero), even though
  // TikTok does not currently expose a "hidden likes" mode. Keeps the
  // shape symmetric with Instagram so any future actor that returns
  // -1 for hidden fields would not skew the averages.
  const ttValidPlays = tiktokList
    .map((p) => p.play_count ?? -1)
    .filter((n) => n >= 0);
  const ttValidLikes = tiktokList
    .map((p) => p.digg_count ?? -1)
    .filter((n) => n >= 0);
  const ttValidComments = tiktokList
    .map((p) => p.comment_count ?? -1)
    .filter((n) => n >= 0);
  const ttAvgLikes =
    ttValidLikes.length > 0
      ? Math.round(ttValidLikes.reduce((s, n) => s + n, 0) / ttValidLikes.length)
      : null;
  const ttAvgComments =
    ttValidComments.length > 0
      ? Math.round(ttValidComments.reduce((s, n) => s + n, 0) / ttValidComments.length)
      : null;
  const ttTotalViews = ttValidPlays.reduce((s, n) => s + n, 0);

  // YouTube engagement averages — same defensive treatment as TikTok
  // (negative counters are treated as missing). like_count and
  // comment_count are nullable on the actor (only populated with
  // video_details=true), so we filter to numeric values before
  // averaging.
  const ytValidLikes = youtubeVideoList
    .map((v) => (typeof v.like_count === "number" ? v.like_count : -1))
    .filter((n) => n >= 0);
  const ytValidComments = youtubeVideoList
    .map((v) => (typeof v.comment_count === "number" ? v.comment_count : -1))
    .filter((n) => n >= 0);
  const ytAvgLikes =
    ytValidLikes.length > 0
      ? Math.round(ytValidLikes.reduce((s, n) => s + n, 0) / ytValidLikes.length)
      : null;
  const ytAvgComments =
    ytValidComments.length > 0
      ? Math.round(ytValidComments.reduce((s, n) => s + n, 0) / ytValidComments.length)
      : null;
  const ytTotalViews = youtubeVideoList.reduce(
    (s, v) => s + (typeof v.view_count === "number" ? v.view_count : 0),
    0,
  );

  return (
    <ChannelTabs
      competitorId={competitorId}
      googleDomain={googleDomain}
      ads={adsList}
      organicPosts={organicList}
      tiktokPosts={tiktokList}
      snapchatProfiles={snapchatList}
      youtubeChannels={youtubeChannelList}
      youtubeVideos={youtubeVideoList}
      serpQueries={serpQueries}
      channelTotals={channelTotals}
      activeTotals={activeTotals}
      filteredTotals={{
        meta: metaFiltered ?? 0,
        google: googleFiltered ?? 0,
      }}
      availableCountries={availableCountries}
      tab={tab}
      statusFilter={statusFilter}
      countriesFilter={countriesFilter}
      organicStats={{
        count: organicList.length,
        avgLikes,
        avgComments,
        totalViews,
      }}
      tiktokStats={{
        count: tiktokList.length,
        avgLikes: ttAvgLikes,
        avgComments: ttAvgComments,
        totalViews: ttTotalViews,
      }}
      youtubeStats={{
        count: youtubeVideoList.length,
        avgLikes: ytAvgLikes,
        avgComments: ytAvgComments,
        totalViews: ytTotalViews,
      }}
    />
  );
}
