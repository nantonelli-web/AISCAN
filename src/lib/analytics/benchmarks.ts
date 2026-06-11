import type { SupabaseClient } from "@supabase/supabase-js";
import { extractAdInsights } from "@/lib/meta/ad-insights";
import {
  classifyAdFormat,
  computeAdDurationDays,
  normalizeCtaLabel as sharedNormalizeCta,
} from "@/lib/analytics/ad-shared";
import { classifyGoogleStrategy } from "@/lib/analytics/google-strategy";
import { logger } from "@/lib/logger";

export type InferredAudience =
  | "prospecting"
  | "retargeting"
  | "lookalike"
  | "interest"
  | "custom"
  | "broad"
  | "unknown";

export type InferredObjective =
  | "sales"
  | "traffic"
  | "awareness"
  | "app_install"
  | "engagement"
  | "lead_generation"
  | "unknown";

interface AdRow {
  id: string;
  competitor_id: string | null;
  cta: string | null;
  platforms: string[] | null;
  image_url: string | null;
  video_url: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  ad_text: string | null;
  created_at: string;
  raw_data: Record<string, unknown> | null;
  scan_countries: string[] | null;
}

interface CompetitorRef {
  id: string;
  page_name: string;
  /** CSV of configured ISO codes — needed to compute country-coverage. */
  country?: string | null;
}

export interface BenchmarkData {
  competitors: CompetitorRef[];
  /** Active ads per competitor */
  volumeByCompetitor: { name: string; active: number; inactive: number }[];
  /** Format breakdown across all ads (using displayFormat) */
  formatMix: { name: string; value: number }[];
  /** Format breakdown per competitor (using displayFormat) */
  formatByCompetitor: {
    name: string;
    image: number;
    video: number;
    carousel: number;
    dpa: number;
    text: number;
    unknown: number;
  }[];
  /** Top CTAs across all ads */
  topCtas: { name: string; count: number }[];
  /** CTA usage per competitor (top 5 CTAs) */
  ctaByCompetitor: { name: string; [cta: string]: string | number }[];
  /** Top CTAs per competitor — shape ready for per-brand pie/bar charts */
  ctaMixByCompetitor: { competitor: string; data: { name: string; count: number }[] }[];
  /** Brand con ads ma 0 CTA estratte. Google Transparency espone il
   *  bottone CTA solo per alcuni creativi (es. Video Skippable); i
   *  brand interamente fatti di Image/Search ads finiscono qui e
   *  spariscono dal chart Top CTA. Il client mostra una nota con
   *  questi nomi cosi' l'utente capisce perche' alcuni brand mancano. */
  ctaMissingCompetitors: string[];
  /** UTM-derived audience + objective inference per competitor. */
  utmInsightsByCompetitor: {
    competitor: string;
    audience: InferredAudience;
    objective: InferredObjective;
    audienceConfidence: number; // 0-100
    objectiveConfidence: number; // 0-100
    sampleCampaign: string | null; // most frequent utm_campaign value for context
  }[];
  /**
   * Per-brand scan-coverage signal. `earliestStart` is the oldest
   * `start_date` we have for that brand anywhere in the DB (regardless
   * of the requested date range). If it is more recent than `dateFrom`
   * the page uses it to warn the user that the brand has less history
   * than the range they asked to analyse.
   */
  coverageByCompetitor: {
    competitorId: string;
    competitor: string;
    earliestStart: string | null;
    adsInRange: number;
  }[];
  /**
   * Per-brand country-coverage signal. `configuredCountries` is what
   * the user set on the competitor record (the markets they want to
   * track). `scannedCountriesWithData` is the subset that actually
   * came back with at least one ad in the analysis window.
   * `emptyCountries` is the diff — e.g. Karen Millen configured
   * GB,IT,FR,DE,ES but only GB has data, so emptyCountries = [IT,FR,DE,ES].
   * The UI uses these to surface a "you configured countries that
   * have no ads" warning so the user can clean up the config or
   * realise the brand only runs in its primary market.
   */
  countryScanCoverage: {
    competitor: string;
    configuredCountries: string[];
    scannedCountriesWithData: string[];
    emptyCountries: string[];
  }[];
  /**
   * EU DSA transparency roll-up per brand. Only populated for ads whose
   * raw_data carries the breakdown (EU-delivered ads).
   */
  audienceByCompetitor: {
    competitor: string;
    euReach: number;
    adsWithInsights: number;
    ageTotals: { ageRange: string; count: number }[];
    dominantAge: string | null;
    gender: { male: number; female: number; unknown: number };
    genderLabel: "all" | "mostlyMale" | "mostlyFemale" | null;
  }[];
  /**
   * Format mix per competitor (for individual pie charts). `rawFormats` keeps
   * the source `snapshot.displayFormat` distribution from Meta/Apify so the
   * UI can surface it as a small audit trail beneath each pie.
   */
  formatMixByCompetitor: {
    competitor: string;
    data: { name: string; value: number }[];
    rawFormats: { label: string; count: number }[];
  }[];
  /** Platform distribution */
  platformDistribution: { name: string; count: number }[];
  /** Platform distribution per competitor */
  platformByCompetitor: { competitor: string; data: { name: string; count: number }[] }[];
  /** Average campaign duration (days) per competitor */
  avgDurationByCompetitor: { name: string; days: number }[];
  /** Average copy length per competitor */
  avgCopyLengthByCompetitor: { name: string; chars: number }[];
  /** silva-only — Google's authoritative running-time count per brand,
   *  averaged from `raw_data.numServedDays`. Distinct from
   *  `avgDurationByCompetitor` which is our heuristic from start/end
   *  dates. Empty when source !== "google" or rows pre-date silva. */
  avgServedDaysByCompetitor: { name: string; days: number }[];
  /** silva-only — distinct `raw_data.creativeRegions[]` per brand.
   *  Tells "pan-EU footprint" vs "single-market". Empty when source
   *  !== "google" or rows don't carry the field. */
  regionFootprintByCompetitor: { name: string; countries: number }[];
  /** silva-only — surface mix per brand from
   *  `raw_data.regionStats[].surfaceServingStats[]` (SEARCH / YOUTUBE /
   *  SHOPPING / MAPS). Counts surface occurrences across all regions.
   *  Often empty even on Google because Google publishes
   *  surfaceServingStats only above an internal impression threshold —
   *  the UI surfaces an explanatory empty-state when the list is empty. */
  surfaceMixByCompetitor: {
    competitor: string;
    data: { name: string; count: number }[];
  }[];
  /** Brand Google con ads ma 0 surfaceServingStats. Google pubblica
   *  il breakdown SEARCH/YOUTUBE/SHOPPING/MAPS solo per ads che
   *  hanno accumulato abbastanza impressioni — i brand con ads
   *  recenti o a basso volume mancano dal chart. */
  surfaceMixMissingCompetitors: string[];
  /** silva-only — Tipologia campagna Google inferita per brand
   *  (Performance Max / Demand Gen / Search / YouTube / ...). Vedi
   *  classifyGoogleStrategy. Ogni entry ha confidence high (basata
   *  su surfaceServingStats) o low (fallback su format quando Google
   *  non pubblica le surface). Empty on Meta. */
  googleStrategyByCompetitor: {
    competitor: string;
    data: {
      strategy: string;
      confidence: "high" | "low";
      count: number;
    }[];
  }[];
  /** Ad refresh rate: avg new ads per week per competitor over
   *  `refreshRateWindowDays`. The window matches the user-selected
   *  dateFrom/dateTo so refresh rate is comparable to the rest of the
   *  benchmark, instead of being a fixed 90d figure that misrepresents
   *  brands scanned with a shorter range. */
  refreshRate: { name: string; adsPerWeek: number }[];
  /** Window the refresh rate was computed over (in days). UI uses this
   *  to label the chart dynamically — "Refresh rate (30gg)" etc. */
  refreshRateWindowDays: number;
  /**
   * Diagnostic counts behind refreshRate. Lets the UI verify where the
   * number comes from — total rows seen, rows with start_date, rows
   * counted in the window. Exposed so we can eyeball the math.
   */
  refreshRateDebug: {
    name: string;
    totalInAds: number;
    withStartDate: number;
    countedInWindow: number;
    sourceBreakdown: Record<string, number>;
  }[];
  /** Higher-level diagnostic: what was the pool size that drove the
   *  refresh rate, and did the competitor_id filter reach the DB? */
  refreshRateMeta: {
    allAdsMetaSize: number;
    uniqueCompetitorIdsInPool: number;
    competitorIdsFilterSize: number;
    competitorIdsFilterSample: string[];
  };
  /** Average collation (variant) count per competitor */
  avgVariantsByCompetitor: { name: string; variants: number }[];
  /** Top targeted countries across all ads */
  topTargetedCountries: { name: string; count: number }[];
  totals: {
    totalAds: number;
    activeAds: number;
    avgDuration: number;
    avgCopyLength: number;
  };
}

/**
 * Normalize a CTA label so "Shop Now" / "SHOP NOW" / "shop now" all
 * aggregate into the same bucket. Drops surrounding whitespace, replaces
 * separator characters (_ -) with spaces, and title-cases each word.
 */
function ageRangeBucketOrder(range: string): number {
  const m = range.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

// Local alias for the shared helper so existing call sites stay
// readable. Single source of truth lives in lib/analytics/ad-shared.ts.
const normalizeCtaLabel = sharedNormalizeCta;

/**
 * Return the ad's primary UTM signature. Prefer `utm_campaign`, fall back to
 * `utm_content`, `utm_medium`, `utm_source`. Values are trimmed + lowercased
 * so minor casing differences aggregate. Returns null when no UTM is present.
 */
function extractUtmCampaign(snapshot: Record<string, unknown> | null): string | null {
  if (!snapshot) return null;
  const cards = Array.isArray(snapshot.cards) ? (snapshot.cards as Array<Record<string, unknown>>) : [];
  const urls: string[] = [];
  if (typeof snapshot.linkUrl === "string") urls.push(snapshot.linkUrl);
  for (const c of cards) if (typeof c.linkUrl === "string") urls.push(c.linkUrl);
  for (const u of urls) {
    try {
      const p = new URL(u).searchParams;
      const campaign = p.get("utm_campaign") ?? p.get("utm_content") ?? p.get("utm_medium") ?? p.get("utm_source");
      if (campaign && campaign.trim()) return campaign.trim().toLowerCase().slice(0, 80);
    } catch {
      // malformed URL — skip
    }
  }
  return null;
}

/**
 * Extract every UTM value fragment from all landing URLs on this ad,
 * split by the common separators (_ - / . space |). Returns the tokens so
 * the caller can do keyword matching for audience/objective inference.
 */
function extractUtmTokens(snapshot: Record<string, unknown> | null): Set<string> {
  const tokens = new Set<string>();
  if (!snapshot) return tokens;
  const cards = Array.isArray(snapshot.cards) ? (snapshot.cards as Array<Record<string, unknown>>) : [];
  const urls: string[] = [];
  if (typeof snapshot.linkUrl === "string") urls.push(snapshot.linkUrl);
  for (const c of cards) if (typeof c.linkUrl === "string") urls.push(c.linkUrl);
  for (const u of urls) {
    try {
      const p = new URL(u).searchParams;
      for (const [k, v] of p.entries()) {
        if (!k.toLowerCase().startsWith("utm_")) continue;
        const full = v.trim().toLowerCase();
        if (!full) continue;
        tokens.add(full);
        for (const piece of full.split(/[_\-\/\.\s|]+/)) {
          if (piece.length >= 2) tokens.add(piece);
        }
      }
    } catch {
      // skip malformed
    }
  }
  return tokens;
}

/**
 * Rule-based audience inference from aggregated UTM tokens.
 * Ordered by specificity — first hit wins.
 */
function inferAudienceFromTokens(tokens: Set<string>): { audience: InferredAudience; confidence: number } {
  const hit = (list: string[]) => list.some((t) => tokens.has(t));
  if (hit(["retargeting", "remarketing", "rmk", "rtg", "rtgt"])) return { audience: "retargeting", confidence: 85 };
  if (hit(["lookalike", "lal", "lookal", "lk"])) return { audience: "lookalike", confidence: 80 };
  if (hit(["prospecting", "prosp", "cold", "tof", "topfunnel"])) return { audience: "prospecting", confidence: 80 };
  if (hit(["custom", "cust", "ca"])) return { audience: "custom", confidence: 60 };
  if (hit(["interest", "interests", "int"])) return { audience: "interest", confidence: 55 };
  if (hit(["broad", "open"])) return { audience: "broad", confidence: 55 };
  return { audience: "unknown", confidence: 0 };
}

function inferObjectiveFromTokens(tokens: Set<string>): { objective: InferredObjective; confidence: number } {
  const hit = (list: string[]) => list.some((t) => tokens.has(t));
  if (hit(["purch", "purchase", "conversion", "conv", "vendita", "acquisto"])) return { objective: "sales", confidence: 85 };
  if (hit(["perf", "performance", "sales", "sale"])) return { objective: "sales", confidence: 70 };
  if (hit(["awareness", "reach", "notoriet", "awa", "branding"])) return { objective: "awareness", confidence: 80 };
  if (hit(["videoviews", "video_views", "thruplay", "vv"])) return { objective: "awareness", confidence: 70 };
  if (hit(["lead", "signup", "signup", "registr"])) return { objective: "lead_generation", confidence: 75 };
  if (hit(["install", "download"])) return { objective: "app_install", confidence: 80 };
  if (hit(["engagement", "interact", "interazion"])) return { objective: "engagement", confidence: 65 };
  if (hit(["traffic", "traffico", "link_click", "click", "clic"])) return { objective: "traffic", confidence: 70 };
  return { objective: "unknown", confidence: 0 };
}

/**
 * Per-region activity intersection for Google ads.
 *
 * Su Google, `scan_countries` riflette `regionStats[].regionCode` —
 * cioe' OGNI regione in cui il creativo abbia mai girato durante la
 * sua vita. Le date a livello root (`firstShown` / `lastShown`)
 * collassano lo span cross-region in un singolo intervallo. Risultato:
 * un creativo che ha girato in DE nel 2024 e adesso gira solo in IT
 * ha `scan_countries = ["DE", "IT"]` + `lastShown` recente per via di
 * IT — e finisce conteggiato in "DE ultimi 30 giorni" anche se in DE
 * non andava in onda da due anni.
 *
 * Fix: quando l'utente filtra per paese, intersechiamo le date a
 * livello region prendendo `regionStats[i].firstShown/lastShown` per
 * la region selezionata. Se nessuna entry per quelle region cade nel
 * range richiesto, il creativo viene escluso. Per ads senza
 * regionStats (legacy memo23, Meta) cadiamo sul comportamento
 * precedente — i loro `scan_countries` riflettono gia' il paese
 * scrapato e non il lifetime cross-region.
 */
function googleAdActiveInCountriesDuringRange(
  rawData: Record<string, unknown> | null,
  countries: Set<string>,
  fromMs: number | null,
  toMs: number | null,
): boolean {
  if (!rawData || typeof rawData !== "object") return true;
  const regionStats = rawData.regionStats;
  if (!Array.isArray(regionStats) || regionStats.length === 0) return true;
  let sawMatchingRegion = false;
  for (const r of regionStats) {
    if (!r || typeof r !== "object") continue;
    const stats = r as Record<string, unknown>;
    const code =
      typeof stats.regionCode === "string"
        ? stats.regionCode.toUpperCase()
        : null;
    if (!code || !countries.has(code)) continue;
    sawMatchingRegion = true;
    const first =
      typeof stats.firstShown === "string"
        ? new Date(stats.firstShown).getTime()
        : Number.NaN;
    const last =
      typeof stats.lastShown === "string"
        ? new Date(stats.lastShown).getTime()
        : Number.NaN;
    // Started after window end → didn't run in this region during the window.
    if (toMs !== null && Number.isFinite(first) && first > toMs) continue;
    // Ended before window start → DE activity is dead for this window.
    // A missing lastShown is treated as "still running" (no upper bound).
    if (fromMs !== null && Number.isFinite(last) && last < fromMs) continue;
    return true;
  }
  // If no regionStats entry matched the country filter, fall through to
  // root-level dates (the `scan_countries` array said the country was
  // there, but regionStats lacks the entry — defensive: don't drop the
  // row, let the query-level filters handle it).
  return !sawMatchingRegion;
}

/* ─── Volume pass: per-competitor aggregates ──────────────────
 * Historically computed by paging up to 500k ad rows into Node
 * (fetchAllVolumeRows) and reducing in JS. The same aggregates now come
 * from the mait_ads_benchmark_volume RPC (SQL GROUP BY) for the common
 * case; the row path below is kept verbatim for the google+country case
 * (per-region date intersection needs raw_data.regionStats per row) and
 * as a fallback if the RPC errors. Both produce identical VolumeMaps —
 * verified byte-for-byte against real data before wiring. */
interface VolumeRow {
  id: string;
  competitor_id: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  source: string | null;
  raw_data: Record<string, unknown> | null;
}
interface VolumeRpcRow {
  competitor_id: string | null;
  earliest_start: string | null;
  total: number;
  with_start_date: number;
  recent: number;
  active_in_range: number;
  inactive_in_range: number;
  source_breakdown: Record<string, number> | null;
}
interface VolumeMaps {
  volumeMap: Map<string, { active: number; inactive: number }>;
  earliestByComp: Map<string, string>;
  recentByComp: Map<string, number>;
  totalInAdsByComp: Map<string, number>;
  withStartDateByComp: Map<string, number>;
  sourceBreakdownByComp: Map<string, Record<string, number>>;
  inRangeByComp: Map<string, number>;
  inRangeIds: Set<string>;
  allAdsMetaSize: number;
  uniqueCompetitorIdsInPool: number;
}

function volumeMapsFromRpc(rows: VolumeRpcRow[]): VolumeMaps {
  const volumeMap = new Map<string, { active: number; inactive: number }>();
  const earliestByComp = new Map<string, string>();
  const recentByComp = new Map<string, number>();
  const totalInAdsByComp = new Map<string, number>();
  const withStartDateByComp = new Map<string, number>();
  const sourceBreakdownByComp = new Map<string, Record<string, number>>();
  const inRangeByComp = new Map<string, number>();
  const inRangeIds = new Set<string>();
  let allAdsMetaSize = 0;
  const distinct = new Set<string>();
  for (const r of rows) {
    const key = r.competitor_id ?? "unknown";
    allAdsMetaSize += Number(r.total);
    distinct.add(r.competitor_id ?? "null");
    totalInAdsByComp.set(key, Number(r.total));
    withStartDateByComp.set(key, Number(r.with_start_date));
    recentByComp.set(key, Number(r.recent));
    sourceBreakdownByComp.set(key, r.source_breakdown ?? {});
    const active = Number(r.active_in_range);
    const inactive = Number(r.inactive_in_range);
    volumeMap.set(key, { active, inactive });
    // earliest / inRange skip the null-competitor group (JS `if (!key) continue`).
    if (r.competitor_id) {
      if (r.earliest_start) earliestByComp.set(r.competitor_id, r.earliest_start);
      const inRange = active + inactive;
      if (inRange > 0) {
        inRangeByComp.set(r.competitor_id, inRange);
        inRangeIds.add(r.competitor_id);
      }
    }
  }
  return {
    volumeMap,
    earliestByComp,
    recentByComp,
    totalInAdsByComp,
    withStartDateByComp,
    sourceBreakdownByComp,
    inRangeByComp,
    inRangeIds,
    allAdsMetaSize,
    uniqueCompetitorIdsInPool: distinct.size,
  };
}

function volumeMapsFromRows(
  allAdsMeta: VolumeRow[],
  volumeRows: VolumeRow[],
  windowFromMs: number,
  windowToMs: number,
): VolumeMaps {
  const volumeMap = new Map<string, { active: number; inactive: number }>();
  for (const row of volumeRows) {
    const key = row.competitor_id ?? "unknown";
    const entry = volumeMap.get(key) ?? { active: 0, inactive: 0 };
    if (row.status === "ACTIVE") entry.active++;
    else entry.inactive++;
    volumeMap.set(key, entry);
  }
  const earliestByComp = new Map<string, string>();
  const inRangeByComp = new Map<string, number>();
  const inRangeIds = new Set(
    volumeRows.map((r) => r.competitor_id).filter(Boolean) as string[],
  );
  for (const row of allAdsMeta) {
    const key = row.competitor_id;
    if (!key) continue;
    if (row.start_date) {
      const prev = earliestByComp.get(key);
      if (!prev || row.start_date < prev) earliestByComp.set(key, row.start_date);
    }
  }
  for (const row of volumeRows) {
    const key = row.competitor_id;
    if (!key) continue;
    inRangeByComp.set(key, (inRangeByComp.get(key) ?? 0) + 1);
  }
  const recentByComp = new Map<string, number>();
  const totalInAdsByComp = new Map<string, number>();
  const withStartDateByComp = new Map<string, number>();
  const sourceBreakdownByComp = new Map<string, Record<string, number>>();
  for (const row of allAdsMeta) {
    const key = row.competitor_id ?? "unknown";
    totalInAdsByComp.set(key, (totalInAdsByComp.get(key) ?? 0) + 1);
    const srcKey = row.source ?? "(null)";
    const srcMap = sourceBreakdownByComp.get(key) ?? {};
    srcMap[srcKey] = (srcMap[srcKey] ?? 0) + 1;
    sourceBreakdownByComp.set(key, srcMap);
    if (!row.start_date) continue;
    withStartDateByComp.set(key, (withStartDateByComp.get(key) ?? 0) + 1);
    const t = new Date(row.start_date).getTime();
    if (Number.isNaN(t) || t < windowFromMs || t > windowToMs) continue;
    recentByComp.set(key, (recentByComp.get(key) ?? 0) + 1);
  }
  return {
    volumeMap,
    earliestByComp,
    recentByComp,
    totalInAdsByComp,
    withStartDateByComp,
    sourceBreakdownByComp,
    inRangeByComp,
    inRangeIds,
    allAdsMetaSize: allAdsMeta.length,
    uniqueCompetitorIdsInPool: new Set(
      allAdsMeta.map((r) => r.competitor_id ?? "null"),
    ).size,
  };
}

export async function computeBenchmarks(
  supabase: SupabaseClient,
  workspaceId: string,
  source?: "meta" | "google",
  competitorIds?: string[],
  /** ISO dates (YYYY-MM-DD). If given, only ads overlapping this window
   * are counted. Ads overlap when they started on/before `dateTo` AND
   * (they are still active OR they ended on/after `dateFrom`). */
  dateFrom?: string,
  dateTo?: string,
  /** ISO alpha-2 country codes. When provided, ads are filtered at ad
   * level by array-overlap with `scan_countries` (the ISO codes we
   * passed Apify at scrape time). Ads whose `scan_countries` is NULL
   * are excluded when this filter is active — those are legacy rows
   * scraped before we started requesting one country per scan, so we
   * cannot assign them to a specific market and must wait for the
   * brand to be re-scanned.
   *
   * Intended to make multi-country brands comparable to single-country
   * brands: selecting FR shows only Marina Rinaldi's FR scan results,
   * not her IT/DE/UK/ES scans. */
  countries?: string[],
  /** "active"  → ads whose status is exactly ACTIVE
   *  "inactive" → every other status (ENDED + null + future variants)
   *  undefined → no narrowing.
   *  Applied at query level on both heavy + volume passes so the KPIs,
   *  charts and coverage lists all see the same subset. */
  statusFilter?: "active" | "inactive",
  /** Internal/testing: force the row-based volume path even in the common
   *  case (used to verify the RPC path produces identical output). */
  _forceRowPath?: boolean,
): Promise<BenchmarkData> {
  const normalisedCountries = countries && countries.length > 0
    ? [...new Set(countries.map((c) => c.toUpperCase()))]
    : null;
  // Heavy query (format / CTA / UTM / tags / raw_data-dependent metrics).
  // Paginated with .range() because PostgREST caps each response at 1000
  // rows regardless of .limit().
  //
  // Sort key is (created_at DESC, id DESC). created_at alone is NOT unique
  // — bulk upserts land in the same millisecond — so pagination over a
  // non-unique sort can return the same row in multiple pages. The id
  // tiebreaker makes the sort total and the page walk deterministic.
  // An additional id-based dedupe at the end is belt-and-suspenders.
  async function fetchAllHeavyRows(): Promise<AdRow[]> {
    // PAGE must match (or be smaller than) the Supabase response cap.
    // Supabase caps .range() responses at 1000 rows; any larger PAGE made
    // the `data.length < PAGE` break condition trigger after a single
    // iteration, so pagination silently stopped at 1000 total rows.
    const PAGE = 1000;
    const SAFETY_CAP = 15_000;
    const rows: AdRow[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let q = supabase
        .from("mait_ads_external")
        .select(
          "id, competitor_id, cta, platforms, image_url, video_url, status, start_date, end_date, ad_text, created_at, raw_data, scan_countries"
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE - 1);
      if (source) q = q.eq("source", source);
      if (competitorIds && competitorIds.length > 0) q = q.in("competitor_id", competitorIds);
      if (dateTo) q = q.lte("start_date", dateTo);
      if (dateFrom) {
        // Ad still running during the range: end_date missing/in the future,
        // OR ad is marked ACTIVE, OR it ended on/after dateFrom.
        q = q.or(`end_date.gte.${dateFrom},end_date.is.null,status.eq.ACTIVE`);
      }
      // Country filter at ad level — Postgres array overlap via PostgREST
      // operator `ov`. Rows whose scan_countries is NULL are excluded
      // automatically (NULL never overlaps).
      //
      // Vale per ENTRAMBI i canali:
      //   - Meta: silva95gustavo + facebook-ads-library-scraper popolano
      //     scan_countries con i paesi che abbiamo passato come scope.
      //   - Google: silva95gustavo google-ad-transparency-scraper popola
      //     scan_countries da regionStats[].regionCode (cross-region
      //     activity reportata da Google Transparency Center). Legacy
      //     rows scrapate con il vecchio automation-lab actor hanno
      //     scan_countries NULL e vengono escluse — vanno re-scansionate.
      if (normalisedCountries) {
        q = q.overlaps("scan_countries", normalisedCountries);
      }
      // Status filter — applied at the database so the filter is honoured
      // by the SAFETY_CAP pagination loop; doing it post-fetch would risk
      // truncating an inactive-only result set under the cap.
      if (statusFilter === "active") q = q.eq("status", "ACTIVE");
      else if (statusFilter === "inactive") q = q.neq("status", "ACTIVE");
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      rows.push(...(data as AdRow[]));
      if (data.length < PAGE) break;
    }
    // Final dedupe: if the provider returned the same row on consecutive
    // pages, strip the duplicates so every metric sees each ad exactly once.
    const seen = new Set<string>();
    const unique: AdRow[] = [];
    for (const r of rows) {
      if (!r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      unique.push(r);
    }
    return unique;
  }

  // Separate lightweight + paginated query used for the Volume chart AND
  // for the per-brand coverage signal. We pull start_date too so we can
  // compute the oldest ad start per brand without a second trip.
  // Supabase/PostgREST caps single responses (1000 rows by default) even if
  // you pass a larger .limit(), so we page through with .range() until we
  // have every row. The 500k safety stop guards against a runaway loop.
  async function fetchAllVolumeRows(): Promise<{
    id: string;
    competitor_id: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    source: string | null;
    raw_data: Record<string, unknown> | null;
  }[]> {
    const PAGE = 1000;
    const SAFETY_CAP = 500_000;
    type Row = {
      id: string;
      competitor_id: string | null;
      status: string | null;
      start_date: string | null;
      end_date: string | null;
      source: string | null;
      raw_data: Record<string, unknown> | null;
    };
    // Fetch raw_data only when we need to intersect with per-region
    // dates (Google + country filter). Otherwise it's wasted bandwidth
    // — raw_data can be ~10kB per row on silva and the volume pass
    // walks every ad in the workspace.
    const needsRegionStats =
      source === "google" && normalisedCountries !== null;
    const selectCols = needsRegionStats
      ? "id, competitor_id, status, start_date, end_date, source, raw_data"
      : "id, competitor_id, status, start_date, end_date, source";
    const rows: Row[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      // `id` is included in the SELECT only so we can dedupe at the
      // end. PostgREST occasionally returned the same row on
      // consecutive pages in earlier audits when the order key had
      // ties — id is unique so it is impossible by definition with
      // `order("id")`, but the dedupe is cheap and protects every
      // metric downstream from any future regression.
      let q = supabase
        .from("mait_ads_external")
        .select(selectCols)
        .eq("workspace_id", workspaceId)
        .order("id")
        .range(from, from + PAGE - 1);
      if (source) q = q.eq("source", source);
      if (competitorIds && competitorIds.length > 0) q = q.in("competitor_id", competitorIds);
      // Same ad-level country filter as the heavy query. Ads without a
      // known scan_countries (NULL) never overlap, so legacy data is
      // excluded until the brand is re-scanned. Vale per Meta + Google
      // (silva95gustavo google-ad-transparency-scraper popola
      // scan_countries da regionStats).
      if (normalisedCountries) {
        q = q.overlaps("scan_countries", normalisedCountries);
      }
      if (statusFilter === "active") q = q.eq("status", "ACTIVE");
      else if (statusFilter === "inactive") q = q.neq("status", "ACTIVE");
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      rows.push(...(data as unknown as Row[]));
      if (data.length < PAGE) break;
    }
    const seen = new Set<string>();
    const unique: Row[] = [];
    for (const r of rows) {
      if (!r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      unique.push(r);
    }
    return unique;
  }

  const [{ data: competitors }, rawAdsPages] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name, country")
      .eq("workspace_id", workspaceId)
      .order("page_name"),
    fetchAllHeavyRows(),
  ]);

  // Ads within the requested date range — drives volume counts.
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toMs = dateTo ? new Date(dateTo + "T23:59:59Z").getTime() : null;
  // Per-region date intersection — applied ONLY on Google + country
  // filter (see googleAdActiveInCountriesDuringRange). Its presence also
  // decides the volume-pass path: RPC for the common case, rows for
  // google+country (the RPC can't do the per-row regionStats intersection).
  const countryFilterSet =
    source === "google" && normalisedCountries
      ? new Set(normalisedCountries)
      : null;
  // Refresh-rate window — also needed by the volume aggregation below, so
  // it's computed here (was previously computed further down).
  const windowToMs = dateTo
    ? new Date(dateTo + "T23:59:59Z").getTime()
    : Date.now();
  const windowFromMs = dateFrom
    ? new Date(dateFrom).getTime()
    : windowToMs - 90 * 86_400_000;
  const windowDays = Math.max(
    1,
    Math.round((windowToMs - windowFromMs) / 86_400_000),
  );

  // Volume-pass aggregates: SQL GROUP BY (mait_ads_benchmark_volume) for
  // the common case so we don't page every ad into Node; the row-based
  // path (byte-identical) is used for google+country and as an RPC-error
  // fallback. Boundaries are passed to the RPC as timestamptz params so
  // SQL does only exact comparisons (no date-math divergence).
  let vol: VolumeMaps | null = null;
  if (!countryFilterSet && !_forceRowPath) {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      "mait_ads_benchmark_volume",
      {
        p_workspace_id: workspaceId,
        p_source: source ?? null,
        p_competitor_ids:
          competitorIds && competitorIds.length > 0 ? competitorIds : null,
        p_countries: normalisedCountries ?? null,
        p_status: statusFilter ?? null,
        p_overlap_from: fromMs !== null ? new Date(fromMs).toISOString() : null,
        p_overlap_to: toMs !== null ? new Date(toMs).toISOString() : null,
        p_refresh_from: new Date(windowFromMs).toISOString(),
        p_refresh_to: new Date(windowToMs).toISOString(),
      },
    );
    if (rpcErr) {
      logger.error(
        "benchmarks volume RPC failed, falling back to row path",
        {
          channel: "benchmarks",
          event: "volume_rpc.failed",
          workspaceId,
          source: source ?? null,
        },
        rpcErr,
      );
    } else if (rpcRows) {
      vol = volumeMapsFromRpc(rpcRows as VolumeRpcRow[]);
    }
  }
  if (!vol) {
    const allAdsMeta = (await fetchAllVolumeRows()) as VolumeRow[];
    const volumeRows = allAdsMeta
      .filter((r) => {
        if (!r.start_date) return false;
        const s = new Date(r.start_date).getTime();
        if (toMs !== null && s > toMs) return false;
        if (fromMs !== null) {
          const stillRunning = r.status === "ACTIVE" || !r.end_date;
          const e = r.end_date ? new Date(r.end_date).getTime() : null;
          if (!stillRunning && e !== null && e < fromMs) return false;
        }
        return true;
      })
      .filter((r) => {
        if (!countryFilterSet) return true;
        return googleAdActiveInCountriesDuringRange(
          r.raw_data ?? null,
          countryFilterSet,
          fromMs,
          toMs,
        );
      });
    vol = volumeMapsFromRows(allAdsMeta, volumeRows, windowFromMs, windowToMs);
  }
  const {
    volumeMap,
    earliestByComp,
    recentByComp,
    totalInAdsByComp,
    withStartDateByComp,
    sourceBreakdownByComp,
    inRangeByComp,
    inRangeIds,
  } = vol;

  const comps = (competitors ?? []) as CompetitorRef[];
  // Heavy rows: apply the same per-region intersection so totalAds
  // KPI + format / CTA / strategy aggregations match the filtered
  // volume chart.
  const ads = countryFilterSet
    ? rawAdsPages.filter((a) =>
        googleAdActiveInCountriesDuringRange(
          a.raw_data,
          countryFilterSet,
          fromMs,
          toMs,
        ),
      )
    : rawAdsPages;
  // When a project filter is applied we want every brand in the filter scope
  // to appear in "volume per brand" even if it has zero ads so the chart
  // reflects the whole project — not just brands with scanned ads.
  const scopedCompetitorIds = competitorIds && competitorIds.length > 0
    ? new Set(competitorIds)
    : null;
  const compMap = new Map(comps.map((c) => [c.id, c.page_name]));

  const coverageIds = scopedCompetitorIds ?? new Set(comps.map((c) => c.id));
  const coverageByCompetitor = [...coverageIds]
    .filter((id) => inRangeIds.has(id) || earliestByComp.has(id) || coverageIds.has(id))
    .map((id) => ({
      competitorId: id,
      competitor: compMap.get(id) ?? "N/A",
      earliestStart: earliestByComp.get(id) ?? null,
      adsInRange: inRangeByComp.get(id) ?? 0,
    }));

  // ---- Country scan coverage per competitor ----
  // Aggregates `scan_countries` from the heavy query (which already
  // respects the user-selected date range) so the warning is anchored
  // to the same data shown in the charts. A configured country with
  // zero ads in the analysis window earns its way into emptyCountries.
  const scanCountriesByComp = new Map<string, Set<string>>();
  for (const ad of rawAdsPages) {
    const key = ad.competitor_id;
    if (!key || !Array.isArray(ad.scan_countries)) continue;
    const set = scanCountriesByComp.get(key) ?? new Set<string>();
    for (const c of ad.scan_countries) {
      if (typeof c === "string" && c) set.add(c.toUpperCase());
    }
    scanCountriesByComp.set(key, set);
  }
  function parseConfiguredCountries(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2,3}$/.test(c));
  }
  const countryScanCoverage = [...coverageIds]
    .map((id) => {
      const c = comps.find((cc) => cc.id === id);
      const configured = parseConfiguredCountries(c?.country ?? null);
      if (configured.length === 0) return null;
      const scanned = scanCountriesByComp.get(id) ?? new Set<string>();
      const empty = configured.filter((cc) => !scanned.has(cc));
      return {
        competitor: compMap.get(id) ?? "N/A",
        configuredCountries: configured,
        scannedCountriesWithData: [...scanned].sort(),
        emptyCountries: empty,
      };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> =>
        entry !== null && entry.emptyCountries.length > 0,
    )
    .sort((a, b) => b.emptyCountries.length - a.emptyCountries.length);
  // Pad with zero-ads brands so the chart always shows the full project scope.
  const volumeIds = scopedCompetitorIds ?? new Set(comps.map((c) => c.id));
  for (const id of volumeIds) {
    if (!volumeMap.has(id)) volumeMap.set(id, { active: 0, inactive: 0 });
  }
  const volumeByCompetitor = [...volumeMap.entries()]
    .filter(([id]) => id !== "unknown" && (!scopedCompetitorIds || scopedCompetitorIds.has(id)))
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", ...v }))
    .sort((a, b) => b.active + b.inactive - (a.active + a.inactive));

  // ---- Format mix (uses displayFormat from raw_data) ----
  // Buckets: image / video / carousel (manual) / dpa (catalog carousel) /
  // text (Google Search / responsive text ads) / unknown.
  // We separate DPA from CAROUSEL so fashion / ecom workspaces can see how
  // much of their "carousel" share is really dynamic catalog ads. We
  // separate "text" from "unknown" so Google Search investment is
  // identifiable instead of pooled into a generic "Other".
  let imageCount = 0;
  let videoCount = 0;
  let carouselCount = 0;
  let dpaCount = 0;
  let textCount = 0;
  let unknownCount = 0;
  const formatByComp = new Map<
    string,
    {
      image: number;
      video: number;
      carousel: number;
      dpa: number;
      text: number;
      unknown: number;
    }
  >();
  // Raw displayFormat tally per brand — audit trail exposed in the UI so we
  // can see exactly what the scraper returns instead of just our bucketing.
  const rawFormatByComp = new Map<string, Map<string, number>>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = formatByComp.get(key) ?? {
      image: 0,
      video: 0,
      carousel: 0,
      dpa: 0,
      text: 0,
      unknown: 0,
    };
    // Track raw displayFormat distribution (audit trail surfaced in
    // the UI under each per-brand pie). Bucketing logic itself lives
    // in classifyAdFormat — single source of truth for every surface.
    const snapshot = (ad.raw_data?.snapshot ?? null) as Record<string, unknown> | null;
    const rawFormat = (snapshot?.displayFormat as string | undefined)?.toUpperCase() ?? null;
    const rawLabel = rawFormat ?? "(empty)";
    const rawMap = rawFormatByComp.get(key) ?? new Map<string, number>();
    rawMap.set(rawLabel, (rawMap.get(rawLabel) ?? 0) + 1);
    rawFormatByComp.set(key, rawMap);

    const bucket = classifyAdFormat(ad);
    if (bucket === "carousel") { carouselCount++; entry.carousel++; }
    else if (bucket === "dpa") { dpaCount++; entry.dpa++; }
    else if (bucket === "video") { videoCount++; entry.video++; }
    else if (bucket === "image") { imageCount++; entry.image++; }
    else if (bucket === "text") { textCount++; entry.text++; }
    else { unknownCount++; entry.unknown++; }
    formatByComp.set(key, entry);
  }
  // Canonical order: Image, Video, Carousel, DPA, Text, Other. Order matters so
  // the UI always lays slices out the same way.
  const formatMix = [
    { name: "Image", value: imageCount },
    { name: "Video", value: videoCount },
    { name: "Carousel", value: carouselCount },
    { name: "DPA", value: dpaCount },
    { name: "Text", value: textCount },
    ...(unknownCount > 0 ? [{ name: "Other", value: unknownCount }] : []),
  ].filter((f) => f.value > 0);
  const formatByCompetitor = [...formatByComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", ...v }))
    .sort((a, b) =>
      (b.image + b.video + b.carousel + b.dpa + b.text) -
      (a.image + a.video + a.carousel + a.dpa + a.text)
    );

  // Format mix per competitor (individual pie charts)
  const formatMixByCompetitor = [...formatByComp.entries()]
    .map(([id, v]) => ({
      competitor: compMap.get(id) ?? "N/A",
      rawFormats: [...(rawFormatByComp.get(id) ?? new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count })),
      data: [
        { name: "Image", value: v.image },
        { name: "Video", value: v.video },
        { name: "Carousel", value: v.carousel },
        { name: "DPA", value: v.dpa },
        { name: "Text", value: v.text },
        ...(v.unknown > 0 ? [{ name: "Other", value: v.unknown }] : []),
      ].filter((f) => f.value > 0),
    }))
    .sort((a, b) => {
      const ta = a.data.reduce((s, d) => s + d.value, 0);
      const tb = b.data.reduce((s, d) => s + d.value, 0);
      return tb - ta;
    });

  // ---- Top CTAs (normalised so 'Shop Now' / 'SHOP_NOW' bucket together)
  const ctaCount = new Map<string, number>();
  for (const ad of ads) {
    if (!ad.cta) continue;
    const key = normalizeCtaLabel(ad.cta);
    if (!key) continue;
    ctaCount.set(key, (ctaCount.get(key) ?? 0) + 1);
  }
  const topCtas = [...ctaCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // CTA per competitor (top 5 CTAs) — also normalised
  const topCtaNames = topCtas.slice(0, 5).map((c) => c.name);
  const ctaByCompMap = new Map<string, Record<string, number>>();
  // Per-competitor full CTA distribution (for per-brand charts, not limited
  // to global top 5 — each brand may favour its own set of CTAs).
  const fullCtaByCompMap = new Map<string, Map<string, number>>();
  for (const ad of ads) {
    if (!ad.cta) continue;
    const normalized = normalizeCtaLabel(ad.cta);
    if (!normalized) continue;
    const key = ad.competitor_id ?? "unknown";
    const fullEntry = fullCtaByCompMap.get(key) ?? new Map<string, number>();
    fullEntry.set(normalized, (fullEntry.get(normalized) ?? 0) + 1);
    fullCtaByCompMap.set(key, fullEntry);
    if (!topCtaNames.includes(normalized)) continue;
    const entry = ctaByCompMap.get(key) ?? {};
    entry[normalized] = (entry[normalized] ?? 0) + 1;
    ctaByCompMap.set(key, entry);
  }
  const ctaByCompetitor = [...ctaByCompMap.entries()].map(([id, ctas]) => ({
    name: compMap.get(id) ?? "N/A",
    ...ctas,
  }));
  // Top 6 CTAs per brand, descending by frequency, for the per-brand chart
  const ctaMixByCompetitor = [...fullCtaByCompMap.entries()]
    .map(([id, tagMap]) => ({
      competitor: compMap.get(id) ?? "N/A",
      data: [...tagMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count]) => ({ name, count })),
    }))
    .filter((e) => e.data.length > 0)
    .sort((a, b) => {
      const ta = a.data.reduce((s, d) => s + d.count, 0);
      const tb = b.data.reduce((s, d) => s + d.count, 0);
      return tb - ta;
    });

  // Brand con ads ma senza CTA estratte. Confronto con compMap (tutti
  // i brand con almeno una ad nel pool): chi e' fuori dal chart CTA
  // sopra ma c'e' tra i brand con ads viene listato per il client.
  const ctaPresentNames = new Set(ctaMixByCompetitor.map((e) => e.competitor));
  const brandsWithAds = new Set<string>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const name = compMap.get(key);
    if (name && name !== "N/A") brandsWithAds.add(name);
  }
  const ctaMissingCompetitors = [...brandsWithAds]
    .filter((n) => !ctaPresentNames.has(n))
    .sort();

  // ---- UTM insights: audience + objective inference per competitor ----
  // Per brand we union all UTM tokens across all their ads, then run two
  // rule-based inferences. We also keep the single most frequent
  // utm_campaign value as a human-readable sample on the card.
  const tokensByComp = new Map<string, Set<string>>();
  const campaignFreqByComp = new Map<string, Map<string, number>>();
  for (const ad of ads) {
    const snapshot = (ad.raw_data?.snapshot ?? null) as Record<string, unknown> | null;
    const tokens = extractUtmTokens(snapshot);
    if (tokens.size === 0) continue;
    const key = ad.competitor_id ?? "unknown";
    const agg = tokensByComp.get(key) ?? new Set<string>();
    for (const t of tokens) agg.add(t);
    tokensByComp.set(key, agg);

    const utmCampaign = extractUtmCampaign(snapshot);
    if (utmCampaign) {
      const m = campaignFreqByComp.get(key) ?? new Map<string, number>();
      m.set(utmCampaign, (m.get(utmCampaign) ?? 0) + 1);
      campaignFreqByComp.set(key, m);
    }
  }

  const utmInsightsByCompetitor = [...tokensByComp.entries()]
    .map(([id, tokens]) => {
      const { audience, confidence: aConf } = inferAudienceFromTokens(tokens);
      const { objective, confidence: oConf } = inferObjectiveFromTokens(tokens);
      const campaignFreq = campaignFreqByComp.get(id);
      const sampleCampaign = campaignFreq
        ? [...campaignFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
        : null;
      return {
        competitor: compMap.get(id) ?? "N/A",
        audience,
        objective,
        audienceConfidence: aConf,
        objectiveConfidence: oConf,
        sampleCampaign,
      };
    })
    // Drop brands where BOTH inferences failed — nothing useful to show.
    .filter((e) => e.audience !== "unknown" || e.objective !== "unknown")
    .sort((a, b) => (b.audienceConfidence + b.objectiveConfidence) - (a.audienceConfidence + a.objectiveConfidence));

  // ---- Platform distribution ----
  const platCount = new Map<string, number>();
  const platByComp = new Map<string, Map<string, number>>();
  for (const ad of ads) {
    if (!Array.isArray(ad.platforms)) continue;
    const key = ad.competitor_id ?? "unknown";
    const compPlat = platByComp.get(key) ?? new Map<string, number>();
    for (const p of ad.platforms) {
      platCount.set(p, (platCount.get(p) ?? 0) + 1);
      compPlat.set(p, (compPlat.get(p) ?? 0) + 1);
    }
    platByComp.set(key, compPlat);
  }
  const platformDistribution = [...platCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const platformByCompetitor = [...platByComp.entries()]
    .map(([id, platMap]) => ({
      competitor: compMap.get(id) ?? "N/A",
      data: [...platMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    }))
    .sort((a, b) => {
      const ta = a.data.reduce((s, d) => s + d.count, 0);
      const tb = b.data.reduce((s, d) => s + d.count, 0);
      return tb - ta;
    });

  // ---- Campaign duration ----
  // Single source of truth in computeAdDurationDays — ACTIVE ads
  // ignore end_date (Meta Ad Library sets it to snapshot date, not
  // real campaign end), sub-day campaigns clamp to 1 day so they are
  // never silently dropped from the average.
  const durationByComp = new Map<string, number[]>();
  for (const ad of ads) {
    const days = computeAdDurationDays(ad);
    if (days == null) continue;
    const key = ad.competitor_id ?? "unknown";
    const arr = durationByComp.get(key) ?? [];
    arr.push(days);
    durationByComp.set(key, arr);
  }
  const avgDurationByCompetitor = [...durationByComp.entries()]
    .map(([id, arr]) => ({
      name: compMap.get(id) ?? "N/A",
      days: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    }))
    .sort((a, b) => b.days - a.days);

  // ---- Copy length ----
  const copyByComp = new Map<string, number[]>();
  for (const ad of ads) {
    const len = (ad.ad_text ?? "").length;
    if (len === 0) continue;
    const key = ad.competitor_id ?? "unknown";
    const arr = copyByComp.get(key) ?? [];
    arr.push(len);
    copyByComp.set(key, arr);
  }
  const avgCopyLengthByCompetitor = [...copyByComp.entries()]
    .map(([id, arr]) => ({
      name: compMap.get(id) ?? "N/A",
      chars: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    }))
    .sort((a, b) => b.chars - a.chars);

  // ---- silva-only Google enrichments ----
  // Three Google-specific signals that silva returns and we used to
  // throw away. All read from raw_data and degrade gracefully on rows
  // that don't carry the field (legacy automation-lab / Meta rows
  // simply don't enter the maps).
  const surfaceByComp = new Map<string, Map<string, number>>();
  const servedDaysByComp = new Map<string, number[]>();
  const regionsByComp = new Map<string, Set<string>>();
  // Tipologia campagna Google inferita (PMax / Demand Gen / Search /
  // YouTube / ...) — vedi `lib/analytics/google-strategy.ts`. Mappa
  // competitor_id → strategyKey ("pmax-high", "search_likely-low", ...)
  // → count. Strategia formato "strategy-confidence" cosi' il chart
  // separa visivamente i bucket high/low.
  const strategyByComp = new Map<string, Map<string, number>>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const raw = ad.raw_data;
    if (!raw) continue;

    // Classificazione campagna Google. Su Meta classifyGoogleStrategy
    // ritorna 'unknown' perche' i format Meta non matchano TEXT/VIDEO/
    // IMAGE puri, quindi entra solo Google data.
    const format = (raw as Record<string, unknown>).format;
    const cls = classifyGoogleStrategy(
      raw,
      typeof format === "string" ? format : null,
    );
    if (cls.strategy !== "unknown") {
      const sMap = strategyByComp.get(key) ?? new Map<string, number>();
      const k = `${cls.strategy}-${cls.confidence}`;
      sMap.set(k, (sMap.get(k) ?? 0) + 1);
      strategyByComp.set(key, sMap);
    }

    // surfaceServingStats[].surfaceCode (SEARCH / YOUTUBE / SHOPPING /
    // MAPS). Only published by Google for ads above an internal
    // impression threshold, so this map stays empty for many brands —
    // that's the empty-state the UI explains, not a bug.
    const regionStats = (raw as Record<string, unknown>).regionStats;
    if (Array.isArray(regionStats)) {
      const sMap = surfaceByComp.get(key) ?? new Map<string, number>();
      for (const r of regionStats) {
        const stats = (r as Record<string, unknown>)?.surfaceServingStats;
        if (!Array.isArray(stats)) continue;
        for (const s of stats) {
          const code = (s as Record<string, unknown>)?.surfaceCode;
          if (typeof code === "string" && code) {
            sMap.set(code, (sMap.get(code) ?? 0) + 1);
          }
        }
      }
      if (sMap.size > 0) surfaceByComp.set(key, sMap);
    }

    // numServedDays — Google's authoritative running-time count, more
    // accurate than our heuristic on long-running campaigns whose
    // firstShown predates our scrape.
    const n = (raw as Record<string, unknown>).numServedDays;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
      const list = servedDaysByComp.get(key) ?? [];
      list.push(n);
      servedDaysByComp.set(key, list);
    }

    // creativeRegions[] — distinct region names ("Italy", "Germany"…).
    // We just count the set size so the UI can show "Served in 24
    // countries" — granular per-country UI belongs to brand detail.
    const regions = (raw as Record<string, unknown>).creativeRegions;
    if (Array.isArray(regions)) {
      const set = regionsByComp.get(key) ?? new Set<string>();
      for (const r of regions) if (typeof r === "string" && r) set.add(r);
      if (set.size > 0) regionsByComp.set(key, set);
    }
  }

  const surfaceMixByCompetitor = [...surfaceByComp.entries()]
    .map(([id, m]) => ({
      competitor: compMap.get(id) ?? "N/A",
      data: [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    }))
    .sort(
      (a, b) =>
        b.data.reduce((s, d) => s + d.count, 0) -
        a.data.reduce((s, d) => s + d.count, 0),
    );

  // Tipologia campagna Google inferita per brand.
  const googleStrategyByCompetitor = [...strategyByComp.entries()]
    .map(([id, m]) => ({
      competitor: compMap.get(id) ?? "N/A",
      data: [...m.entries()]
        .map(([k, count]) => {
          const sep = k.lastIndexOf("-");
          const strategy = k.slice(0, sep);
          const confidence = k.slice(sep + 1) as "high" | "low";
          return { strategy, confidence, count };
        })
        .sort((a, b) => b.count - a.count),
    }))
    .filter((e) => e.data.length > 0)
    .sort(
      (a, b) =>
        b.data.reduce((s, d) => s + d.count, 0) -
        a.data.reduce((s, d) => s + d.count, 0),
    );

  // Brand con ads Google ma senza surfaceServingStats. Idem ctaMissing:
  // Google espone il breakdown solo per ads con impressioni sopra
  // soglia interna, quindi brand piccoli o ads recenti spariscono.
  const surfacePresentNames = new Set(
    surfaceMixByCompetitor.map((e) => e.competitor),
  );
  const surfaceMixMissingCompetitors = [...brandsWithAds]
    .filter((n) => !surfacePresentNames.has(n))
    .sort();

  const avgServedDaysByCompetitor = [...servedDaysByComp.entries()]
    .map(([id, list]) => ({
      name: compMap.get(id) ?? "N/A",
      days:
        list.length > 0
          ? Math.round(list.reduce((a, b) => a + b, 0) / list.length)
          : 0,
    }))
    .filter((e) => e.days > 0)
    .sort((a, b) => b.days - a.days);

  const regionFootprintByCompetitor = [...regionsByComp.entries()]
    .map(([id, set]) => ({
      name: compMap.get(id) ?? "N/A",
      countries: set.size,
    }))
    .filter((e) => e.countries > 0)
    .sort((a, b) => b.countries - a.countries);

  // ---- Refresh rate ----
  // Window matches the user-selected dateFrom/dateTo so refresh rate is
  // comparable across brands evaluated under the same analysis window.
  // The old "fixed 90d" baked in two bugs at once: (a) brands scanned
  // with a 30d date_from looked artificially inactive because the
  // numerator only had 30d of data while the denominator was 12.86
  // weeks; (b) two analyses on different windows could not be compared
  // because the metric ignored the chosen window.
  //
  // Defaults: when neither dateFrom nor dateTo is set, fall back to
  // the legacy 90d rolling window so existing API consumers keep
  // working. When dateFrom is set without dateTo, the window ends
  // today.
  //
  // Computed from allAdsMeta (the uncapped paginated volume set), not
  // from `ads`, because `ads` is already filtered by the heavy date
  // range / overlap predicate. allAdsMeta still respects the source
  // and competitor filters, so the windowing here is purely a
  // start_date check.
  //
  // Ads without a real start_date are skipped: Meta does not always
  // populate the field for DPA catalog ads, and the older "fall back
  // to created_at" trick falsely inflated the rate after bulk scans.
  // windowToMs / windowFromMs / windowDays are computed up top (needed by
  // the volume aggregation). recentByComp / totalInAdsByComp /
  // withStartDateByComp / sourceBreakdownByComp come from `vol` (RPC or
  // row path) — see the volume-pass block above.
  const weeks = windowDays / 7;
  const refreshRate = [...recentByComp.entries()]
    .map(([id, n]) => ({
      name: compMap.get(id) ?? "N/A",
      adsPerWeek: Math.round((n / weeks) * 10) / 10,
    }))
    // name tiebreaker → deterministic order independent of Map insertion
    // order (which differs between the RPC and row volume paths).
    .sort((a, b) => b.adsPerWeek - a.adsPerWeek || a.name.localeCompare(b.name));
  // Diagnostic: include EVERY brand we iterated, even those with zero
  // ads-in-window, so eyeballing "why is it X" is straightforward.
  const refreshRateDebug = [...totalInAdsByComp.entries()]
    .map(([id, total]) => ({
      name: compMap.get(id) ?? "N/A",
      totalInAds: total,
      withStartDate: withStartDateByComp.get(id) ?? 0,
      countedInWindow: recentByComp.get(id) ?? 0,
      // Normalise key order (Postgres jsonb orders keys by length, JS by
      // insertion) so the diagnostic object is deterministic across the
      // RPC and row volume paths.
      sourceBreakdown: Object.fromEntries(
        Object.entries(sourceBreakdownByComp.get(id) ?? {}).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    }))
    .sort(
      (a, b) =>
        b.countedInWindow - a.countedInWindow || a.name.localeCompare(b.name),
    );

  // ---- Avg variants per ad (collationCount) ----
  const variantsByComp = new Map<string, number[]>();
  for (const ad of ads) {
    const cc = ad.raw_data?.collationCount;
    if (typeof cc !== "number" || cc <= 0) continue;
    const key = ad.competitor_id ?? "unknown";
    const arr = variantsByComp.get(key) ?? [];
    arr.push(cc);
    variantsByComp.set(key, arr);
  }
  const avgVariantsByCompetitor = [...variantsByComp.entries()]
    .map(([id, arr]) => ({
      name: compMap.get(id) ?? "N/A",
      variants: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10,
    }))
    .sort((a, b) => b.variants - a.variants);

  // ---- EU DSA audience roll-up per competitor ----
  const audienceByComp = new Map<
    string,
    {
      euReach: number;
      adsWithInsights: number;
      ageMap: Map<string, number>;
      gender: { male: number; female: number; unknown: number };
    }
  >();
  for (const ad of ads) {
    const insights = extractAdInsights(ad.raw_data);
    if (!insights.hasData) continue;
    const key = ad.competitor_id ?? "unknown";
    const entry = audienceByComp.get(key) ?? {
      euReach: 0,
      adsWithInsights: 0,
      ageMap: new Map<string, number>(),
      gender: { male: 0, female: 0, unknown: 0 },
    };
    entry.adsWithInsights++;
    if (insights.euReach != null) entry.euReach += insights.euReach;
    for (const a of insights.ageTotals) {
      entry.ageMap.set(a.ageRange, (entry.ageMap.get(a.ageRange) ?? 0) + a.count);
    }
    entry.gender.male += insights.genderTotals.male;
    entry.gender.female += insights.genderTotals.female;
    entry.gender.unknown += insights.genderTotals.unknown;
    audienceByComp.set(key, entry);
  }
  const audienceByCompetitor = [...audienceByComp.entries()]
    .map(([id, v]) => {
      const ageTotals = [...v.ageMap.entries()]
        .map(([ageRange, count]) => ({ ageRange, count }))
        .sort((a, b) => ageRangeBucketOrder(a.ageRange) - ageRangeBucketOrder(b.ageRange));
      const dominantAge = ageTotals.reduce<{ ageRange: string; count: number } | null>(
        (best, cur) => (best && best.count >= cur.count ? best : cur),
        null
      );
      const paid = v.gender.male + v.gender.female;
      let genderLabel: "all" | "mostlyMale" | "mostlyFemale" | null = null;
      if (paid > 0) {
        const maleShare = v.gender.male / paid;
        if (maleShare >= 0.65) genderLabel = "mostlyMale";
        else if (maleShare <= 0.35) genderLabel = "mostlyFemale";
        else genderLabel = "all";
      }
      return {
        competitor: compMap.get(id) ?? "N/A",
        euReach: v.euReach,
        adsWithInsights: v.adsWithInsights,
        ageTotals,
        dominantAge: dominantAge?.ageRange ?? null,
        gender: v.gender,
        genderLabel,
      };
    })
    .sort((a, b) => b.euReach - a.euReach);

  // ---- Top targeted countries ----
  // Counts distinct ads per country based on scan_countries — the ISO
  // codes we explicitly asked Apify for at scrape time. raw_data.
  // targetedOrReachedCountries used to live here but Meta ships it empty
  // on every ad so the metric was always zero.
  const countryCount = new Map<string, number>();
  for (const ad of ads) {
    const countries = ad.scan_countries;
    if (!Array.isArray(countries)) continue;
    for (const c of countries) {
      if (typeof c === "string" && c) {
        countryCount.set(c, (countryCount.get(c) ?? 0) + 1);
      }
    }
  }
  const topTargetedCountries = [...countryCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  // ---- Totals ----
  const allDurations = [...durationByComp.values()].flat();
  const allCopy = [...copyByComp.values()].flat();
  const totals = {
    totalAds: ads.length,
    activeAds: ads.filter((a) => a.status === "ACTIVE").length,
    avgDuration:
      allDurations.length > 0
        ? Math.round(
            allDurations.reduce((a, b) => a + b, 0) / allDurations.length
          )
        : 0,
    avgCopyLength:
      allCopy.length > 0
        ? Math.round(allCopy.reduce((a, b) => a + b, 0) / allCopy.length)
        : 0,
  };

  return {
    competitors: comps,
    volumeByCompetitor,
    formatMix,
    formatByCompetitor,
    formatMixByCompetitor,
    topCtas,
    ctaByCompetitor,
    ctaMixByCompetitor,
    ctaMissingCompetitors,
    utmInsightsByCompetitor,
    coverageByCompetitor,
    countryScanCoverage,
    audienceByCompetitor,
    platformDistribution,
    platformByCompetitor,
    avgDurationByCompetitor,
    avgCopyLengthByCompetitor,
    avgServedDaysByCompetitor,
    regionFootprintByCompetitor,
    surfaceMixByCompetitor,
    surfaceMixMissingCompetitors,
    googleStrategyByCompetitor,
    refreshRate,
    refreshRateWindowDays: windowDays,
    refreshRateDebug,
    refreshRateMeta: {
      allAdsMetaSize: vol.allAdsMetaSize,
      uniqueCompetitorIdsInPool: vol.uniqueCompetitorIdsInPool,
      competitorIdsFilterSize: competitorIds?.length ?? 0,
      competitorIdsFilterSample: competitorIds?.slice(0, 3) ?? [],
    },
    avgVariantsByCompetitor,
    topTargetedCountries,
    totals,
  };
}

/* ═════════════════════════════════════════════════════════
   Organic benchmarks (Instagram posts)
   ═════════════════════════════════════════════════════════ */

interface OrganicRow {
  competitor_id: string | null;
  post_type: string | null;
  video_url: string | null;
  caption: string | null;
  likes_count: number | null;
  comments_count: number | null;
  video_views: number | null;
  hashtags: string[] | null;
  // Tagged users + mentions per Collab L1 (2026-05-07): sono usati per
  // distinguere i post in collaborazione dai post stand-alone.
  tagged_users: string[] | null;
  mentions: string[] | null;
  posted_at: string | null;
  created_at: string;
  // JSON-projected from raw_data so we can chart Reel-specific signals
  // (duration buckets + original-vs-trending audio split) without
  // pulling the entire raw_data blob over the wire on every benchmark.
  videoDuration: number | null;
  musicInfo: {
    song_name?: string;
    artist_name?: string;
    uses_original_audio?: boolean;
  } | null;
}

export interface OrganicBenchmarkData {
  competitors: CompetitorRef[];
  postsByCompetitor: { name: string; posts: number }[];
  formatMixByCompetitor: { competitor: string; data: { name: string; value: number }[] }[];
  formatStackedByCompetitor: {
    name: string;
    image: number;
    video: number;
    reel: number;
    carousel: number;
  }[];
  topHashtags: { name: string; count: number }[];
  hashtagByCompetitor: { name: string; [hashtag: string]: string | number }[];
  avgLikesByCompetitor: { name: string; likes: number }[];
  avgCommentsByCompetitor: { name: string; comments: number }[];
  avgViewsByCompetitor: { name: string; views: number }[];
  postsPerWeekByCompetitor: { name: string; postsPerWeek: number }[];
  avgCaptionLengthByCompetitor: { name: string; chars: number }[];
  /**
   * Per-selected-brand Instagram scan coverage. `earliestPost` is null when
   * the brand has NEVER been scanned on Instagram — the UI uses this to
   * split the warning between "no scan at all" and "scan does not reach
   * dateFrom".
   */
  coverageByCompetitor: {
    competitorId: string;
    competitor: string;
    earliestPost: string | null;
    postsInRange: number;
  }[];
  /**
   * Reel-specific aggregates. Verified empirically on 2026-04-28 that
   * the current Apify Instagram actor populates `videoDuration` (in
   * seconds) and `musicInfo.uses_original_audio` for every Reel —
   * coverage 100% on a Sezane sample of 13 Reels.
   *
   * `durationDistribution` buckets every Reel into 5 ranges so the UI
   * can show whether a brand sits in Meta's algorithm sweet zone
   * (15-30s). `audioStrategyByCompetitor` splits each brand's Reels
   * into original vs trending. `topTrendingAudio` is the top non-
   * original songs across the workspace, useful to spot what brands
   * are riding.
   */
  reelStats: {
    totalReels: number;
    avgDuration: number; // seconds, 0 when no reels
    durationDistribution: { bucket: string; count: number }[];
    audioStrategyByCompetitor: {
      competitor: string;
      reelCount: number;
      originalAudio: number;
      trendingAudio: number;
    }[];
    topTrendingAudio: {
      song: string; // "Song name — Artist"
      count: number;
    }[];
  };
  totals: {
    totalPosts: number;
    avgLikes: number;
    avgComments: number;
    avgViews: number;
    avgCaptionLength: number;
    /** Collab L1 (2026-05-07): post che taggano/menzionano almeno un
     *  account ≠ brand stesso. Indica strategia di partnership /
     *  ambassador / influencer. */
    collabPosts: number;
    collabRate: number; // 0..100
  };
  collabPostsByCompetitor: {
    name: string;
    collabPosts: number;
    totalPosts: number;
    rate: number;
  }[];
}

export async function computeOrganicBenchmarks(
  supabase: SupabaseClient,
  workspaceId: string,
  competitorIds?: string[],
  dateFrom?: string,
  dateTo?: string,
): Promise<OrganicBenchmarkData> {
  // Heavy query: paginated walk through every post in the date window so
  // the coverage check and the metrics agree. Previously this stopped at
  // 5000 rows while the coverage query fetched the full history — a
  // workspace with 20k posts would see "earliest post 2023" in the gap
  // warning but only 5k in the charts. Posts are lightweight (no JSONB
  // heavy fields) so the 30k cap is safe.
  async function fetchAllPosts(): Promise<OrganicRow[]> {
    const PAGE = 1000;
    const SAFETY_CAP = 30_000;
    const rows: OrganicRow[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let hq = supabase
        .from("mait_organic_posts")
        .select(
          // JSON projections (videoDuration + musicInfo) keep the
          // wire small — we only pull the two fields we need for
          // Reel charts instead of the whole raw_data blob (which
          // can be 5-15 KB per post).
          "competitor_id, post_type, video_url, caption, likes_count, comments_count, video_views, hashtags, tagged_users, mentions, posted_at, created_at, videoDuration:raw_data->videoDuration, musicInfo:raw_data->musicInfo",
        )
        .eq("workspace_id", workspaceId)
        .eq("platform", "instagram")
        .order("posted_at", { ascending: false, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (competitorIds && competitorIds.length > 0) {
        hq = hq.in("competitor_id", competitorIds);
      }
      if (dateFrom) hq = hq.gte("posted_at", dateFrom);
      if (dateTo) hq = hq.lte("posted_at", dateTo + "T23:59:59Z");
      const { data, error } = await hq;
      if (error || !data || data.length === 0) break;
      rows.push(...(data as OrganicRow[]));
      if (data.length < PAGE) break;
    }
    return rows;
  }

  // Lightweight + paginated coverage query. No date filter here: we want
  // every (competitor_id, posted_at) so we can detect brands that have
  // never been scanned on Instagram AND brands whose oldest post is
  // newer than dateFrom.
  async function fetchCoverageRows(): Promise<
    { competitor_id: string | null; posted_at: string | null }[]
  > {
    const PAGE = 1000;
    const SAFETY_CAP = 500_000;
    const rows: { competitor_id: string | null; posted_at: string | null }[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let cq = supabase
        .from("mait_organic_posts")
        .select("competitor_id, posted_at")
        .eq("workspace_id", workspaceId)
        .eq("platform", "instagram")
        .order("id")
        .range(from, from + PAGE - 1);
      if (competitorIds && competitorIds.length > 0) cq = cq.in("competitor_id", competitorIds);
      const { data, error } = await cq;
      if (error || !data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  const [{ data: competitors }, rawPosts, coverageRows] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .order("page_name"),
    fetchAllPosts(),
    fetchCoverageRows(),
  ]);

  const comps = (competitors ?? []) as CompetitorRef[];
  const posts = rawPosts;
  const compMap = new Map(comps.map((c) => [c.id, c.page_name]));

  // Coverage computation — earliest post per brand across all time + count
  // of posts in the requested window. We always include every selected
  // competitor so the UI can see "no scan at all" as well.
  const earliestByComp = new Map<string, string>();
  const inRangeCount = new Map<string, number>();
  const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59Z").getTime() : null;
  for (const row of coverageRows) {
    if (!row.competitor_id || !row.posted_at) continue;
    const prev = earliestByComp.get(row.competitor_id);
    if (!prev || row.posted_at < prev) earliestByComp.set(row.competitor_id, row.posted_at);
    const ts = new Date(row.posted_at).getTime();
    if ((fromTs === null || ts >= fromTs) && (toTs === null || ts <= toTs)) {
      inRangeCount.set(row.competitor_id, (inRangeCount.get(row.competitor_id) ?? 0) + 1);
    }
  }
  const coverageIds = competitorIds && competitorIds.length > 0
    ? competitorIds
    : comps.map((c) => c.id);
  const coverageByCompetitor = coverageIds.map((id) => ({
    competitorId: id,
    competitor: compMap.get(id) ?? "N/A",
    earliestPost: earliestByComp.get(id) ?? null,
    postsInRange: inRangeCount.get(id) ?? 0,
  }));

  function classify(p: OrganicRow): "image" | "video" | "reel" | "carousel" {
    const t = (p.post_type ?? "").toLowerCase();
    if (t.includes("reel")) return "reel";
    // Instagram carousel / sidecar album — a slider of images and/or videos.
    // Meta's scraper returns either "CAROUSEL_ALBUM" or "Sidecar" for these
    // posts; previously they were silently bucketed as "image".
    if (t.includes("carousel") || t.includes("album") || t === "sidecar") return "carousel";
    if (p.video_url || t.includes("video")) return "video";
    return "image";
  }

  // Volume + format per competitor
  const byComp = new Map<
    string,
    {
      total: number;
      image: number;
      video: number;
      reel: number;
      carousel: number;
      likes: number[];
      comments: number[];
      views: number[];
      captions: number[];
      recent: number;
    }
  >();
  // Window for posts-per-week mirrors the ads side (computeBenchmarks):
  // tracks the user-selected analysis range, falls back to a rolling
  // 90d when none is supplied, and is reused as the denominator below
  // so post cadence is comparable between brands evaluated under the
  // same window.
  const organicWindowToMs = dateTo
    ? new Date(dateTo + "T23:59:59Z").getTime()
    : Date.now();
  const organicWindowFromMs = dateFrom
    ? new Date(dateFrom).getTime()
    : organicWindowToMs - 90 * 86_400_000;
  const organicWindowDays = Math.max(
    1,
    Math.round((organicWindowToMs - organicWindowFromMs) / 86_400_000),
  );

  for (const p of posts) {
    const key = p.competitor_id ?? "unknown";
    const entry =
      byComp.get(key) ?? {
        total: 0,
        image: 0,
        video: 0,
        reel: 0,
        carousel: 0,
        likes: [] as number[],
        comments: [] as number[],
        views: [] as number[],
        captions: [] as number[],
        recent: 0,
      };
    entry.total++;
    const fmt = classify(p);
    entry[fmt]++;
    // Instagram returns -1 for posts on accounts with hidden likes;
    // treat negative as "unknown" and exclude. A real 0 is valid data
    // and stays in the average. Null is coerced to -1 and excluded.
    if ((p.likes_count ?? -1) >= 0) entry.likes.push(p.likes_count ?? 0);
    if ((p.comments_count ?? -1) >= 0) entry.comments.push(p.comments_count ?? 0);
    if ((p.video_views ?? -1) > 0) entry.views.push(p.video_views ?? 0);
    const capLen = (p.caption ?? "").length;
    if (capLen > 0) entry.captions.push(capLen);
    const when = p.posted_at
      ? new Date(p.posted_at).getTime()
      : new Date(p.created_at).getTime();
    if (when >= organicWindowFromMs && when <= organicWindowToMs) {
      entry.recent++;
    }
    byComp.set(key, entry);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  const postsByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", posts: v.total }))
    .sort((a, b) => b.posts - a.posts);

  const formatMixByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      competitor: compMap.get(id) ?? "N/A",
      data: [
        { name: "Image", value: v.image },
        { name: "Video", value: v.video },
        { name: "Reel", value: v.reel },
        { name: "Carousel", value: v.carousel },
      ].filter((f) => f.value > 0),
    }))
    .sort((a, b) => {
      const ta = a.data.reduce((s, d) => s + d.value, 0);
      const tb = b.data.reduce((s, d) => s + d.value, 0);
      return tb - ta;
    });

  const formatStackedByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      image: v.image,
      video: v.video,
      reel: v.reel,
      carousel: v.carousel,
    }))
    .sort((a, b) =>
      (b.image + b.video + b.reel + b.carousel) -
      (a.image + a.video + a.reel + a.carousel)
    );

  // Hashtags
  const tagCount = new Map<string, number>();
  const tagByComp = new Map<string, Map<string, number>>();
  for (const p of posts) {
    if (!Array.isArray(p.hashtags)) continue;
    const key = p.competitor_id ?? "unknown";
    const compTags = tagByComp.get(key) ?? new Map<string, number>();
    for (const raw of p.hashtags) {
      const tag = raw.trim().toLowerCase();
      if (!tag) continue;
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      compTags.set(tag, (compTags.get(tag) ?? 0) + 1);
    }
    tagByComp.set(key, compTags);
  }
  const topHashtags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name: `#${name}`, count }));

  const topTagNames = topHashtags.slice(0, 5).map((h) => h.name.replace(/^#/, ""));
  const hashtagByCompetitor = [...tagByComp.entries()].map(([id, tags]) => {
    const row: { name: string; [hashtag: string]: string | number } = {
      name: compMap.get(id) ?? "N/A",
    };
    for (const t of topTagNames) {
      row[`#${t}`] = tags.get(t) ?? 0;
    }
    return row;
  });

  const avgLikesByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", likes: avg(v.likes) }))
    .sort((a, b) => b.likes - a.likes);
  const avgCommentsByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      comments: avg(v.comments),
    }))
    .sort((a, b) => b.comments - a.comments);
  const avgViewsByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", views: avg(v.views) }))
    .filter((e) => e.views > 0)
    .sort((a, b) => b.views - a.views);
  const avgCaptionLengthByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      chars: avg(v.captions),
    }))
    .sort((a, b) => b.chars - a.chars);
  const organicWindowWeeks = organicWindowDays / 7;
  const postsPerWeekByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      postsPerWeek: Math.round((v.recent / organicWindowWeeks) * 10) / 10,
    }))
    .sort((a, b) => b.postsPerWeek - a.postsPerWeek);

  const allLikes = [...byComp.values()].flatMap((v) => v.likes);
  const allComments = [...byComp.values()].flatMap((v) => v.comments);
  const allViews = [...byComp.values()].flatMap((v) => v.views);
  const allCaptions = [...byComp.values()].flatMap((v) => v.captions);

  // ── Reel-specific aggregates ───────────────────────────────
  // Buckets: 0-15s short, 15-30s algorithm sweet zone, 30-60s
  // standard, 60-90s long, 90+ very long. The 15-30s sweet zone
  // is documented Meta best practice for organic Reels.
  function bucketDuration(seconds: number): string {
    if (seconds < 15) return "0-15s";
    if (seconds < 30) return "15-30s";
    if (seconds < 60) return "30-60s";
    if (seconds < 90) return "60-90s";
    return "90s+";
  }
  const durationBucketCounts = new Map<string, number>([
    ["0-15s", 0],
    ["15-30s", 0],
    ["30-60s", 0],
    ["60-90s", 0],
    ["90s+", 0],
  ]);
  const audioByComp = new Map<
    string,
    { reelCount: number; originalAudio: number; trendingAudio: number }
  >();
  const trendingAudioCounts = new Map<string, number>();
  const allReelDurations: number[] = [];

  for (const p of posts) {
    const isReel = (p.post_type ?? "").toLowerCase() === "reel";
    if (!isReel) continue;
    // Duration histogram
    if (typeof p.videoDuration === "number" && p.videoDuration > 0) {
      const b = bucketDuration(p.videoDuration);
      durationBucketCounts.set(b, (durationBucketCounts.get(b) ?? 0) + 1);
      allReelDurations.push(p.videoDuration);
    }
    // Audio strategy (original vs trending) — only counted when
    // musicInfo carries the boolean signal. Reels pre-musicInfo
    // (legacy) are excluded from the split rather than misclassified.
    const audio = p.musicInfo;
    const usesOriginal = audio?.uses_original_audio;
    const compKey = p.competitor_id ?? "unknown";
    const a =
      audioByComp.get(compKey) ??
      { reelCount: 0, originalAudio: 0, trendingAudio: 0 };
    a.reelCount++;
    if (usesOriginal === true) a.originalAudio++;
    else if (usesOriginal === false) {
      a.trendingAudio++;
      // Build the trending-audio histogram only for non-original
      // tracks, which is the actually-meaningful signal.
      const song = (audio?.song_name ?? "").trim();
      const artist = (audio?.artist_name ?? "").trim();
      if (song) {
        const key = artist ? `${song} — ${artist}` : song;
        trendingAudioCounts.set(key, (trendingAudioCounts.get(key) ?? 0) + 1);
      }
    }
    audioByComp.set(compKey, a);
  }

  const reelStats: OrganicBenchmarkData["reelStats"] = {
    totalReels: allReelDurations.length,
    avgDuration:
      allReelDurations.length === 0
        ? 0
        : Math.round(
            (allReelDurations.reduce((s, n) => s + n, 0) /
              allReelDurations.length) *
              10,
          ) / 10,
    durationDistribution: [...durationBucketCounts.entries()].map(
      ([bucket, count]) => ({ bucket, count }),
    ),
    audioStrategyByCompetitor: [...audioByComp.entries()]
      .map(([id, v]) => ({
        competitor: compMap.get(id) ?? "N/A",
        reelCount: v.reelCount,
        originalAudio: v.originalAudio,
        trendingAudio: v.trendingAudio,
      }))
      .sort((a, b) => b.reelCount - a.reelCount),
    topTrendingAudio: [...trendingAudioCounts.entries()]
      .map(([song, count]) => ({ song, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };

  // Collab L1 (2026-05-07): aggregato post-collab per competitor.
  // Un post e' "collab" se ha tagged_users != [] OR mentions != []
  // (escluso auto-tag del brand stesso). Per il benchmark non
  // abbiamo il brand handle preciso per ogni post — assumiamo che
  // any-non-empty array sia signal di collab. Il leakage da auto-
  // tag (brand che si auto-menziona) e' bound dal fatto che auto-
  // tag puro su tutti i post e' raro: tipicamente i brand si
  // taggano insieme ad altri, quindi il post resta classificato
  // collab corretto. Approssimazione accettabile per benchmark.
  const collabByComp = new Map<string, { collab: number; total: number }>();
  let totalCollabPosts = 0;
  for (const p of posts) {
    const cid = p.competitor_id;
    if (!cid) continue;
    const tagsLen = (p.tagged_users ?? []).length;
    const menLen = (p.mentions ?? []).length;
    const isCollab = tagsLen > 0 || menLen > 0;
    const entry = collabByComp.get(cid) ?? { collab: 0, total: 0 };
    entry.total += 1;
    if (isCollab) {
      entry.collab += 1;
      totalCollabPosts += 1;
    }
    collabByComp.set(cid, entry);
  }
  const collabPostsByCompetitor = [...collabByComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      collabPosts: v.collab,
      totalPosts: v.total,
      rate: v.total === 0 ? 0 : Math.round((v.collab / v.total) * 100),
    }))
    .sort((a, b) => b.collabPosts - a.collabPosts);

  return {
    competitors: comps,
    postsByCompetitor,
    formatMixByCompetitor,
    formatStackedByCompetitor,
    topHashtags,
    hashtagByCompetitor,
    avgLikesByCompetitor,
    avgCommentsByCompetitor,
    avgViewsByCompetitor,
    postsPerWeekByCompetitor,
    avgCaptionLengthByCompetitor,
    coverageByCompetitor,
    reelStats,
    collabPostsByCompetitor,
    totals: {
      totalPosts: posts.length,
      avgLikes: avg(allLikes),
      avgComments: avg(allComments),
      avgViews: avg(allViews),
      avgCaptionLength: avg(allCaptions),
      collabPosts: totalCollabPosts,
      collabRate:
        posts.length === 0
          ? 0
          : Math.round((totalCollabPosts / posts.length) * 100),
    },
  };
}

/* ─────────────────────────────────────────────────────────────
   TikTok benchmarks (Feature 2026-05-07)
   ─────────────────────────────────────────────────────────────
   Pipeline parallela a OrganicBenchmarks ma adattata alla
   semantica TikTok:
   - "Likes" qui = digg_count (cuori). "Plays" e' una metrica
     primaria che IG non ha.
   - Format mix: slideshow vs video (no carousel/reel/image
     trinity di IG).
   - Audio strategy: original vs trending audio (gia' esposto da
     `music_original`).
   - Collab L1 attivo dal day 1 (regex caption + mentions[]).
   ───────────────────────────────────────────────────────────── */

interface TiktokRow {
  competitor_id: string | null;
  caption: string | null;
  duration_seconds: number | null;
  is_slideshow: boolean | null;
  play_count: number | null;
  digg_count: number | null;
  share_count: number | null;
  comment_count: number | null;
  collect_count: number | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  music_name: string | null;
  music_author: string | null;
  music_original: boolean | null;
  posted_at: string | null;
  created_at: string;
}

export interface TiktokBenchmarkData {
  competitors: CompetitorRef[];
  postsByCompetitor: { name: string; posts: number }[];
  /** slideshow vs video mix per brand. */
  formatStackedByCompetitor: {
    name: string;
    video: number;
    slideshow: number;
  }[];
  topHashtags: { name: string; count: number }[];
  avgPlaysByCompetitor: { name: string; plays: number }[];
  avgLikesByCompetitor: { name: string; likes: number }[];
  avgCommentsByCompetitor: { name: string; comments: number }[];
  avgSharesByCompetitor: { name: string; shares: number }[];
  postsPerWeekByCompetitor: { name: string; postsPerWeek: number }[];
  avgCaptionLengthByCompetitor: { name: string; chars: number }[];
  /** Coverage: when was the brand first scanned on TikTok? */
  coverageByCompetitor: {
    competitorId: string;
    competitor: string;
    earliestPost: string | null;
    postsInRange: number;
  }[];
  /** Audio strategy: original (suono custom) vs trending (riusato). */
  audioStrategyByCompetitor: {
    competitor: string;
    totalPosts: number;
    originalAudio: number;
    trendingAudio: number;
  }[];
  /** Distribuzione durata video (buckets 0-15s, 15-30s, ecc.). */
  durationDistribution: { bucket: string; count: number }[];
  /** Top trending audio (no original) usato dai brand. */
  topTrendingAudio: { song: string; count: number }[];
  /** Collab L1: post che taggano/menzionano account ≠ brand. */
  collabPostsByCompetitor: {
    name: string;
    collabPosts: number;
    totalPosts: number;
    rate: number;
  }[];
  totals: {
    totalPosts: number;
    avgPlays: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
    avgDuration: number;
    avgCaptionLength: number;
    collabPosts: number;
    collabRate: number; // 0..100
  };
}

export async function computeTiktokBenchmarks(
  supabase: SupabaseClient,
  workspaceId: string,
  competitorIds?: string[],
  dateFrom?: string,
  dateTo?: string,
): Promise<TiktokBenchmarkData> {
  async function fetchAllPosts(): Promise<TiktokRow[]> {
    const PAGE = 1000;
    const SAFETY_CAP = 30_000;
    const rows: TiktokRow[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let q = supabase
        .from("mait_tiktok_posts")
        .select(
          "competitor_id, caption, duration_seconds, is_slideshow, play_count, digg_count, share_count, comment_count, collect_count, hashtags, mentions, music_name, music_author, music_original, posted_at, created_at",
        )
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (competitorIds && competitorIds.length > 0) {
        q = q.in("competitor_id", competitorIds);
      }
      if (dateFrom) q = q.gte("posted_at", dateFrom);
      if (dateTo) q = q.lte("posted_at", dateTo + "T23:59:59Z");
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      rows.push(...(data as TiktokRow[]));
      if (data.length < PAGE) break;
    }
    return rows;
  }

  async function fetchCoverageRows(): Promise<
    { competitor_id: string | null; posted_at: string | null }[]
  > {
    const PAGE = 1000;
    const SAFETY_CAP = 30_000;
    const rows: { competitor_id: string | null; posted_at: string | null }[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let q = supabase
        .from("mait_tiktok_posts")
        .select("competitor_id, posted_at")
        .eq("workspace_id", workspaceId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (competitorIds && competitorIds.length > 0) {
        q = q.in("competitor_id", competitorIds);
      }
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  const [{ data: comps }, posts, coverageRaw] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .in(
        "id",
        competitorIds && competitorIds.length > 0
          ? competitorIds
          : ["00000000-0000-0000-0000-000000000000"],
      ),
    fetchAllPosts(),
    fetchCoverageRows(),
  ]);

  const compMap = new Map<string, string>();
  for (const c of (comps ?? []) as CompetitorRef[]) {
    compMap.set(c.id, c.page_name);
  }

  // Per-competitor aggregator state.
  type Bucket = {
    total: number;
    plays: number[];
    likes: number[];
    comments: number[];
    shares: number[];
    captions: number[];
    video: number;
    slideshow: number;
    originalAudio: number;
    trendingAudio: number;
  };
  const byComp = new Map<string, Bucket>();
  const ensure = (id: string): Bucket => {
    let b = byComp.get(id);
    if (!b) {
      b = {
        total: 0,
        plays: [],
        likes: [],
        comments: [],
        shares: [],
        captions: [],
        video: 0,
        slideshow: 0,
        originalAudio: 0,
        trendingAudio: 0,
      };
      byComp.set(id, b);
    }
    return b;
  };

  const allPlays: number[] = [];
  const allLikes: number[] = [];
  const allComments: number[] = [];
  const allShares: number[] = [];
  const allCaptions: number[] = [];
  const allDurations: number[] = [];
  const tagMap = new Map<string, number>();
  const trendingAudioCounts = new Map<string, number>();
  const durationBucketCounts = new Map<string, number>([
    ["<15s", 0],
    ["15-30s", 0],
    ["30-60s", 0],
    ["60-120s", 0],
    [">120s", 0],
  ]);

  for (const p of posts) {
    const cid = p.competitor_id;
    if (!cid) continue;
    const b = ensure(cid);
    b.total += 1;
    if (typeof p.play_count === "number") {
      b.plays.push(p.play_count);
      allPlays.push(p.play_count);
    }
    if (typeof p.digg_count === "number") {
      b.likes.push(p.digg_count);
      allLikes.push(p.digg_count);
    }
    if (typeof p.comment_count === "number") {
      b.comments.push(p.comment_count);
      allComments.push(p.comment_count);
    }
    if (typeof p.share_count === "number") {
      b.shares.push(p.share_count);
      allShares.push(p.share_count);
    }
    const capLen = (p.caption ?? "").length;
    if (capLen > 0) {
      b.captions.push(capLen);
      allCaptions.push(capLen);
    }
    if (p.is_slideshow) b.slideshow += 1;
    else b.video += 1;
    if (p.music_original === true) b.originalAudio += 1;
    else if (p.music_original === false) b.trendingAudio += 1;

    if (typeof p.duration_seconds === "number" && p.duration_seconds > 0) {
      allDurations.push(p.duration_seconds);
      const d = p.duration_seconds;
      const bucket =
        d < 15 ? "<15s" : d < 30 ? "15-30s" : d < 60 ? "30-60s" : d < 120 ? "60-120s" : ">120s";
      durationBucketCounts.set(bucket, (durationBucketCounts.get(bucket) ?? 0) + 1);
    }

    for (const raw of p.hashtags ?? []) {
      const tag = (raw ?? "").trim().toLowerCase();
      if (!tag) continue;
      tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    }
    if (p.music_original === false && p.music_name) {
      const song = p.music_author
        ? `${p.music_name} — ${p.music_author}`
        : p.music_name;
      trendingAudioCounts.set(song, (trendingAudioCounts.get(song) ?? 0) + 1);
    }
  }

  // Coverage map.
  const earliestByComp = new Map<string, string>();
  const inRangeByComp = new Map<string, number>();
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  const toMs = dateTo
    ? new Date(dateTo + "T23:59:59Z").getTime()
    : Date.now();
  for (const r of coverageRaw) {
    const cid = r.competitor_id;
    if (!cid) continue;
    if (r.posted_at) {
      const prev = earliestByComp.get(cid);
      if (!prev || new Date(r.posted_at) < new Date(prev)) {
        earliestByComp.set(cid, r.posted_at);
      }
      const t = new Date(r.posted_at).getTime();
      if (t >= fromMs && t <= toMs) {
        inRangeByComp.set(cid, (inRangeByComp.get(cid) ?? 0) + 1);
      }
    }
  }

  const coverageByCompetitor = (comps ?? []).map((c) => ({
    competitorId: c.id,
    competitor: c.page_name,
    earliestPost: earliestByComp.get(c.id) ?? null,
    postsInRange: inRangeByComp.get(c.id) ?? 0,
  }));

  // Posts/week — same window logic as IG.
  const days = dateFrom && dateTo
    ? Math.max(
        1,
        Math.ceil(
          (new Date(dateTo + "T23:59:59Z").getTime() -
            new Date(dateFrom).getTime()) /
            86_400_000,
        ),
      )
    : 90;
  const weeks = days / 7;
  const postsPerWeekByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      postsPerWeek: Math.round((v.total / weeks) * 10) / 10,
    }))
    .sort((a, b) => b.postsPerWeek - a.postsPerWeek);

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);

  const postsByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", posts: v.total }))
    .sort((a, b) => b.posts - a.posts);

  const formatStackedByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      video: v.video,
      slideshow: v.slideshow,
    }))
    .sort((a, b) => b.video + b.slideshow - (a.video + a.slideshow));

  const avgPlaysByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", plays: avg(v.plays) }))
    .sort((a, b) => b.plays - a.plays);
  const avgLikesByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", likes: avg(v.likes) }))
    .sort((a, b) => b.likes - a.likes);
  const avgCommentsByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      comments: avg(v.comments),
    }))
    .sort((a, b) => b.comments - a.comments);
  const avgSharesByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      shares: avg(v.shares),
    }))
    .sort((a, b) => b.shares - a.shares);
  const avgCaptionLengthByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      chars: avg(v.captions),
    }))
    .sort((a, b) => b.chars - a.chars);

  const audioStrategyByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      competitor: compMap.get(id) ?? "N/A",
      totalPosts: v.total,
      originalAudio: v.originalAudio,
      trendingAudio: v.trendingAudio,
    }))
    .sort((a, b) => b.totalPosts - a.totalPosts);

  const topHashtags = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const topTrendingAudio = [...trendingAudioCounts.entries()]
    .map(([song, count]) => ({ song, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Collab L1: per-competitor con regex caption fallback.
  const collabByComp = new Map<string, { collab: number; total: number }>();
  let totalCollabPosts = 0;
  // import lazy via require non-friendly; usiamo direct logic
  // identica al pattern IG ma su mentions + caption-regex.
  for (const p of posts) {
    const cid = p.competitor_id;
    if (!cid) continue;
    const set = new Set<string>();
    for (const m of p.mentions ?? []) {
      const h = (m ?? "").trim().replace(/^@+/, "").replace(/[^A-Za-z0-9_]+$/, "").replace(/\.+$/, "").toLowerCase();
      if (h) set.add(h);
    }
    if (p.caption) {
      const matches = p.caption.matchAll(/(?<![A-Za-z0-9_.])@([A-Za-z0-9_.]+)/g);
      for (const m of matches) {
        const h = (m[1] ?? "").trim().replace(/[^A-Za-z0-9_]+$/, "").replace(/\.+$/, "").toLowerCase();
        if (h) set.add(h);
      }
    }
    const isCollab = set.size > 0;
    const entry = collabByComp.get(cid) ?? { collab: 0, total: 0 };
    entry.total += 1;
    if (isCollab) {
      entry.collab += 1;
      totalCollabPosts += 1;
    }
    collabByComp.set(cid, entry);
  }
  const collabPostsByCompetitor = [...collabByComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      collabPosts: v.collab,
      totalPosts: v.total,
      rate: v.total === 0 ? 0 : Math.round((v.collab / v.total) * 100),
    }))
    .sort((a, b) => b.collabPosts - a.collabPosts);

  return {
    competitors: (comps ?? []) as CompetitorRef[],
    postsByCompetitor,
    formatStackedByCompetitor,
    topHashtags,
    avgPlaysByCompetitor,
    avgLikesByCompetitor,
    avgCommentsByCompetitor,
    avgSharesByCompetitor,
    postsPerWeekByCompetitor,
    avgCaptionLengthByCompetitor,
    coverageByCompetitor,
    audioStrategyByCompetitor,
    durationDistribution: [...durationBucketCounts.entries()].map(
      ([bucket, count]) => ({ bucket, count }),
    ),
    topTrendingAudio,
    collabPostsByCompetitor,
    totals: {
      totalPosts: posts.length,
      avgPlays: avg(allPlays),
      avgLikes: avg(allLikes),
      avgComments: avg(allComments),
      avgShares: avg(allShares),
      avgDuration:
        allDurations.length === 0
          ? 0
          : Math.round(
              (allDurations.reduce((s, n) => s + n, 0) /
                allDurations.length) *
                10,
            ) / 10,
      avgCaptionLength: avg(allCaptions),
      collabPosts: totalCollabPosts,
      collabRate:
        posts.length === 0
          ? 0
          : Math.round((totalCollabPosts / posts.length) * 100),
    },
  };
}
