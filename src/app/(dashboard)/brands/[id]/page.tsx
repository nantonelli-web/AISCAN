import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Pencil, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { ScanDropdown } from "./scan-dropdown";
import { CollapsibleSectionCard } from "./collapsible-section-card";
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

type TabFilter = "all" | "meta" | "google" | "instagram" | "tiktok" | "snapchat" | "youtube" | "serp" | "maps";
type StatusFilter = "active" | "inactive" | null;

function parseTab(raw: string | string[] | undefined): TabFilter {
  if (
    raw === "meta" ||
    raw === "google" ||
    raw === "instagram" ||
    raw === "tiktok" ||
    raw === "snapchat" ||
    raw === "youtube" ||
    raw === "serp" ||
    raw === "maps"
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
  // Date-range filter per la sezione "Creativita & insight" — stessa
  // forma usata in /benchmarks. Default vuoto (= "tutto"), cosi'
  // l'apertura del brand non taglia a 30 giorni indietro la coverage
  // di brand poco scrapati. L'utente sceglie esplicitamente la
  // finestra.
  const dateFromParam =
    typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)
      ? sp.from
      : null;
  const dateToParam =
    typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)
      ? sp.to
      : null;
  // Compare mode — pattern identico ad Adv Performance (period-vs-
  // period stesso brand+canale). Valori: null = no comparison,
  // "previous" = stessa lunghezza finestra shiftata all'indietro,
  // "custom" = date esplicite via compareFrom/compareTo.
  const compareMode: "previous" | "custom" | null =
    sp.compare === "previous"
      ? "previous"
      : sp.compare === "custom"
        ? "custom"
        : null;
  const compareFromParam =
    typeof sp.compareFrom === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.compareFrom)
      ? sp.compareFrom
      : null;
  const compareToParam =
    typeof sp.compareTo === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.compareTo)
      ? sp.compareTo
      : null;
  // Calcola la finestra precedente quando compareMode=previous:
  // stessa lunghezza, shiftata all'indietro. Es: 14/04-14/05 →
  // 13/03-13/04. Richiede che current dateFrom + dateTo siano
  // entrambi presenti, altrimenti il confronto non ha senso.
  let computedCompareFrom: string | null = null;
  let computedCompareTo: string | null = null;
  if (compareMode === "previous" && dateFromParam && dateToParam) {
    const fromMs = new Date(dateFromParam).getTime();
    const toMs = new Date(dateToParam).getTime();
    const spanMs = toMs - fromMs;
    if (Number.isFinite(spanMs) && spanMs > 0) {
      const prevToMs = fromMs - 86_400_000; // 1 giorno prima
      const prevFromMs = prevToMs - spanMs;
      computedCompareFrom = new Date(prevFromMs).toISOString().slice(0, 10);
      computedCompareTo = new Date(prevToMs).toISOString().slice(0, 10);
    }
  } else if (compareMode === "custom") {
    computedCompareFrom = compareFromParam;
    computedCompareTo = compareToParam;
  }
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
    { count: snapchatAdsCount },
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
        "id, workspace_id, page_name, page_id, page_url, country, category, monitor_config, profile_picture_url, instagram_username, instagram_profile, tiktok_username, tiktok_advertiser_id, snapchat_handle, snapchat_profile, youtube_channel_url, youtube_profile, google_advertiser_id, google_domain, last_scraped_at"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("mait_scrape_jobs")
      .select(
        "id, workspace_id, competitor_id, apify_run_id, status, started_at, completed_at, records_count, cost_cu, error, source, date_from, date_to"
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
    // Snapchat Ads count — paid ads via Snap's official DSA API,
    // separate from organic profile snapshots above.
    supabase
      .from("mait_snapchat_ads")
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
    ads: metaTotal + googleTotal + (snapchatAdsCount ?? 0),
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
  const snapchatAdsTotal = snapchatAdsCount ?? 0;
  const youtubeVideosTotal = youtubeVideoCount ?? 0;
  const youtubeChannelTotal = youtubeChannelSnapCount ?? 0;
  const serpQueriesTotal = serpQueryLinkCount ?? 0;
  const channelTotals = {
    meta: metaTotal,
    google: googleTotal,
    instagram: organicTotal,
    tiktok: tiktokTotal,
    snapchat: snapchatTotal,
    // Paid Snapchat ad count, surfaced alongside the organic snapshot
    // count so the channel chip shows the real total (organic +
    // paid). The ChannelTabs grid renders both blocks on the
    // unified Snapchat tab.
    snapchatAds: snapchatAdsTotal,
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

  // Async flow: Apify timeoutSecs lato run e' 30 min. Allarghiamo la
  // finestra "fresh-enough" a 35 min (30 + 5 buffer) cosi un brand
  // grosso che impiega 12 min vede il banner Stop fino a fine run.
  const FRESH_RUNNING_WINDOW_MS = 35 * 60_000;
  const cutoff = Date.now() - FRESH_RUNNING_WINDOW_MS;
  const hasRunningJob = jobsList.some(
    (j) =>
      j.status === "running" &&
      j.started_at &&
      new Date(j.started_at).getTime() > cutoff,
  );
  // Job orfani: status='running' ma partiti piu' di 35 min fa → il run
  // Apify e' sicuramente terminato (timeoutSecs cap a 30 min) ma il
  // webhook non e' mai arrivato. Mostriamo un banner dedicato col
  // bottone "Recupera dati" cosi l'utente puo' triggerare il reconcile
  // manualmente senza dover aprire la cronologia.
  const hasOrphanRunningJob = jobsList.some(
    (j) =>
      j.status === "running" &&
      j.started_at &&
      new Date(j.started_at).getTime() <= cutoff &&
      !!j.apify_run_id,
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
  // pageLikeCount used to render in the hero metadata row but
  // was removed alongside the country list (user feedback
  // 2026-05-04). The single-row JSON projection still pulls
  // page_like_count from raw_data because future reports may
  // surface it; the local variable is gone since nothing
  // consumes it.

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
    // Snapchat coverage = organic snapshots + paid ads. Either source
    // having data means the brand is "present on Snap" for the
    // hero coverage row.
    { key: "snapchat", count: snapchatTotal + snapchatAdsTotal },
    { key: "youtube", count: youtubeVideosTotal },
    { key: "serp", count: serpQueriesTotal },
  ];
  const channelsWithData = channelCoverage.filter((c) => c.count > 0).length;
  const totalCreatives = metaTotal + googleTotal + organicTotal + tiktokTotal + youtubeVideosTotal;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/brands"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t("competitors", "allCompetitors")}
        </Link>
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
              {/* Eyebrow "BRANDS" rimossa 2026-05-18 (richiesta
                  utente): il fatto che si sia sul brand-detail e gia
                  implicito dal breadcrumb sopra. Pencil inline a
                  destra del nome per editare le proprieta del brand. */}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-serif tracking-tight">
                  {c.page_name}
                </h1>
                <Link
                  href={`/brands/${c.id}/edit?from=brand`}
                  title={t("editCompetitor", "title")}
                  className="size-8 rounded-md border border-border grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors print:hidden"
                >
                  <Pencil className="size-3.5" />
                </Link>
              </div>
            </div>
            {/* Brand identity row: website link only.
                Removed 2026-05-04 from this row:
                - the country list (AE,BH,SA,KW,QA,OM): that data
                  drives the SCAN target selection, not the brand
                  identity, and showing it label-less here was
                  confusing.
                - the Facebook page URL: technical config for the
                  Meta scraper, not a user-facing identifier.
                - pageLikeCount: ephemeral metric from the most
                  recent ad row, not a stable brand attribute.
                The website (google_domain) is the one durable,
                user-facing identifier — link it with an external-
                link icon so the user can jump to the source. */}
            {c.google_domain && (
              <a
                href={`https://${c.google_domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gold hover:underline group"
              >
                <span>{c.google_domain}</span>
                <ExternalLink className="size-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          {/* Print + Delete affiancati. FrequencySelector spostata
              dentro la Scan card body — tipologia di scan e' una
              proprieta' dell'azione "Scan", non del brand-hero. */}
          <PrintButton label={t("common", "print")} variant="outline" />
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
        {(() => {
          // Source of truth: take the more recent of
          //   • mait_competitors.last_scraped_at (set by most scan
          //     endpoints; some forget — TikTok / TikTok Ads / SERP
          //     historically didn't write it back), and
          //   • the most recent succeeded mait_scrape_jobs.started_at
          //     for this competitor.
          // The fallback prevents the previously-rendered "—" on
          // brands that DID get scanned (e.g. House of Yamina) but
          // whose scan endpoint skipped the last_scraped_at update.
          const latestJobAt = jobsList.find((j) => j.status === "succeeded")?.started_at ?? null;
          const colAt = c.last_scraped_at ?? null;
          const lastScan =
            colAt && latestJobAt
              ? new Date(colAt) > new Date(latestJobAt)
                ? colAt
                : latestJobAt
              : (colAt ?? latestJobAt);
          return (
            <MiniKpi
              label={t("brandHero", "kpiLastScan")}
              value={lastScan ? formatScanDate(lastScan) : "—"}
              tone={
                lastScan && Date.now() - new Date(lastScan).getTime() < 14 * 86_400_000
                  ? "success"
                  : "neutral"
              }
            />
          );
        })()}
      </div>

      {/* ─── Scan action + Cronologia — collassata di default.
          Pattern collapsible-section-card identico a Creativita
          & Insight sotto. Cronologia scan vive DENTRO il body di
          Scan in coda con sub-frame info-tinted: e una funzionalita
          satellite (storia degli scan precedenti) non strettamente
          parte dell'azione "lancia scan", ma logicamente vicina al
          ramo Scan. Tenerla qui (sotto, separata dal background)
          riduce gli h2 top-level della pagina da 3 a 2. */}
      <CollapsibleSectionCard
        icon={<Zap className="size-5" />}
        title={t("scan", "scanNow")}
        subtitle={t("scan", "scanNowSubtitle")}
        tone="gold"
        defaultOpen={false}
      >
          {/* Tipologia di scan (Manuale / Daily / Weekly) — proprieta'
              dell'azione Scan, vive in cima al body. La modifica e'
              persistita immediatamente via FrequencySelector (server
              action). */}
          <div className="flex flex-wrap items-center gap-3 pb-4 mb-4 border-b border-gold/20">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {t("scan", "frequencyLabel")}
            </span>
            <div className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs">
              <FrequencySelector competitorId={c.id} initial={frequency} />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {t("scan", "frequencyHelp")}
            </span>
          </div>
          <ScanDropdown
            competitorId={c.id}
            // Meta scrape needs either a Facebook page URL OR a
            // pre-resolved page_id. Brands created without the FB
            // URL (since the field went optional in 0036) can't
            // run Meta scans until the user fills it in — disable
            // the button visibly instead of letting the click
            // surface a 400 from the API.
            hasMetaConfig={!!(c.page_url || c.page_id)}
            hasGoogleConfig={!!(c.google_advertiser_id || c.google_domain)}
            hasInstagramConfig={!!c.instagram_username}
            hasTiktokConfig={!!c.tiktok_username}
            hasSnapchatConfig={!!c.snapchat_handle}
            hasYoutubeConfig={!!c.youtube_channel_url}
            scanCountries={c.country}
            hasRunningJob={hasRunningJob}
            hasOrphanRunningJob={hasOrphanRunningJob}
            googleLastScanAt={
              jobsList.find(
                (j) =>
                  j.source === "google" &&
                  (j.status === "succeeded" || j.status === "partial") &&
                  !!j.started_at,
              )?.started_at ?? null
            }
            googlePartialJob={(() => {
              const j = jobsList.find(
                (j) =>
                  j.source === "google" &&
                  j.status === "partial" &&
                  !!j.apify_run_id,
              );
              if (!j) return null;
              return {
                jobId: j.id,
                runId: j.apify_run_id!,
                recordsCount: j.records_count ?? 0,
                completedAt: j.completed_at,
              };
            })()}
            googleRefinalizableJob={(() => {
              const sixDaysAgo = Date.now() - 6 * 86_400_000;
              const j = jobsList.find(
                (j) =>
                  j.source === "google" &&
                  (j.status === "succeeded" || j.status === "partial") &&
                  !!j.apify_run_id &&
                  !!j.started_at &&
                  new Date(j.started_at).getTime() > sixDaysAgo,
              );
              if (!j) return null;
              return {
                jobId: j.id,
                recordsCount: j.records_count ?? 0,
              };
            })()}
          />
          {jobsList.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gold/20">
              {/* Cronologia inline: solo divider sopra come separatore.
                  Niente sub-frame e niente border button — l'utente
                  ha gia' segnalato "troppe cornici". Il colore info
                  dell'icona segna la differenza funzionale rispetto
                  al ramo Scan sopra. */}
              <CollapsibleJobHistory jobs={jobsList} inline />
            </div>
          )}
      </CollapsibleSectionCard>

      {/* ─── Creativita & Insight + Risultati — 2 collapsible
          section cards separate, entrambe gestite da ChannelTabs.
          Splittate perche' l'utente ha esplicitamente chiesto
          "chiudi il riquadro filtri prima dei risultati". Le 2
          card girano insieme dentro ChannelTabs (stesso URL state
          via useSearchParams), niente prop drilling extra. */}
      <Suspense
        key={`${tab}|${statusFilter ?? "all"}|${countriesFilter.join(",")}|${dateFromParam ?? ""}|${dateToParam ?? ""}|${computedCompareFrom ?? ""}|${computedCompareTo ?? ""}`}
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
            dateFrom={dateFromParam}
            dateTo={dateToParam}
            compareMode={compareMode}
            compareFrom={computedCompareFrom}
            compareTo={computedCompareTo}
            brand={{
              name: c.page_name,
              avatar: pageProfilePicture,
              instagramUsername: c.instagram_username,
              instagramProfile: c.instagram_profile
                ? (c.instagram_profile as {
                    followersCount?: number | null;
                    followsCount?: number | null;
                    postsCount?: number | null;
                    verified?: boolean | null;
                    businessCategoryName?: string | null;
                  })
                : null,
              tiktokUsername: c.tiktok_username,
              snapchatHandle: c.snapchat_handle,
              youtubeUrl: c.youtube_channel_url,
              googleDomain: c.google_domain,
            }}
          />
      </Suspense>
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

/** Absolute date formatter for the "Ultimo scan" KPI tile. User
 *  feedback 2026-05-04: the previous compact relative form ("3d",
 *  "2w") gave a vague sense but not the actual day — they wanted
 *  the date. DD/MM/YY in en-GB so day-month order matches the
 *  Italian convention without re-localising on every locale. */
function formatScanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
