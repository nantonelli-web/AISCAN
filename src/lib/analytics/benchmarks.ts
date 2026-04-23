import type { SupabaseClient } from "@supabase/supabase-js";
import { extractAdInsights } from "@/lib/meta/ad-insights";

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
}

interface CompetitorRef {
  id: string;
  page_name: string;
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
    unknown: number;
  }[];
  /** Top CTAs across all ads */
  topCtas: { name: string; count: number }[];
  /** CTA usage per competitor (top 5 CTAs) */
  ctaByCompetitor: { name: string; [cta: string]: string | number }[];
  /** Top CTAs per competitor — shape ready for per-brand pie/bar charts */
  ctaMixByCompetitor: { competitor: string; data: { name: string; count: number }[] }[];
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
    competitor: string;
    earliestStart: string | null;
    adsInRange: number;
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
  /** Ad refresh rate: avg new ads per week per competitor (last 90 days) */
  refreshRate: { name: string; adsPerWeek: number }[];
  /**
   * Diagnostic counts behind refreshRate. Lets the UI verify where the
   * number comes from — total rows seen, rows with start_date, rows
   * counted (start_date in last 90d). Exposed so we can eyeball the math.
   */
  refreshRateDebug: {
    name: string;
    totalInAds: number;
    withStartDate: number;
    countedInLast90d: number;
  }[];
  /** AI-generated ads percentage per competitor */
  aiGeneratedByCompetitor: { name: string; percent: number }[];
  /** Advantage+ usage percentage per competitor */
  advantagePlusByCompetitor: { name: string; percent: number }[];
  /** Average collation (variant) count per competitor */
  avgVariantsByCompetitor: { name: string; variants: number }[];
  /** Top targeted countries across all ads */
  topTargetedCountries: { name: string; count: number }[];
  totals: {
    totalAds: number;
    activeAds: number;
    avgDuration: number;
    avgCopyLength: number;
    aiGeneratedPercent: number;
    advantagePlusPercent: number;
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

function normalizeCtaLabel(raw: string): string {
  const cleaned = raw.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
): Promise<BenchmarkData> {
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
    const PAGE = 2000;
    const SAFETY_CAP = 15_000;
    const rows: AdRow[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let q = supabase
        .from("mait_ads_external")
        .select(
          "id, competitor_id, cta, platforms, image_url, video_url, status, start_date, end_date, ad_text, created_at, raw_data"
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
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      rows.push(...(data as AdRow[]));
      if (data.length < PAGE) break;
    }
    // Final dedupe: if the provider still returned the same row on
    // consecutive pages, strip the duplicates here so every metric sees
    // each ad exactly once.
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
    competitor_id: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
  }[]> {
    const PAGE = 5000;
    const SAFETY_CAP = 500_000;
    const rows: { competitor_id: string | null; status: string | null; start_date: string | null; end_date: string | null }[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let q = supabase
        .from("mait_ads_external")
        .select("competitor_id, status, start_date, end_date")
        .eq("workspace_id", workspaceId)
        .order("id")
        .range(from, from + PAGE - 1);
      if (source) q = q.eq("source", source);
      if (competitorIds && competitorIds.length > 0) q = q.in("competitor_id", competitorIds);
      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  }

  const [{ data: competitors }, rawAdsPages, allAdsMeta] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .order("page_name"),
    fetchAllHeavyRows(),
    fetchAllVolumeRows(),
  ]);

  // Ads within the requested date range — drives volume counts.
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
  const toMs = dateTo ? new Date(dateTo + "T23:59:59Z").getTime() : null;
  const volumeRows = allAdsMeta.filter((r) => {
    if (!r.start_date) return false;
    const s = new Date(r.start_date).getTime();
    if (toMs !== null && s > toMs) return false;
    if (fromMs !== null) {
      const stillRunning = r.status === "ACTIVE" || !r.end_date;
      const e = r.end_date ? new Date(r.end_date).getTime() : null;
      if (!stillRunning && e !== null && e < fromMs) return false;
    }
    return true;
  });

  const comps = (competitors ?? []) as CompetitorRef[];
  const ads = rawAdsPages;
  // When a project filter is applied we want every brand in the filter scope
  // to appear in "volume per brand" even if it has zero ads so the chart
  // reflects the whole project — not just brands with scanned ads.
  const scopedCompetitorIds = competitorIds && competitorIds.length > 0
    ? new Set(competitorIds)
    : null;
  const compMap = new Map(comps.map((c) => [c.id, c.page_name]));

  // ---- Volume per competitor (driven by the uncapped paginated query) ----
  const volumeMap = new Map<string, { active: number; inactive: number }>();
  for (const row of volumeRows) {
    const key = row.competitor_id ?? "unknown";
    const entry = volumeMap.get(key) ?? { active: 0, inactive: 0 };
    if (row.status === "ACTIVE") entry.active++;
    else entry.inactive++;
    volumeMap.set(key, entry);
  }

  // ---- Coverage per competitor (based on the full paginated set) ----
  // For each brand we track the earliest start_date we have anywhere in
  // the DB, regardless of the requested date range. The UI compares this
  // against dateFrom to surface "this brand's scans do not cover the
  // analysis window" warnings.
  const earliestByComp = new Map<string, string>();
  const inRangeByComp = new Map<string, number>();
  const inRangeIds = new Set(volumeRows.map((r) => r.competitor_id).filter(Boolean) as string[]);
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
  const coverageIds = scopedCompetitorIds ?? new Set(comps.map((c) => c.id));
  const coverageByCompetitor = [...coverageIds]
    .filter((id) => inRangeIds.has(id) || earliestByComp.has(id) || coverageIds.has(id))
    .map((id) => ({
      competitor: compMap.get(id) ?? "N/A",
      earliestStart: earliestByComp.get(id) ?? null,
      adsInRange: inRangeByComp.get(id) ?? 0,
    }));
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
  // unknown. We separate DPA from CAROUSEL so fashion / ecom workspaces can
  // see how much of their "carousel" share is really dynamic catalog ads.
  let imageCount = 0;
  let videoCount = 0;
  let carouselCount = 0;
  let dpaCount = 0;
  let unknownCount = 0;
  const formatByComp = new Map<
    string,
    { image: number; video: number; carousel: number; dpa: number; unknown: number }
  >();
  // Raw displayFormat tally per brand — audit trail exposed in the UI so we
  // can see exactly what the scraper returns instead of just our bucketing.
  const rawFormatByComp = new Map<string, Map<string, number>>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = formatByComp.get(key) ?? { image: 0, video: 0, carousel: 0, dpa: 0, unknown: 0 };
    const snapshot = (ad.raw_data?.snapshot ?? null) as Record<string, unknown> | null;
    const rawFormat = (snapshot?.displayFormat as string | undefined)?.toUpperCase() ?? null;
    const rawLabel = rawFormat ?? "(empty)";
    const rawMap = rawFormatByComp.get(key) ?? new Map<string, number>();
    rawMap.set(rawLabel, (rawMap.get(rawLabel) ?? 0) + 1);
    rawFormatByComp.set(key, rawMap);
    const cards = Array.isArray(snapshot?.cards) ? (snapshot?.cards as unknown[]) : null;
    const videos = Array.isArray(snapshot?.videos) ? (snapshot?.videos as unknown[]) : null;

    // Strict priority: trust Meta's explicit displayFormat before looking at
    // the raw snapshot payload. A VIDEO-flagged ad that happens to carry
    // multiple cards (video carousels do exist) must NOT be misclassified
    // as a plain image carousel, which was the bug in the previous logic.
    let bucket: "image" | "video" | "carousel" | "dpa" | "unknown";
    switch (rawFormat) {
      case "DPA":
        bucket = "dpa";
        break;
      case "CAROUSEL":
      case "CAROUSEL_IMAGE":
      case "CAROUSEL_VIDEO":
      case "MULTIPLE_IMAGES":
        bucket = "carousel";
        break;
      case "VIDEO":
      case "SINGLE_VIDEO":
        bucket = "video";
        break;
      case "IMAGE":
      case "SINGLE_IMAGE":
        bucket = "image";
        break;
      case "DCO": {
        // DCO = Dynamic Creative Optimization. snapshot.cards is a POOL of
        // creative variants Meta rotates among, NOT carousel slides.
        // Ad Library renders the primary variant (first card), so classify
        // by what the primary actually is. We rely on ad.video_url /
        // ad.image_url because normalize() already resolves the first card.
        if (ad.video_url) bucket = "video";
        else if (ad.image_url) bucket = "image";
        else bucket = "unknown";
        break;
      }
      case null:
      default: {
        // Missing / unknown displayFormat — here the cards.length > 1
        // heuristic is safe because we have no explicit signal either way.
        const cardsLen = cards?.length ?? 0;
        const videosLen = videos?.length ?? 0;
        if (cardsLen > 1) bucket = "carousel";
        else if (videosLen > 0 || ad.video_url) bucket = "video";
        else if (ad.image_url) bucket = "image";
        else bucket = "unknown";
      }
    }

    if (bucket === "carousel") { carouselCount++; entry.carousel++; }
    else if (bucket === "dpa") { dpaCount++; entry.dpa++; }
    else if (bucket === "video") { videoCount++; entry.video++; }
    else if (bucket === "image") { imageCount++; entry.image++; }
    else { unknownCount++; entry.unknown++; }
    formatByComp.set(key, entry);
  }
  // Canonical order: Image, Video, Carousel, DPA, Other. Order matters so
  // the UI always lays slices out the same way.
  const formatMix = [
    { name: "Image", value: imageCount },
    { name: "Video", value: videoCount },
    { name: "Carousel", value: carouselCount },
    { name: "DPA", value: dpaCount },
    ...(unknownCount > 0 ? [{ name: "Other", value: unknownCount }] : []),
  ].filter((f) => f.value > 0);
  const formatByCompetitor = [...formatByComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", ...v }))
    .sort((a, b) =>
      (b.image + b.video + b.carousel + b.dpa) - (a.image + a.video + a.carousel + a.dpa)
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
  // For ACTIVE ads, ignore end_date (Meta Ad Library sets it to snapshot date,
  // not actual campaign end). Use Date.now() instead. Clamp to a minimum
  // of 1 day so sub-day test campaigns are not silently dropped from the
  // average — previously `if (days < 1) continue` excluded them.
  const durationByComp = new Map<string, number[]>();
  for (const ad of ads) {
    if (!ad.start_date) continue;
    const start = new Date(ad.start_date).getTime();
    const end = ad.status === "ACTIVE" || !ad.end_date
      ? Date.now()
      : new Date(ad.end_date).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const days = Math.max(1, Math.round((end - start) / 86_400_000));
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

  // ---- Refresh rate (last 90 days) ----
  // CRITICAL: compute from allAdsMeta (the uncapped paginated volume
  // set) instead of from `ads` (the heavy query filtered by the user's
  // analysis range). The chart label is "Refresh rate (90d)" — a fixed
  // rolling 90-day metric. It must NOT shrink when the user narrows the
  // analysis range to last 7 days, and it must match the Compare view
  // when the same brand and channel are selected.
  //
  // `allAdsMeta` only lacks the date-range filter; it still respects
  // the source and competitor filters, and it is deduped by primary id
  // (order("id") in fetchAllVolumeRows).
  //
  // Ads without a real start_date are skipped: Meta does not always
  // populate the field for DPA catalog ads, and the older "fall back
  // to created_at" trick falsely inflated the rate after bulk scans.
  const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
  const recentByComp = new Map<string, number>();
  // Diagnostic bookkeeping — exposed via refreshRateDebug so the UI
  // can explain where the number comes from.
  const totalInAdsByComp = new Map<string, number>();
  const withStartDateByComp = new Map<string, number>();
  for (const row of allAdsMeta) {
    const key = row.competitor_id ?? "unknown";
    totalInAdsByComp.set(key, (totalInAdsByComp.get(key) ?? 0) + 1);
    if (!row.start_date) continue;
    withStartDateByComp.set(key, (withStartDateByComp.get(key) ?? 0) + 1);
    const t = new Date(row.start_date).getTime();
    if (Number.isNaN(t) || t < ninetyDaysAgo) continue;
    recentByComp.set(key, (recentByComp.get(key) ?? 0) + 1);
  }
  const weeks = 90 / 7;
  const refreshRate = [...recentByComp.entries()]
    .map(([id, n]) => ({
      name: compMap.get(id) ?? "N/A",
      adsPerWeek: Math.round((n / weeks) * 10) / 10,
    }))
    .sort((a, b) => b.adsPerWeek - a.adsPerWeek);
  // Diagnostic: include EVERY brand we iterated, even those with zero
  // ads-in-last-90d, so eyeballing "why is it X" is straightforward.
  const refreshRateDebug = [...totalInAdsByComp.entries()]
    .map(([id, total]) => ({
      name: compMap.get(id) ?? "N/A",
      totalInAds: total,
      withStartDate: withStartDateByComp.get(id) ?? 0,
      countedInLast90d: recentByComp.get(id) ?? 0,
    }))
    .sort((a, b) => b.countedInLast90d - a.countedInLast90d);

  // ---- AI-generated ads % per competitor ----
  const aiByComp = new Map<string, { total: number; ai: number }>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = aiByComp.get(key) ?? { total: 0, ai: 0 };
    entry.total++;
    if (ad.raw_data?.containsDigitalCreatedMedia === true) entry.ai++;
    aiByComp.set(key, entry);
  }
  const aiGeneratedByCompetitor = [...aiByComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      percent: v.total > 0 ? Math.round((v.ai / v.total) * 100) : 0,
    }))
    .filter((v) => v.percent > 0)
    .sort((a, b) => b.percent - a.percent);

  // ---- Advantage+ usage % per competitor ----
  const aaaByComp = new Map<string, { total: number; aaa: number }>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = aaaByComp.get(key) ?? { total: 0, aaa: 0 };
    entry.total++;
    if (ad.raw_data?.isAaaEligible === true) entry.aaa++;
    aaaByComp.set(key, entry);
  }
  const advantagePlusByCompetitor = [...aaaByComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      percent: v.total > 0 ? Math.round((v.aaa / v.total) * 100) : 0,
    }))
    .filter((v) => v.percent > 0)
    .sort((a, b) => b.percent - a.percent);

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
  const countryCount = new Map<string, number>();
  for (const ad of ads) {
    const countries = ad.raw_data?.targetedOrReachedCountries;
    if (!Array.isArray(countries)) continue;
    for (const c of countries) {
      if (typeof c === "string") {
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
  const totalAiCount = ads.filter((a) => a.raw_data?.containsDigitalCreatedMedia === true).length;
  const totalAaaCount = ads.filter((a) => a.raw_data?.isAaaEligible === true).length;
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
    aiGeneratedPercent:
      ads.length > 0 ? Math.round((totalAiCount / ads.length) * 100) : 0,
    advantagePlusPercent:
      ads.length > 0 ? Math.round((totalAaaCount / ads.length) * 100) : 0,
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
    utmInsightsByCompetitor,
    coverageByCompetitor,
    audienceByCompetitor,
    platformDistribution,
    platformByCompetitor,
    avgDurationByCompetitor,
    avgCopyLengthByCompetitor,
    refreshRate,
    refreshRateDebug,
    aiGeneratedByCompetitor,
    advantagePlusByCompetitor,
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
  posted_at: string | null;
  created_at: string;
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
    competitor: string;
    earliestPost: string | null;
    postsInRange: number;
  }[];
  totals: {
    totalPosts: number;
    avgLikes: number;
    avgComments: number;
    avgViews: number;
    avgCaptionLength: number;
  };
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
    const PAGE = 5000;
    const SAFETY_CAP = 30_000;
    const rows: OrganicRow[] = [];
    for (let from = 0; from < SAFETY_CAP; from += PAGE) {
      let hq = supabase
        .from("mait_organic_posts")
        .select(
          "competitor_id, post_type, video_url, caption, likes_count, comments_count, video_views, hashtags, posted_at, created_at"
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
    const PAGE = 5000;
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
  const ninetyAgo = Date.now() - 90 * 86_400_000;

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
    if ((p.likes_count ?? 0) > 0) entry.likes.push(p.likes_count ?? 0);
    if ((p.comments_count ?? 0) > 0) entry.comments.push(p.comments_count ?? 0);
    if ((p.video_views ?? 0) > 0) entry.views.push(p.video_views ?? 0);
    const capLen = (p.caption ?? "").length;
    if (capLen > 0) entry.captions.push(capLen);
    const when = p.posted_at
      ? new Date(p.posted_at).getTime()
      : new Date(p.created_at).getTime();
    if (when > ninetyAgo) entry.recent++;
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
  const postsPerWeekByCompetitor = [...byComp.entries()]
    .map(([id, v]) => ({
      name: compMap.get(id) ?? "N/A",
      postsPerWeek: Math.round((v.recent / (90 / 7)) * 10) / 10,
    }))
    .sort((a, b) => b.postsPerWeek - a.postsPerWeek);

  const allLikes = [...byComp.values()].flatMap((v) => v.likes);
  const allComments = [...byComp.values()].flatMap((v) => v.comments);
  const allViews = [...byComp.values()].flatMap((v) => v.views);
  const allCaptions = [...byComp.values()].flatMap((v) => v.captions);

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
    totals: {
      totalPosts: posts.length,
      avgLikes: avg(allLikes),
      avgComments: avg(allComments),
      avgViews: avg(allViews),
      avgCaptionLength: avg(allCaptions),
    },
  };
}
