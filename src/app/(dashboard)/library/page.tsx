import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TikTokPostCard } from "@/components/organic/tiktok-post-card";
import { SnapchatProfileCard } from "@/components/organic/snapchat-profile-card";
import { YoutubeVideoCard } from "@/components/organic/youtube-video-card";
import { Card, CardContent } from "@/components/ui/card";
import { LibraryFilters } from "./filters";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";
import { getCompetitors } from "@/lib/library/cached-data";
import type {
  MaitAdExternal,
  MaitOrganicPost,
  MaitTikTokPost,
  MaitSnapchatProfile,
  MaitYoutubeVideo,
  MaitClient,
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
  client?: string;
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
  const admin = createAdminClient();
  // Clients (projects) are needed both for the filter dropdown
  // and for resolving the project → brand list when the user
  // narrows by project. Loaded in parallel with everything else.
  const clientsPromise = admin
    .from("mait_clients")
    .select("id, name, color, workspace_id")
    .eq("workspace_id", workspaceId)
    .order("name");

  // Fetch competitors + clients first (both are small and cached
  // when possible) so the project → brand resolution can run
  // before the content query is built. This adds at most one
  // round-trip vs the previous parallel layout but lets the
  // ads query bake in the project filter as a server-side
  // `.in("competitor_id", projectBrandIds)` instead of a JS
  // post-filter that would have to fetch a wider page first.
  const [competitors, { data: clientsData }] = await Promise.all([
    getCompetitors(workspaceId),
    clientsPromise,
  ]);

  const clients = (clientsData ?? []) as MaitClient[];
  // Project (client) filter resolution. When sp.client is set,
  // resolve to the array of competitor_ids belonging to that
  // project. "unassigned" is a sentinel for brands without a
  // client_id. When NO brands match the project (empty workspace
  // for that client), we still emit the filter so the query
  // returns 0 rows — better than silently widening to all brands.
  const projectBrandIds: string[] | null = sp.client
    ? competitors
        .filter((c) =>
          sp.client === "unassigned"
            ? c.client_id === null
            : c.client_id === sp.client,
        )
        .map((c) => c.id)
    : null;

  // Build the main content query. Branches by channel because each
  // organic surface lives in its own table; ads live in
  // mait_ads_external (split by source). The "Monitoring → channel"
  // entry path lands here with sp.channel set, so every channel
  // must have a workspace-level branch.
  const applyProject = <T extends { in: (col: string, vals: string[]) => T; eq: (col: string, val: string) => T }>(q: T): T => {
    // Brand-level filter takes precedence — when the user has
    // picked a single brand, the project filter is implied.
    if (sp.brand) return q.eq("competitor_id", sp.brand);
    if (projectBrandIds) {
      // Empty array → return query that matches nothing; using
      // .in() with [] is illegal in PostgREST so we substitute
      // a sentinel UUID that can't exist.
      const ids = projectBrandIds.length > 0 ? projectBrandIds : ["00000000-0000-0000-0000-000000000000"];
      return q.in("competitor_id", ids);
    }
    return q;
  };

  const buildContentQuery = () => {
    if (isInstagram) {
      let igQuery = supabase
        .from("mait_organic_posts")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false })
        .limit(120);
      igQuery = applyProject(igQuery);
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
      ttQuery = applyProject(ttQuery);
      if (sp.q && sp.q.trim().length > 0) {
        ttQuery = ttQuery.ilike("caption", `%${sp.q.trim()}%`);
      }
      return ttQuery;
    }

    if (isSnapchat) {
      let scQuery = supabase
        .from("mait_snapchat_profiles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("scraped_at", { ascending: false })
        .limit(60);
      scQuery = applyProject(scQuery);
      return scQuery;
    }

    if (isYoutube) {
      let ytQuery = supabase
        .from("mait_youtube_videos")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(120);
      ytQuery = applyProject(ytQuery);
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
    query = applyProject(query);
    if (sp.platform) query = query.contains("platforms", [sp.platform]);
    if (sp.cta) query = query.eq("cta", sp.cta);
    if (sp.status) query = query.eq("status", sp.status);
    if (sp.format === "video") query = query.not("video_url", "is", null);
    if (sp.format === "image")
      query = query.is("video_url", null).not("image_url", "is", null);
    return query;
  };

  const { data: contentData } = await buildContentQuery();

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

  // Brand attribution: when the user has NOT narrowed the list to a
  // single brand the cards mix items from many brands and the user
  // legitimately needs to know which brand each card belongs to.
  // When brand filter is active we hide the label (it would be
  // identical on every card and therefore noise).
  const showBrandLabel = !sp.brand;
  const brandNameById = new Map(competitors.map((c) => [c.id, c.page_name]));

  return (
    <div className="space-y-6">
      {/* Dynamic back link — Library is reachable from the sidebar,
          from per-brand "all ads" links, and from Compare / report
          drill-downs. Hard-coding a single fallback would mis-route
          users coming from those flows; the smart back honours the
          referrer when same-origin and falls through to /brands
          (the most common origin) otherwise. */}
      <DynamicBackLink fallbackHref="/brands" label={t("library", "backLabel")} />
      {/* Page header — promoted to a 3xl serif title with a real
          eyebrow so the section is unmissable. Prior version used
          text-2xl flush against the filters and the user couldn't
          tell where the page header ended and the filters began. */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {t("library", "title").toUpperCase()}
          </p>
          <h1 className="text-3xl font-serif tracking-tight">{t("library", "title")}</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {t("library", "subtitle")}
          </p>
        </div>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      <div className="print:hidden">
        <LibraryFilters
          initial={sp}
          competitors={competitors}
          clients={clients}
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
          {/* Result count — bare "{N} risultati" without the
              "(max 120)" qualifier the user flagged as noise. */}
          <p className="text-base text-foreground flex items-baseline gap-2">
            <span className="font-semibold tabular-nums">{totalResults}</span>
            <span className="text-muted-foreground">{t("library", "resultsLabel")}</span>
          </p>
          {isInstagram ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {organicPosts.map((p) => (
                <BrandFramedItem
                  key={p.id}
                  brandName={
                    showBrandLabel ? brandNameById.get(p.competitor_id ?? "") ?? null : null
                  }
                >
                  <OrganicPostCard post={p} />
                </BrandFramedItem>
              ))}
            </div>
          ) : isTiktok ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tiktokPosts.map((p) => (
                <BrandFramedItem
                  key={p.id}
                  brandName={
                    showBrandLabel ? brandNameById.get(p.competitor_id ?? "") ?? null : null
                  }
                >
                  <TikTokPostCard post={p} />
                </BrandFramedItem>
              ))}
            </div>
          ) : isSnapchat ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {snapchatProfiles.map((p) => (
                <BrandFramedItem
                  key={p.id}
                  brandName={
                    showBrandLabel ? brandNameById.get(p.competitor_id ?? "") ?? null : null
                  }
                >
                  <SnapchatProfileCard profile={p} />
                </BrandFramedItem>
              ))}
            </div>
          ) : isYoutube ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {youtubeVideos.map((v) => (
                <BrandFramedItem
                  key={v.id}
                  brandName={
                    showBrandLabel ? brandNameById.get(v.competitor_id ?? "") ?? null : null
                  }
                >
                  <YoutubeVideoCard video={v} />
                </BrandFramedItem>
              ))}
            </div>
          ) : showSourceSections ? (
            <div className="space-y-8">
              {metaAds.length > 0 && (
                <AdSection
                  title="Meta Ads"
                  count={metaAds.length}
                  ads={metaAds}
                  brandNameById={showBrandLabel ? brandNameById : null}
                />
              )}
              {googleAds.length > 0 && (
                <AdSection
                  title="Google Ads"
                  count={googleAds.length}
                  ads={googleAds}
                  brandNameById={showBrandLabel ? brandNameById : null}
                />
              )}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ads.map((a) => (
                <BrandFramedItem
                  key={a.id}
                  brandName={
                    showBrandLabel ? brandNameById.get(a.competitor_id ?? "") ?? null : null
                  }
                >
                  <AdCard ad={a} />
                </BrandFramedItem>
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
  brandNameById,
}: {
  title: string;
  count: number;
  ads: MaitAdExternal[];
  /** When non-null, render the brand attribution above each card.
   *  Null means brand filter is active so the label would just be
   *  noise. */
  brandNameById: Map<string, string> | null;
}) {
  return (
    <section className="space-y-4">
      {/* Section header — bigger title weight than the previous
          text-sm uppercase row so the section break is unmissable.
          Channel-coded rail accent removed; the explicit "Meta Ads"
          / "Google Ads" h2 already names the channel. */}
      <header className="rounded-md bg-muted/20 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {count} ads
          </span>
        </div>
      </header>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ads.map((a) => (
          <BrandFramedItem
            key={a.id}
            brandName={brandNameById ? brandNameById.get(a.competitor_id ?? "") ?? null : null}
          >
            <AdCard ad={a} />
          </BrandFramedItem>
        ))}
      </div>
    </section>
  );
}

/** Wraps a Library card with a small brand attribution row above it.
 *  When brandName is null (brand filter active or competitor_id
 *  missing) we just render the card as-is — the wrapper becomes a
 *  no-op fragment. */
function BrandFramedItem({
  brandName,
  children,
}: {
  brandName: string | null;
  children: React.ReactNode;
}) {
  if (!brandName) {
    return <>{children}</>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-widest text-gold/80 px-1 truncate">
        {brandName}
      </p>
      {children}
    </div>
  );
}
