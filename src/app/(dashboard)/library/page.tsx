import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { Card, CardContent } from "@/components/ui/card";
import { LibraryFilters } from "./filters";
import { getLocale, serverT } from "@/lib/i18n/server";
import { PrintButton } from "@/components/ui/print-button";
import { getCompetitors } from "@/lib/library/cached-data";
import type { MaitAdExternal, MaitOrganicPost } from "@/types";

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
  const workspaceId = profile.workspace_id!;

  // Build the main content query (ads or Instagram posts)
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

  const ads: MaitAdExternal[] = isInstagram ? [] : ((contentData ?? []) as MaitAdExternal[]);
  const organicPosts: MaitOrganicPost[] = isInstagram ? ((contentData ?? []) as MaitOrganicPost[]) : [];

  const totalResults = isInstagram ? organicPosts.length : ads.length;

  // When no channel filter, split ads into Meta/Google sections for clarity
  const showSourceSections = !sp.channel && !isInstagram && ads.length > 0;
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
