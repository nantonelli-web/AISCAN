import { createClient } from "@/lib/supabase/server";
import { ChannelTabs } from "./channel-tabs";
import type { MaitAdExternal, MaitOrganicPost } from "@/types";

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
}: {
  competitorId: string;
}) {
  const supabase = await createClient();

  const [{ data: ads }, { data: organicPosts }] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select(
        "id, workspace_id, competitor_id, ad_archive_id, headline, ad_text, cta, image_url, video_url, landing_url, platforms, status, start_date, end_date, created_at, raw_data, source"
      )
      .eq("competitor_id", competitorId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase
      .from("mait_organic_posts")
      .select(
        "id, workspace_id, competitor_id, platform, post_id, post_url, post_type, caption, display_url, video_url, likes_count, comments_count, shares_count, video_views, video_play_count, hashtags, mentions, tagged_users, posted_at, raw_data, created_at"
      )
      .eq("competitor_id", competitorId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30),
  ]);

  const adsList = (ads ?? []) as MaitAdExternal[];
  const organicList = (organicPosts ?? []) as MaitOrganicPost[];

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

  return (
    <ChannelTabs
      competitorId={competitorId}
      ads={adsList}
      organicPosts={organicList}
      organicStats={{
        count: organicList.length,
        avgLikes,
        avgComments,
        totalViews,
      }}
    />
  );
}
