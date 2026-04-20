import type { SupabaseClient } from "@supabase/supabase-js";

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
    unknown: number;
  }[];
  /** Top CTAs across all ads */
  topCtas: { name: string; count: number }[];
  /** CTA usage per competitor (top 5 CTAs) */
  ctaByCompetitor: { name: string; [cta: string]: string | number }[];
  /** Format mix per competitor (for individual pie charts) */
  formatMixByCompetitor: { competitor: string; data: { name: string; value: number }[] }[];
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

export async function computeBenchmarks(
  supabase: SupabaseClient,
  workspaceId: string,
  source?: "meta" | "google",
  competitorIds?: string[]
): Promise<BenchmarkData> {
  let adsQuery = supabase
    .from("mait_ads_external")
    .select(
      "id, competitor_id, cta, platforms, video_url, status, start_date, end_date, ad_text, created_at, raw_data"
    )
    .eq("workspace_id", workspaceId)
    .limit(3000);

  if (source) adsQuery = adsQuery.eq("source", source);
  if (competitorIds && competitorIds.length > 0) {
    adsQuery = adsQuery.in("competitor_id", competitorIds);
  }

  const [{ data: competitors }, { data: rawAds }] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .order("page_name"),
    adsQuery,
  ]);

  const comps = (competitors ?? []) as CompetitorRef[];
  const ads = (rawAds ?? []) as AdRow[];
  const compMap = new Map(comps.map((c) => [c.id, c.page_name]));

  // ---- Volume per competitor ----
  const volumeMap = new Map<string, { active: number; inactive: number }>();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = volumeMap.get(key) ?? { active: 0, inactive: 0 };
    if (ad.status === "ACTIVE") entry.active++;
    else entry.inactive++;
    volumeMap.set(key, entry);
  }
  const volumeByCompetitor = [...volumeMap.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", ...v }))
    .sort((a, b) => b.active + b.inactive - (a.active + a.inactive));

  // ---- Format mix (uses displayFormat from raw_data) ----
  let imageCount = 0;
  let videoCount = 0;
  let carouselCount = 0;
  let unknownCount = 0;
  const formatByComp = new Map<
    string,
    { image: number; video: number; carousel: number; unknown: number }
  >();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = formatByComp.get(key) ?? { image: 0, video: 0, carousel: 0, unknown: 0 };
    const snapshot = (ad.raw_data?.snapshot ?? null) as Record<string, unknown> | null;
    const displayFormat = (snapshot?.displayFormat as string) ?? null;

    if (displayFormat === "DPA" || displayFormat === "DCO" || displayFormat === "CAROUSEL") {
      carouselCount++;
      entry.carousel++;
    } else if (displayFormat === "VIDEO" || (!displayFormat && ad.video_url)) {
      videoCount++;
      entry.video++;
    } else if (displayFormat === "IMAGE" || (!displayFormat && ad.image_url)) {
      imageCount++;
      entry.image++;
    } else {
      unknownCount++;
      entry.unknown++;
    }
    formatByComp.set(key, entry);
  }
  const formatMix = [
    { name: "Image", value: imageCount },
    { name: "Video", value: videoCount },
    { name: "Carousel", value: carouselCount },
    ...(unknownCount > 0 ? [{ name: "Other", value: unknownCount }] : []),
  ].filter((f) => f.value > 0);
  const formatByCompetitor = [...formatByComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", ...v }))
    .sort((a, b) => b.image + b.video + b.carousel - (a.image + a.video + a.carousel));

  // Format mix per competitor (individual pie charts)
  const formatMixByCompetitor = [...formatByComp.entries()]
    .map(([id, v]) => ({
      competitor: compMap.get(id) ?? "N/A",
      data: [
        { name: "Image", value: v.image },
        { name: "Video", value: v.video },
        { name: "Carousel", value: v.carousel },
        ...(v.unknown > 0 ? [{ name: "Other", value: v.unknown }] : []),
      ].filter((f) => f.value > 0),
    }))
    .sort((a, b) => {
      const ta = a.data.reduce((s, d) => s + d.value, 0);
      const tb = b.data.reduce((s, d) => s + d.value, 0);
      return tb - ta;
    });

  // ---- Top CTAs ----
  const ctaCount = new Map<string, number>();
  for (const ad of ads) {
    if (!ad.cta) continue;
    ctaCount.set(ad.cta, (ctaCount.get(ad.cta) ?? 0) + 1);
  }
  const topCtas = [...ctaCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // CTA per competitor (top 5 CTAs)
  const topCtaNames = topCtas.slice(0, 5).map((c) => c.name);
  const ctaByCompMap = new Map<string, Record<string, number>>();
  for (const ad of ads) {
    if (!ad.cta || !topCtaNames.includes(ad.cta)) continue;
    const key = ad.competitor_id ?? "unknown";
    const entry = ctaByCompMap.get(key) ?? {};
    entry[ad.cta] = (entry[ad.cta] ?? 0) + 1;
    ctaByCompMap.set(key, entry);
  }
  const ctaByCompetitor = [...ctaByCompMap.entries()].map(([id, ctas]) => ({
    name: compMap.get(id) ?? "N/A",
    ...ctas,
  }));

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
  // not actual campaign end). Use Date.now() instead.
  const durationByComp = new Map<string, number[]>();
  for (const ad of ads) {
    if (!ad.start_date) continue;
    const start = new Date(ad.start_date).getTime();
    const end = ad.status === "ACTIVE" || !ad.end_date
      ? Date.now()
      : new Date(ad.end_date).getTime();
    const days = Math.round((end - start) / 86_400_000);
    if (days < 1) continue;
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
  const ninetyDaysAgo = Date.now() - 90 * 86_400_000;
  const recentByComp = new Map<string, number>();
  for (const ad of ads) {
    const t = new Date(ad.created_at).getTime();
    if (t < ninetyDaysAgo) continue;
    const key = ad.competitor_id ?? "unknown";
    recentByComp.set(key, (recentByComp.get(key) ?? 0) + 1);
  }
  const weeks = 90 / 7;
  const refreshRate = [...recentByComp.entries()]
    .map(([id, n]) => ({
      name: compMap.get(id) ?? "N/A",
      adsPerWeek: Math.round((n / weeks) * 10) / 10,
    }))
    .sort((a, b) => b.adsPerWeek - a.adsPerWeek);

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
    platformDistribution,
    platformByCompetitor,
    avgDurationByCompetitor,
    avgCopyLengthByCompetitor,
    refreshRate,
    aiGeneratedByCompetitor,
    advantagePlusByCompetitor,
    avgVariantsByCompetitor,
    topTargetedCountries,
    totals,
  };
}
