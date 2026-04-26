import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScanDropdown } from "./scan-dropdown";
import { FrequencySelector } from "./frequency-selector";
import { CollapsibleJobHistory } from "./collapsible-job-history";
import { ChannelTabs } from "./channel-tabs";
import { DeleteBrandButton } from "./delete-brand-button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { PrintButton } from "@/components/ui/print-button";
import { formatDate } from "@/lib/utils";
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

  // Specific fields only — `select("*")` was pulling every column on this
  // hot path. mait_competitors has ~25 columns; we use ~10.
  const { data: competitor } = await supabase
    .from("mait_competitors")
    .select(
      "id, workspace_id, page_name, page_url, country, category, monitor_config, profile_picture_url, instagram_username, google_advertiser_id, google_domain"
    )
    .eq("id", id)
    .single();

  if (!competitor) notFound();
  const c = competitor as MaitCompetitor;

  // Limit was 120 ads + 120 organic posts, each row carrying a full
  // raw_data JSONB (50–200 KB on Meta, smaller on Instagram). On a
  // multi-country brand that meant ~10–25 MB serialised through the
  // RSC payload before the page rendered, which felt biblical to the
  // user. 30 is enough to populate the channel tabs above the fold;
  // load-more / pagination can be added later if needed. `description`
  // is only read by the ad detail page so we drop it here too.
  // adCount / postCount / jobCount feed the delete-confirmation
  // dialog with concrete numbers; head+exact returns only the count.
  const [
    { data: ads },
    { data: jobs },
    { data: organicPosts },
    { count: adCount },
    { count: postCount },
    { count: jobCount },
    { count: comparisonCount },
  ] = await Promise.all([
    supabase
      .from("mait_ads_external")
      .select(
        "id, workspace_id, competitor_id, ad_archive_id, headline, ad_text, cta, image_url, video_url, landing_url, platforms, status, start_date, end_date, created_at, raw_data, source"
      )
      .eq("competitor_id", id)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase
      .from("mait_scrape_jobs")
      .select(
        "id, workspace_id, competitor_id, apify_run_id, status, started_at, completed_at, records_count, cost_cu, error"
      )
      .eq("competitor_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("mait_organic_posts")
      .select(
        "id, workspace_id, competitor_id, platform, post_id, post_url, post_type, caption, display_url, video_url, likes_count, comments_count, shares_count, video_views, video_play_count, hashtags, mentions, tagged_users, posted_at, raw_data, created_at"
      )
      .eq("competitor_id", id)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_organic_posts")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_scrape_jobs")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_comparisons")
      .select("id", { count: "exact", head: true })
      .contains("competitor_ids", [id]),
  ]);
  const deleteCounts = {
    ads: adCount ?? 0,
    posts: postCount ?? 0,
    jobs: jobCount ?? 0,
    comparisons: comparisonCount ?? 0,
  };

  const adsList = (ads ?? []) as MaitAdExternal[];
  const jobsList = (jobs ?? []) as MaitScrapeJob[];
  const organicList = (organicPosts ?? []) as MaitOrganicPost[];
  // A fresh-enough running job (<10 min) means the scan is genuinely in
  // flight. Beyond that the cron cleanup will flip it to failed, so we
  // intentionally skip displaying a stale stop button for zombie rows.
  const tenMinAgoMs = Date.now() - 10 * 60_000;
  const hasRunningJob = jobsList.some(
    (j) => j.status === "running" && j.started_at && new Date(j.started_at).getTime() > tenMinAgoMs
  );

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

  // Profile picture: prefer saved permanent URL, fall back to raw_data
  const latestRaw = adsList[0]?.raw_data as Record<string, unknown> | null;
  const latestSnapshot = latestRaw?.snapshot as Record<string, unknown> | null;
  const pageProfilePicture = c.profile_picture_url
    ?? (latestSnapshot?.pageProfilePictureUrl as string)
    ?? null;
  const pageLikeCount = (latestSnapshot?.pageLikeCount as number) ?? null;
  const pageCategories = (latestSnapshot?.pageCategories as string[]) ?? [];

  function formatCompactNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/competitors"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ArrowLeft className="size-4" /> {t("competitors", "allCompetitors")}
        </Link>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      {/* ─── Hero: brand identity ─────────────────────────────
          Max peso visivo — nome + avatar + URL + likes.
          I metadata (Industry / Countries / Schedule) sono
          contesto del brand, quindi stanno sulla stessa riga
          come chip compatti allineati a destra per bilanciare. */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center gap-4 min-w-0">
          {pageProfilePicture ? (
            <FallbackImage
              src={pageProfilePicture}
              className="size-14 rounded-full object-cover border border-border shrink-0"
              fallbackInitial={c.page_name}
            />
          ) : (
            <div className="size-14 rounded-full bg-muted border border-border shrink-0 grid place-items-center text-muted-foreground font-semibold text-lg">
              {c.page_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-serif tracking-tight truncate">{c.page_name}</h1>
              <Link
                href={`/competitors/${c.id}/edit?from=brand`}
                className="size-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                title="Edit"
              >
                <Pencil className="size-3.5" />
              </Link>
              <DeleteBrandButton
                competitorId={c.id}
                competitorName={c.page_name}
                counts={deleteCounts}
              />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <a
                href={c.page_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-gold hover:underline"
              >
                {c.page_url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
              {pageLikeCount != null && pageLikeCount > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">—</span>
                  <span className="text-sm text-muted-foreground">
                    {formatCompactNumber(pageLikeCount)} {t("competitors", "likes")}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Metadata chips — pushed right on wide screens to fill the bar */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {c.category && (
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{t("competitors", "industryLabel").replace(":", "")}</span>
              <span className="text-foreground font-medium">{c.category}</span>
            </div>
          )}
          {c.country && (
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{t("competitors", "selectedCountries").replace(":", "")}</span>
              <span className="text-foreground font-medium">{c.country}</span>
            </div>
          )}
          <div className="inline-flex items-center rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
            <FrequencySelector competitorId={c.id} initial={frequency} />
          </div>
        </div>
      </section>

      {/* ─── Azione primaria: Scan.
          Elevata in Card per marcare "questa è la cosa da fare". */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-medium">
            {t("scan", "scanNow")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScanDropdown
            competitorId={c.id}
            hasGoogleConfig={!!(c.google_advertiser_id || c.google_domain)}
            hasInstagramConfig={!!c.instagram_username}
            hasRunningJob={hasRunningJob}
          />
        </CardContent>
      </Card>

      {/* ─── Scan history (collapsible) ──────────────────────── */}
      {jobsList.length > 0 && <CollapsibleJobHistory jobs={jobsList} />}

      {/* ─── Channel tabs: Meta Ads / Google Ads / Instagram ── */}
      <ChannelTabs
        competitorId={c.id}
        ads={adsList}
        organicPosts={organicList}
        organicStats={{
          count: organicCount,
          avgLikes,
          avgComments,
          totalViews,
        }}
      />

      <div className="flex justify-center pt-2 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}
