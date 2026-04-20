import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { Card, CardContent } from "@/components/ui/card";
import { LibraryFilters } from "./filters";
import { getLocale, serverT } from "@/lib/i18n/server";
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

  // Fetch competitors for brand filter
  const { data: competitors } = await supabase
    .from("mait_competitors")
    .select("id, page_name")
    .eq("workspace_id", profile.workspace_id!)
    .order("page_name");

  let ads: MaitAdExternal[] = [];
  let organicPosts: MaitOrganicPost[] = [];

  if (isInstagram) {
    // Instagram: query organic posts
    let igQuery = supabase
      .from("mait_organic_posts")
      .select("*")
      .eq("workspace_id", profile.workspace_id!)
      .order("posted_at", { ascending: false })
      .limit(120);

    if (sp.brand) igQuery = igQuery.eq("competitor_id", sp.brand);
    if (sp.q && sp.q.trim().length > 0) {
      igQuery = igQuery.ilike("caption", `%${sp.q.trim()}%`);
    }

    const { data } = await igQuery;
    organicPosts = (data ?? []) as MaitOrganicPost[];
  } else {
    // Meta / Google / All: query ads
    let query = supabase
      .from("mait_ads_external")
      .select("*")
      .eq("workspace_id", profile.workspace_id!)
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

    const { data } = await query;
    ads = (data ?? []) as MaitAdExternal[];
  }

  // Aggregate filter options (only for ads channels)
  const { data: facets } = await supabase
    .from("mait_ads_external")
    .select("cta, platforms, status")
    .eq("workspace_id", profile.workspace_id!)
    .limit(2000);

  const ctas = new Set<string>();
  const platforms = new Set<string>();
  const statuses = new Set<string>();
  for (const r of (facets ?? []) as Array<{
    cta: string | null;
    platforms: string[] | null;
    status: string | null;
  }>) {
    if (r.cta) ctas.add(r.cta);
    if (r.status) statuses.add(r.status);
    if (Array.isArray(r.platforms)) r.platforms.forEach((p) => platforms.add(p));
  }

  const totalResults = isInstagram ? organicPosts.length : ads.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">{t("library", "title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("library", "subtitle")}
        </p>
      </div>

      <LibraryFilters
        initial={sp}
        ctas={isInstagram ? [] : [...ctas].sort()}
        platforms={isInstagram ? [] : [...platforms].sort()}
        statuses={isInstagram ? [] : [...statuses].sort()}
        competitors={(competitors ?? []) as { id: string; page_name: string }[]}
      />

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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isInstagram
              ? organicPosts.map((p) => (
                  <OrganicPostCard key={p.id} post={p} />
                ))
              : ads.map((a) => (
                  <AdCard key={a.id} ad={a} />
                ))}
          </div>
        </>
      )}
    </div>
  );
}
