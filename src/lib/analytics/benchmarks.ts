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
}

interface CompetitorRef {
  id: string;
  page_name: string;
}

export interface BenchmarkData {
  competitors: CompetitorRef[];
  /** Active ads per competitor */
  volumeByCompetitor: { name: string; active: number; inactive: number }[];
  /** Format breakdown across all ads */
  formatMix: { name: string; value: number }[];
  /** Format breakdown per competitor */
  formatByCompetitor: {
    name: string;
    image: number;
    video: number;
    unknown: number;
  }[];
  /** Top CTAs across all ads */
  topCtas: { name: string; count: number }[];
  /** CTA usage per competitor (top 5 CTAs) */
  ctaByCompetitor: { name: string; [cta: string]: string | number }[];
  /** Platform distribution */
  platformDistribution: { name: string; count: number }[];
  /** Average campaign duration (days) per competitor */
  avgDurationByCompetitor: { name: string; days: number }[];
  /** Average copy length per competitor */
  avgCopyLengthByCompetitor: { name: string; chars: number }[];
  /** Ad refresh rate: avg new ads per week per competitor (last 90 days) */
  refreshRate: { name: string; adsPerWeek: number }[];
  totals: {
    totalAds: number;
    activeAds: number;
    avgDuration: number;
    avgCopyLength: number;
  };
}

export async function computeBenchmarks(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<BenchmarkData> {
  const [{ data: competitors }, { data: rawAds }] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .order("page_name"),
    supabase
      .from("mait_ads_external")
      .select(
        "id, competitor_id, cta, platforms, image_url, video_url, status, start_date, end_date, ad_text, created_at"
      )
      .eq("workspace_id", workspaceId)
      .limit(5000),
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

  // ---- Format mix ----
  let imageCount = 0;
  let videoCount = 0;
  let unknownCount = 0;
  const formatByComp = new Map<
    string,
    { image: number; video: number; unknown: number }
  >();
  for (const ad of ads) {
    const key = ad.competitor_id ?? "unknown";
    const entry = formatByComp.get(key) ?? { image: 0, video: 0, unknown: 0 };
    if (ad.video_url) {
      videoCount++;
      entry.video++;
    } else if (ad.image_url) {
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
    ...(unknownCount > 0 ? [{ name: "Other", value: unknownCount }] : []),
  ];
  const formatByCompetitor = [...formatByComp.entries()]
    .map(([id, v]) => ({ name: compMap.get(id) ?? "N/A", ...v }))
    .sort((a, b) => b.image + b.video - (a.image + a.video));

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
  for (const ad of ads) {
    if (!Array.isArray(ad.platforms)) continue;
    for (const p of ad.platforms) {
      platCount.set(p, (platCount.get(p) ?? 0) + 1);
    }
  }
  const platformDistribution = [...platCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // ---- Campaign duration ----
  const durationByComp = new Map<string, number[]>();
  for (const ad of ads) {
    if (!ad.start_date) continue;
    const start = new Date(ad.start_date).getTime();
    const end = ad.end_date
      ? new Date(ad.end_date).getTime()
      : Date.now();
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
    topCtas,
    ctaByCompetitor,
    platformDistribution,
    avgDurationByCompetitor,
    avgCopyLengthByCompetitor,
    refreshRate,
    totals,
  };
}
