import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TikTokPostCard } from "@/components/organic/tiktok-post-card";
import { SnapchatProfileCard } from "@/components/organic/snapchat-profile-card";
import { YoutubeVideoCard } from "@/components/organic/youtube-video-card";
import { Card, CardContent } from "@/components/ui/card";
import { LibraryFilters } from "./filters";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { getCompetitors } from "@/lib/library/cached-data";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeVideo,
} from "@/types";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  platform?: string;
  cta?: string;
  status?: string;
  format?: string;
  channel?: string;
  brand?: string;
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { profile } = await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const isInstagram = sp.channel === "instagram";
  const isTiktok = sp.channel === "tiktok";
  const isSnapchat = sp.channel === "snapchat";
  const isYoutube = sp.channel === "youtube";
  const isOrganic = isInstagram || isTiktok || isSnapchat || isYoutube;
  const workspaceId = profile.workspace_id!;

  // Build the main content query. Branches by channel because each
  // organic surface lives in its own table; ads live in
  // mait_ads_external (split by source). The "Monitoring → channel"
  // entry path lands here with sp.channel set, so every channel
  // must have a workspace-level branch.
  const buildContentQuery = () => {
    if (isInstagram) {
      let igQuery = supabase
        .from("mait_organic_posts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false })
        .limit(120);
      if (sp.brand) igQuery = igQuery.eq("competitor_id", sp.brand);
      if (sp.q && sp.q.trim().length > 0) {
        igQuery = igQuery.ilike("caption", `%${sp.q.trim()}%`);
      }
      return igQuery;
    }

    if (isTiktok) {
      let ttQuery = supabase
        .from("mait_tiktok_posts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(120);
      if (sp.brand) ttQuery = ttQuery.eq("competitor_id", sp.brand);
      if (sp.q && sp.q.trim().length > 0) {
        ttQuery = ttQuery.ilike("caption", `%${sp.q.trim()}%`);
      }
      return ttQuery;
    }

    if (isSnapchat) {
      // Snapshot history: every scan creates a row. For workspace
      // monitoring we list every snapshot ordered by scraped_at —
      // user filters by brand to focus on a single profile.
      let scQuery = supabase
        .from("mait_snapchat_profiles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("scraped_at", { ascending: false })
        .limit(60);
      if (sp.brand) scQuery = scQuery.eq("competitor_id", sp.brand);
      return scQuery;
    }

    if (isYoutube) {
      let ytQuery = supabase
        .from("mait_youtube_videos")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(120);
      if (sp.brand) ytQuery = ytQuery.eq("competitor_id", sp.brand);
      if (sp.q && sp.q.trim().length > 0) {
        ytQuery = ytQuery.or(
          `title.ilike.%${sp.q.trim()}%,description.ilike.%${sp.q.trim()}%`,
        );
      }
      return ytQuery;
    }

    let query = supabase
      .from("mait_ads_external")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(120);

    if (sp.q && sp.q.trim().length > 0) {
      const term = `%${sp.q.trim()}%`;
      query = query.or(
        `ad_text.ilike.${term},headline.ilike.${term},description.ilike.${term}`
      );
    }
    if (sp.channel === "meta") query = query.eq("source", "meta");
    if (sp.channel === "google") query = query.eq("source", "google");
    if (sp.brand) query = query.eq("competitor_id", sp.brand);
    if (sp.platform) query = query.contains("platforms", [sp.platform]);
    if (sp.cta) query = query.eq("cta", sp.cta);
    if (sp.status) query = query.eq("status", sp.status);
    if (sp.format === "video") query = query.not("video_url", "is", null);
    if (sp.format === "image")
      query = query.is("video_url", null).not("image_url", "is", null);
    return query;
  };

  // Competitors list is cached (revalidated on brand CRUD via tags).
  // Main content query runs in parallel. Facets are fetched lazily by the
  // client only when the advanced-filters panel opens.
  const [competitors, { data: contentData }] = await Promise.all([
    getCompetitors(workspaceId),
    buildContentQuery(),
  ]);

  const ads: MaitAdExternal[] = isOrganic ? [] : ((contentData ?? []) as MaitAdExternal[]);
  const organicPosts: MaitOrganicPost[] = isInstagram ? ((contentData ?? []) as MaitOrganicPost[]) : [];
  const tiktokPosts: MaitTikTokPost[] = isTiktok ? ((contentData ?? []) as MaitTikTokPost[]) : [];
  const snapchatProfiles: MaitSnapchatProfile[] = isSnapchat ? ((contentData ?? []) as MaitSnapchatProfile[]) : [];
  const youtubeVideos: MaitYoutubeVideo[] = isYoutube ? ((contentData ?? []) as MaitYoutubeVideo[]) : [];

  const totalResults = isInstagram
    ? organicPosts.length
    : isTiktok
      ? tiktokPosts.length
      : isSnapchat
        ? snapchatProfiles.length
        : isYoutube
          ? youtubeVideos.length
          : ads.length;

  // When no channel filter, split ads into Meta/Google sections for clarity
  const showSourceSections = !sp.channel && !isOrganic && ads.length > 0;
  const metaAds = showSourceSections ? ads.filter((a) => a.source === "meta") : [];
  const googleAds = showSourceSections ? ads.filter((a) => a.source === "google") : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif tracking-tight">{t("library", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("library", "subtitle")}
          </p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      <div className="print:hidden">
        <LibraryFilters
          initial={sp}
          competitors={competitors}
        />
      </div>

      {totalResults === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("library", "noAdsFiltered")}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {totalResults} {t("library", "resultsMax")}
          </p>
          {isInstagram ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {organicPosts.map((p) => (
                <OrganicPostCard key={p.id} post={p} />
              ))}
            </div>
          ) : isTiktok ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tiktokPosts.map((p) => (
                <TikTokPostCard key={p.id} post={p} />
              ))}
            </div>
          ) : isSnapchat ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {snapchatProfiles.map((p) => (
                <SnapchatProfileCard key={p.id} profile={p} />
              ))}
            </div>
          ) : isYoutube ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {youtubeVideos.map((v) => (
                <YoutubeVideoCard key={v.id} video={v} />
              ))}
            </div>
          ) : showSourceSections ? (
            <div className="space-y-8">
              {metaAds.length > 0 && (
                <AdSection title="Meta Ads" count={metaAds.length} ads={metaAds} />
              )}
              {googleAds.length > 0 && (
                <AdSection title="Google Ads" count={googleAds.length} ads={googleAds} />
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ads.map((a) => (
                <AdCard key={a.id} ad={a} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex justify-center pt-4 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}

function AdSection({
  title,
  count,
  ads,
}: {
  title: string;
  count: number;
  ads: MaitAdExternal[];
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3 pb-2 border-b border-border">
        <h2 className="text-sm font-medium text-gold uppercase tracking-wider">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ads.map((a) => (
          <AdCard key={a.id} ad={a} />
        ))}
      </div>
    </section>
  );
}
