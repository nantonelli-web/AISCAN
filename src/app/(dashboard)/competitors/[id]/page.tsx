import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Radar } from "lucide-react";
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
        "id, workspace_id, page_name, page_url, country, category, monitor_config, profile_picture_url, instagram_username, tiktok_username, tiktok_advertiser_id, snapchat_handle, snapchat_profile, youtube_channel_url, youtube_profile, google_advertiser_id, google_domain"
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

  // Coverage map — which channels does this brand have data on?
  // Drives the small icon row under the hero so the user sees at a
  // glance "you've scanned Meta + Instagram + TikTok, the rest is
  // empty". Stronger signal than 7 zero-counts in the channel-tabs
  // strip below.
  const channelCoverage = [
    { key: "meta", count: metaTotal },
    { key: "google", count: googleTotal },
    { key: "instagram", count: organicTotal },
    { key: "tiktok", count: tiktokTotal },
    { key: "snapchat", count: snapchatTotal },
    { key: "youtube", count: youtubeVideosTotal },
    { key: "serp", count: serpQueriesTotal },
  ];
  const channelsWithData = channelCoverage.filter((c) => c.count > 0).length;
  const totalCreatives = metaTotal + googleTotal + organicTotal + tiktokTotal + youtubeVideosTotal;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/competitors"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("competitors", "allCompetitors")}
        </Link>
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>

      {/* ─── Hero: brand identity ─────────────────────────────
          Avatar + name dominate. Secondary metadata moved BELOW the
          name (instead of pushed right where it competed with the
          h1) so the eye reads top-down: brand → website → context.
          The right-hand column now holds the action affordances
          (edit / delete / frequency) consolidated visually. */}
      <section className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex items-start gap-5 min-w-0">
          {pageProfilePicture ? (
            <FallbackImage
              src={pageProfilePicture}
              className="size-16 rounded-full object-cover border border-border shrink-0"
              fallbackInitial={c.page_name}
            />
          ) : (
            <div className="size-16 rounded-full bg-gold-soft border border-gold/20 shrink-0 grid place-items-center text-gold font-semibold text-xl">
              {c.page_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-2">
            <div className="space-y-0.5">
              <p className="eyebrow">{t("competitors", "title")}</p>
              <h1 className="text-3xl font-serif tracking-tight">{c.page_name}</h1>
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground">
              <a
                href={c.page_url}
                target="_blank"
                rel="noreferrer"
                className="text-gold hover:underline truncate max-w-[280px]"
              >
                {c.page_url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
              {pageLikeCount != null && pageLikeCount > 0 && (
                <span>{formatCompactNumber(pageLikeCount)} {t("competitors", "likes")}</span>
              )}
              {c.category && <span>· {c.category}</span>}
              {c.country && <span>· {c.country}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <div className="inline-flex items-center rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs">
            <FrequencySelector competitorId={c.id} initial={frequency} />
          </div>
          <Link
            href={`/competitors/${c.id}/edit?from=brand`}
            className="size-9 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={t("editCompetitor", "title")}
          >
            <Pencil className="size-4" />
          </Link>
          <DeleteBrandButton
            competitorId={c.id}
            competitorName={c.page_name}
            counts={deleteCounts}
          />
        </div>
      </section>

      {/* ─── KPI strip ──────────────────────────────────────
          Three at-a-glance tiles answer "how rich is this brand?"
          before the user dives into channel tabs. Full-width grid so
          the tiles breathe; stays as a separate row from the Scan
          card below — the previous side-by-side layout left dead
          vertical space because Scan is naturally tall and the KPIs
          short. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniKpi
          label={t("brandHero", "kpiCreatives")}
          value={formatCompactNumber(totalCreatives)}
          tone="info"
        />
        <MiniKpi
          label={t("brandHero", "kpiChannels")}
          value={`${channelsWithData} / ${channelCoverage.length}`}
          tone={channelsWithData >= 4 ? "success" : channelsWithData >= 2 ? "warning" : "neutral"}
        />
        <MiniKpi
          label={t("brandHero", "kpiLastScan")}
          value={c.last_scraped_at ? formatRelativeShort(c.last_scraped_at) : "—"}
          tone={c.last_scraped_at && Date.now() - new Date(c.last_scraped_at).getTime() < 14 * 86_400_000 ? "success" : "neutral"}
        />
      </div>

      {/* ─── Scan action — full width.
          The single most important affordance on this page. Header
          carries a Radar icon + a real h2 title (the previous 10px
          all-caps was unreadable as a section title — user feedback).
          Soft-gold background tint and gold-bordered card make it
          stand out as the primary action even before the user reads
          the buttons. */}
      <Card className="border-gold/30 bg-gold-soft/40 print:hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gold text-gold-foreground grid place-items-center shrink-0 shadow-sm">
              <Radar className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight leading-tight">
                {t("scan", "scanNow")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("scan", "scanNowSubtitle")}
              </p>
            </div>
          </div>
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
          // Brand identity overlay used in the per-channel cover
          // bands: name + best-available avatar + channel-specific
          // handle. Pre-computed here so the deep child does not
          // need a separate query.
          brand={{
            name: c.page_name,
            avatar: pageProfilePicture,
            instagramUsername: c.instagram_username,
            tiktokUsername: c.tiktok_username,
            snapchatHandle: c.snapchat_handle,
            youtubeUrl: c.youtube_channel_url,
            googleDomain: c.google_domain,
          }}
        />
      </Suspense>

      <div className="flex justify-end pt-2 print:hidden">
        <PrintButton label={t("common", "print")} variant="outline" />
      </div>
    </div>
  );
}

/** Compact KPI tile — used in the brand-detail hero row. Matches the
 *  tokens defined in globals.css (kpi-value / kpi-label) so a future
 *  scale change cascades. Smaller than the full <Kpi> component on
 *  purpose: the brand page already has a busy hero, three giant
 *  numbers would feel shouty. */
function MiniKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "info" | "success" | "warning";
}) {
  const toneText: Record<typeof tone, string> = {
    neutral: "text-foreground",
    info: "text-gold",
    success: "tone-success",
    warning: "tone-warning",
  };
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3.5">
      <div className="kpi-label">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight tabular-nums leading-none mt-1.5 ${toneText[tone]}`}>
        {value}
      </div>
    </div>
  );
}

/** Compact relative-time formatter. "3d", "2w", "5mo". Falls back
 *  to the absolute date for anything older than a year so the user
 *  is not staring at "84w" on a long-dormant brand. */
function formatRelativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "now";
  const d = Math.floor(ms / 86_400_000);
  if (d === 0) return "today";
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}w`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
