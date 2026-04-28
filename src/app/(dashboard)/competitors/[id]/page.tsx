import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanDropdown } from "./scan-dropdown";
import { FrequencySelector } from "./frequency-selector";
import { CollapsibleJobHistory } from "./collapsible-job-history";
import { BrandChannelsSection } from "./brand-channels-section";
import { BrandChannelsSkeleton } from "./brand-channels-skeleton";
import { DeleteBrandButton } from "./delete-brand-button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { PrintButton } from "@/components/ui/print-button";
import { getLocale, serverT } from "@/lib/i18n/server";
import type { MaitCompetitor, MaitScrapeJob } from "@/types";

export const dynamic = "force-dynamic";

type TabFilter = "all" | "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube" | "serp";
type StatusFilter = "active" | "inactive" | null;

function parseTab(raw: string | string[] | undefined): TabFilter {
  if (
    raw === "meta" ||
    raw === "google" ||
    raw === "instagram" ||
    raw === "tiktok" ||
    raw === "snapchat" ||
    raw === "youtube" ||
    raw === "serp"
  )
    return raw;
  return "all";
}
function parseStatus(raw: string | string[] | undefined): StatusFilter {
  if (raw === "active" || raw === "inactive") return raw;
  return null;
}

export default async function CompetitorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // URL-driven filters so Country / Status / Channel hit the DB instead
  // of a 30-ad client-side cache. Without this the country pill showed
  // misleading numbers for big brands (e.g. Sezane GB = 1 of 415 because
  // the 30 most-recent ads had only one GB row).
  const tab = parseTab(sp.tab);
  const statusFilter = parseStatus(sp.status);
  const countriesFilter =
    typeof sp.countries === "string"
      ? sp.countries
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : [];
  await getSessionUser();
  const supabase = await createClient();
  const locale = await getLocale();
  const t = serverT(locale);

  // Lightweight queries that drive the page shell — competitor row,
  // recent jobs, delete-dialog counts, plus a single-row projection
  // of the latest ad's pageLikeCount for the hero. The heavy 30-ads
  // + 30-posts fetch lives in BrandChannelsSection and streams in
  // behind a Suspense boundary so the user sees the brand chrome
  // immediately on click.
  const [
    { data: competitor },
    { data: jobs },
    { count: metaAdCount },
    { count: googleAdCount },
    { count: metaActiveCount },
    { count: googleActiveCount },
    { count: postCount },
    { count: tiktokPostCount },
    { count: snapchatSnapshotCount },
    { count: youtubeVideoCount },
    { count: youtubeChannelSnapCount },
    { count: serpQueryLinkCount },
    { count: jobCount },
    { count: comparisonCount },
    { data: latestAd },
    { data: countryRows },
  ] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select(
        "id, workspace_id, page_name, page_url, country, category, monitor_config, profile_picture_url, instagram_username, tiktok_username, snapchat_handle, snapchat_profile, youtube_channel_url, youtube_profile, google_advertiser_id, google_domain"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("mait_scrape_jobs")
      .select(
        "id, workspace_id, competitor_id, apify_run_id, status, started_at, completed_at, records_count, cost_cu, error"
      )
      .eq("competitor_id", id)
      .order("started_at", { ascending: false })
      .limit(10),
    // Source-split ad counts so the channel-filter chips can show the
    // real totals (the lazy ChannelTabs grid only loads 30 ads, which
    // would otherwise stall the badge at 30). Plus active-only counts
    // per source — drives the Status pill row so "Active" / "Inactive"
    // can carry honest per-channel numbers. All four are head+exact:
    // counts only, no rows transferred.
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id)
      .eq("source", "meta"),
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id)
      .eq("source", "google"),
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id)
      .eq("source", "meta")
      .eq("status", "ACTIVE"),
    supabase
      .from("mait_ads_external")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id)
      .eq("source", "google")
      .eq("status", "ACTIVE"),
    supabase
      .from("mait_organic_posts")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_tiktok_posts")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_snapchat_profiles")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_youtube_videos")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_youtube_channels")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    // SERP M:N association count — drives whether the SERP tab is
    // visible in the brand-detail channel filter.
    supabase
      .from("mait_serp_query_brands")
      .select("query_id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_scrape_jobs")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", id),
    supabase
      .from("mait_comparisons")
      .select("id", { count: "exact", head: true })
      .contains("competitor_ids", [id]),
    // Single-row, JSON-projected fetch for the hero metadata.
    // page_like_count and the snapshot profile picture come from
    // the most recent ad's raw_data — projecting the two fields
    // directly keeps the request tiny instead of pulling 50–200 KB
    // of unrelated raw_data just to read two scalars.
    supabase
      .from("mait_ads_external")
      .select(
        "page_like_count:raw_data->snapshot->pageLikeCount, page_profile_picture_url:raw_data->snapshot->>pageProfilePictureUrl"
      )
      .eq("competitor_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Brand-wide scan_countries — drives the Country dropdown and
    // must NOT depend on the active filters (otherwise picking
    // status=active would shrink the dropdown to currently-active
    // countries). Lives in the shell so it is fetched once per
    // page load and reused as the Suspense child re-renders on
    // every filter change. 5000-row cap is a safety net; brands
    // with more ads still get a representative country list.
    supabase
      .from("mait_ads_external")
      .select("scan_countries")
      .eq("competitor_id", id)
      .eq("source", "meta")
      .not("scan_countries", "is", null)
      .limit(5000),
  ]);

  if (!competitor) notFound();
  const c = competitor as MaitCompetitor;
  const jobsList = (jobs ?? []) as MaitScrapeJob[];
  const metaTotal = metaAdCount ?? 0;
  const googleTotal = googleAdCount ?? 0;
  const organicTotal = postCount ?? 0;
  const deleteCounts = {
    ads: metaTotal + googleTotal,
    posts:
      organicTotal +
      (tiktokPostCount ?? 0) +
      (snapchatSnapshotCount ?? 0) +
      (youtubeVideoCount ?? 0) +
      (youtubeChannelSnapCount ?? 0),
    jobs: jobCount ?? 0,
    comparisons: comparisonCount ?? 0,
  };
  const tiktokTotal = tiktokPostCount ?? 0;
  const snapchatTotal = snapchatSnapshotCount ?? 0;
  const youtubeVideosTotal = youtubeVideoCount ?? 0;
  const youtubeChannelTotal = youtubeChannelSnapCount ?? 0;
  const serpQueriesTotal = serpQueryLinkCount ?? 0;
  const channelTotals = {
    meta: metaTotal,
    google: googleTotal,
    instagram: organicTotal,
    tiktok: tiktokTotal,
    snapchat: snapchatTotal,
    youtube: youtubeVideosTotal,
    youtubeChannelSnaps: youtubeChannelTotal,
    serpQueries: serpQueriesTotal,
  };
  const activeTotals = {
    meta: metaActiveCount ?? 0,
    google: googleActiveCount ?? 0,
  };

  // Brand-wide country tally. Driven by every Meta ad we have for the
  // brand (capped at 5000 rows above), so the dropdown always offers
  // every market the brand has been scanned in — independent of any
  // active Status / Channel filter the user picked.
  const countryTally = new Map<string, number>();
  for (const row of (countryRows ?? []) as { scan_countries: string[] | null }[]) {
    if (!Array.isArray(row.scan_countries)) continue;
    for (const code of row.scan_countries) {
      if (typeof code === "string" && code) {
        countryTally.set(code, (countryTally.get(code) ?? 0) + 1);
      }
    }
  }
  let displayNames: Intl.DisplayNames | null = null;
  try {
    displayNames = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    displayNames = null;
  }
  const availableCountries = [...countryTally.entries()]
    .map(([code, count]) => {
      let name = code;
      try {
        name = displayNames?.of(code) ?? code;
      } catch {
        name = code;
      }
      return { code, count, name };
    })
    .sort((a, b) => b.count - a.count);

  // A fresh-enough running job (<10 min) means the scan is genuinely in
  // flight. Beyond that the cron cleanup will flip it to failed, so we
  // intentionally skip displaying a stale stop button for zombie rows.
  const tenMinAgoMs = Date.now() - 10 * 60_000;
  const hasRunningJob = jobsList.some(
    (j) => j.status === "running" && j.started_at && new Date(j.started_at).getTime() > tenMinAgoMs
  );

  // PostgREST returns the JSON-path projections as their underlying
  // type. Coerce defensively in case scan_data shape ever drifts.
  const heroLatestAd = latestAd as
    | { page_like_count: number | null; page_profile_picture_url: string | null }
    | null;
  const pageProfilePicture =
    c.profile_picture_url ??
    heroLatestAd?.page_profile_picture_url ??
    null;
  const pageLikeCount =
    typeof heroLatestAd?.page_like_count === "number"
      ? heroLatestAd.page_like_count
      : null;

  const frequency = ((c.monitor_config as { frequency?: string })?.frequency ??
    "manual") as "manual" | "daily" | "weekly";

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
            hasTiktokConfig={!!c.tiktok_username}
            hasSnapchatConfig={!!c.snapchat_handle}
            hasYoutubeConfig={!!c.youtube_channel_url}
            hasRunningJob={hasRunningJob}
          />
        </CardContent>
      </Card>

      {/* ─── Scan history (collapsible) ──────────────────────── */}
      {jobsList.length > 0 && <CollapsibleJobHistory jobs={jobsList} />}

      {/* ─── Channel tabs: streamed via Suspense so the heavy
          ads + posts fetch does not block the page chrome above. */}
      <Suspense
        key={`${tab}|${statusFilter ?? "all"}|${countriesFilter.join(",")}`}
        fallback={<BrandChannelsSkeleton />}
      >
        <BrandChannelsSection
          competitorId={c.id}
          googleDomain={c.google_domain}
          channelTotals={channelTotals}
          activeTotals={activeTotals}
          availableCountries={availableCountries}
          tab={tab}
          statusFilter={statusFilter}
          countriesFilter={countriesFilter}
        />
      </Suspense>

      <div className="flex justify-end pt-2 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}
