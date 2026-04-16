import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TagButton } from "@/components/ads/tag-button";
import { ScanDropdown } from "./scan-dropdown";
import { FrequencySelector } from "./frequency-selector";
import { JobHistory } from "./job-history";
import { formatDate, formatNumber } from "@/lib/utils";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitAdExternal, MaitCompetitor, MaitOrganicPost, MaitScrapeJob } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  const { data: competitor } = await supabase
    .from("mait_competitors")
    .select("*")
    .eq("id", id)
    .single();

  if (!competitor) notFound();
  const c = competitor as MaitCompetitor;

  const [{ data: ads }, { data: jobs }, { data: organicPosts }] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select("*")
      .eq("competitor_id", id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(120),
    supabase
      .from("mait_scrape_jobs")
      .select("*")
      .eq("competitor_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("mait_organic_posts")
      .select("*")
      .eq("competitor_id", id)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(120),
  ]);

  const adsList = (ads ?? []) as MaitAdExternal[];
  const jobsList = (jobs ?? []) as MaitScrapeJob[];
  const organicList = (organicPosts ?? []) as MaitOrganicPost[];

  // Organic engagement stats
  const organicCount = organicList.length;
  const avgLikes = organicCount > 0
    ? Math.round(organicList.reduce((s, p) => s + (p.likes_count ?? 0), 0) / organicCount)
    : 0;
  const avgComments = organicCount > 0
    ? Math.round(organicList.reduce((s, p) => s + (p.comments_count ?? 0), 0) / organicCount)
    : 0;
  const totalViews = organicList.reduce((s, p) => s + (p.video_views ?? 0), 0);
  const frequency = ((c.monitor_config as { frequency?: string })?.frequency ??
    "manual") as "manual" | "daily" | "weekly";

  // Extract page-level info from the most recent ad's raw_data
  const latestRaw = adsList[0]?.raw_data as Record<string, unknown> | null;
  const latestSnapshot = latestRaw?.snapshot as Record<string, unknown> | null;
  const pageProfilePicture = (latestSnapshot?.pageProfilePictureUrl as string) ?? null;
  const pageLikeCount = (latestSnapshot?.pageLikeCount as number) ?? null;
  const pageCategories = (latestSnapshot?.pageCategories as string[]) ?? [];

  function formatCompactNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/competitors"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("competitors", "allCompetitors")}
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {pageProfilePicture && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pageProfilePicture}
                alt=""
                className="size-10 rounded-full object-cover border border-border shrink-0"
              />
            )}
            <h1 className="text-3xl font-serif tracking-tight">{c.page_name}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={c.page_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-gold hover:underline"
            >
              {c.page_url}
            </a>
            {c.country && <Badge variant="muted">{c.country}</Badge>}
            {c.category && <Badge variant="muted">{c.category}</Badge>}
            {pageLikeCount != null && pageLikeCount > 0 && (
              <Badge variant="gold">
                {formatCompactNumber(pageLikeCount)} {t("competitors", "likes")}
              </Badge>
            )}
          </div>
          {pageCategories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {pageCategories.map((cat) => (
                <Badge key={cat} variant="outline" className="text-[10px]">
                  {cat}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("competitors", "lastScan")} {formatDate(c.last_scraped_at)}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Settings group */}
          <div className="flex items-center gap-2">
            <FrequencySelector competitorId={c.id} initial={frequency} />
            <TagButton competitorId={c.id} />
          </div>

          {/* Separator */}
          <div className="hidden sm:block h-6 w-px bg-border" />

          {/* Actions group */}
          <div className="flex items-center gap-2">
            <a
              href={`/api/export/ads.csv?competitor_id=${c.id}`}
              className="inline-flex items-center justify-center size-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-gold/30 transition-colors"
              title={t("competitors", "exportCsv")}
            >
              <Download className="size-4" />
            </a>
            <ScanDropdown
              competitorId={c.id}
              hasGoogleConfig={!!(c.google_advertiser_id || c.google_domain)}
            />
          </div>
        </div>
      </div>

      {jobsList.length > 0 && <JobHistory jobs={jobsList} />}

      {adsList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("competitors", "noAdsCollected")}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {adsList.length} {t("competitors", "adsCount")}
          </p>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {adsList.map((ad) => (
              <AdCard key={ad.id} ad={ad} competitorId={c.id} />
            ))}
          </div>
        </>
      )}

      {/* ─── Instagram Organic Content ───────────────────────── */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <InstagramIcon className="size-5 text-gold" />
          <h2 className="text-xl font-serif tracking-tight">
            {t("organic", "title")}
          </h2>
        </div>

        {/* Organic engagement stats (only if posts exist) */}
        {organicCount > 0 && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-semibold">{organicCount}</p>
                <p className="text-xs text-muted-foreground">{t("organic", "totalPosts")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-semibold">{formatNumber(avgLikes)}</p>
                <p className="text-xs text-muted-foreground">{t("organic", "avgLikes")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-semibold">{formatNumber(avgComments)}</p>
                <p className="text-xs text-muted-foreground">{t("organic", "avgComments")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-semibold">{formatNumber(totalViews)}</p>
                <p className="text-xs text-muted-foreground">{t("organic", "totalViews")}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {organicList.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              {t("organic", "noPostsYet")}
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {organicList.length} {t("organic", "postsCount")}
            </p>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {organicList.map((post) => (
                <OrganicPostCard key={post.id} post={post} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
