import { createClient } from "@/lib/supabase/server";
import { ChannelTabs } from "./channel-tabs";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
} from "@/types";

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
  channelTotals,
  activeTotals,
  availableCountries,
  tab,
  statusFilter,
  countriesFilter,
}: {
  competitorId: string;
  /** Real DB-wide counts per channel (head+exact queries done in the
   *  parent page). The lazy ad/post lists are capped at 30 for
   *  performance, so the filter chips would otherwise display the
   *  loaded length (always 30) instead of the brand actual totals. */
  channelTotals: { meta: number; google: number; instagram: number; tiktok: number; snapchat: number };
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
  tab: "all" | "meta" | "google" | "instagram" | "tiktok" | "snapchat";
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
  else if (tab === "instagram" || tab === "tiktok" || tab === "snapchat")
    adsQuery = adsQuery.eq("source", "__none__");

  if (statusFilter === "active") adsQuery = adsQuery.eq("status", "ACTIVE");
  else if (statusFilter === "inactive") adsQuery = adsQuery.neq("status", "ACTIVE");

  if (countriesFilter.length > 0) {
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
  // Country filter on Google is a no-op in practice (Google ads
  // carry NULL scan_countries) but we still issue the predicate so
  // the count matches what the user sees on the all-tab grid.
  if (countriesFilter.length > 0) {
    googleCountQuery = googleCountQuery.overlaps("scan_countries", countriesFilter);
  }

  const [
    { data: ads },
    { data: organicPosts },
    { data: tiktokPosts },
    { data: snapchatProfiles },
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
    metaCountQuery,
    googleCountQuery,
  ]);

  const adsList = (ads ?? []) as MaitAdExternal[];
  const organicList = (organicPosts ?? []) as MaitOrganicPost[];
  const tiktokList = (tiktokPosts ?? []) as MaitTikTokPost[];
  const snapchatList = (snapchatProfiles ?? []) as MaitSnapchatProfile[];

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

  return (
    <ChannelTabs
      competitorId={competitorId}
      ads={adsList}
      organicPosts={organicList}
      tiktokPosts={tiktokList}
      snapchatProfiles={snapchatList}
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
    />
  );
}
