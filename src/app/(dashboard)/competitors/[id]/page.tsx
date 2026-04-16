import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdCard } from "@/components/ads/ad-card";
import { OrganicPostCard } from "@/components/organic/organic-post-card";
import { TagButton } from "@/components/ads/tag-button";
import { ScanDropdown } from "./scan-dropdown";
import { FrequencySelector } from "./frequency-selector";
import { CollapsibleJobHistory } from "./collapsible-job-history";
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

      {/* ─── Header: brand identity ────────────────────────── */}
      <div className="space-y-1.5">
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
          <Link
            href={`/competitors/${c.id}/edit`}
            className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </Link>
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
          {c.category && <Badge variant="muted">{c.category}</Badge>}
          {pageLikeCount != null && pageLikeCount > 0 && (
            <Badge variant="gold">
              {formatCompactNumber(pageLikeCount)} {t("competitors", "likes")}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>{t("competitors", "lastScan")} {formatDate(c.last_scraped_at)}</span>
          <span className="text-border">·</span>
          <FrequencySelector competitorId={c.id} initial={frequency} />
          {c.country && (
            <>
              <span className="text-border">·</span>
              <span>{t("competitors", "selectedCountries")} {c.country}</span>
            </>
          )}
        </div>
      </div>

      {/* ─── Scan actions: always visible, prominent ─────────── */}
      <ScanDropdown
        competitorId={c.id}
        hasGoogleConfig={!!(c.google_advertiser_id || c.google_domain)}
      />

      {/* ─── Scan history (collapsible) ──────────────────────── */}
      {jobsList.length > 0 && <CollapsibleJobHistory jobs={jobsList} />}

      {/* ─── AI Tag section ──────────────────────────────────── */}
      {adsList.length > 0 && (
        <div className="flex items-start gap-4 px-4 py-3 rounded-lg border border-border bg-muted/20">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t("tagButton", "aiTagTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("tagButton", "aiTagDescription")}</p>
          </div>
          <div className="shrink-0 pt-0.5">
            <TagButton competitorId={c.id} />
          </div>
        </div>
      )}

      {/* ─── Ads grid ────────────────────────────────────────── */}
      {adsList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {t("competitors", "noAdsCollected")}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {adsList.length} {t("competitors", "adsCount")}
            </p>
            <a
              href={`/api/export/ads.csv?competitor_id=${c.id}`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="size-3" />
              {t("competitors", "exportCsv")}
            </a>
          </div>
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
