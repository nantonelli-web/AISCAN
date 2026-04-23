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
  /** Top CTAs per competitor — shape ready for per-brand pie/bar charts */
  ctaMixByCompetitor: { competitor: string; data: { name: string; count: number }[] }[];
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

/**
 * Normalize a CTA label so "Shop Now" / "SHOP NOW" / "shop now" all
 * aggregate into the same bucket. Drops surrounding whitespace, replaces
 * separator characters (_ -) with spaces, and title-cases each word.
 */
function normalizeCtaLabel(raw: string): string {
  const cleaned = raw.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
      "id, competitor_id, cta, platforms, image_url, video_url, status, start_date, end_date, ad_text, created_at, raw_data"
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
  // When a project filter is applied we want every brand in the filter scope
  // to appear in "volume per brand" even if it has zero ads so the chart
  // reflects the whole project — not just brands with scanned ads.
  const scopedCompetitorIds = competitorIds && competitorIds.length > 0
    ? new Set(competitorIds)
    : null;
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
    const cards = Array.isArray(snapshot?.cards) ? (snapshot?.cards as unknown[]) : null;
    const videos = Array.isArray(snapshot?.videos) ? (snapshot?.videos as unknown[]) : null;
    // True carousel formats: DPA (catalog carousel) and CAROUSEL.
    // DCO is a delivery mode (Dynamic Creative Optimization) that can resolve
    // to image, video, OR carousel — inspect the snapshot cards/videos.
    const isDpaOrCarousel = displayFormat === "DPA" || displayFormat === "CAROUSEL";
    const isDco = displayFormat === "DCO";

    if (isDpaOrCarousel || (cards && cards.length > 1)) {
      carouselCount++;
      entry.carousel++;
    } else if (displayFormat === "VIDEO" || (videos && videos.length > 0) || (!displayFormat && ad.video_url)) {
      videoCount++;
      entry.video++;
    } else if (displayFormat === "IMAGE" || (!displayFormat && ad.image_url) || isDco) {
      // DCO without a video in the snapshot → default to image; DPA already handled above.
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
    ctaMixByCompetitor,
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
  }[];
  topHashtags: { name: string; count: number }[];
  hashtagByCompetitor: { name: string; [hashtag: string]: string | number }[];
  avgLikesByCompetitor: { name: string; likes: number }[];
  avgCommentsByCompetitor: { name: string; comments: number }[];
  avgViewsByCompetitor: { name: string; views: number }[];
  postsPerWeekByCompetitor: { name: string; postsPerWeek: number }[];
  avgCaptionLengthByCompetitor: { name: string; chars: number }[];
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
  competitorIds?: string[]
): Promise<OrganicBenchmarkData> {
  let q = supabase
    .from("mait_organic_posts")
    .select(
      "competitor_id, post_type, video_url, caption, likes_count, comments_count, video_views, hashtags, posted_at, created_at"
    )
    .eq("workspace_id", workspaceId)
    .eq("platform", "instagram")
    .limit(3000);
  if (competitorIds && competitorIds.length > 0) {
    q = q.in("competitor_id", competitorIds);
  }

  const [{ data: competitors }, { data: rawPosts }] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .eq("workspace_id", workspaceId)
      .order("page_name"),
    q,
  ]);

  const comps = (competitors ?? []) as CompetitorRef[];
  const posts = (rawPosts ?? []) as OrganicRow[];
  const compMap = new Map(comps.map((c) => [c.id, c.page_name]));

  function classify(p: OrganicRow): "image" | "video" | "reel" {
    const t = (p.post_type ?? "").toLowerCase();
    if (t.includes("reel")) return "reel";
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
    }))
    .sort((a, b) => b.image + b.video + b.reel - (a.image + a.video + a.reel));

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
    totals: {
      totalPosts: posts.length,
      avgLikes: avg(allLikes),
      avgComments: avg(allComments),
      avgViews: avg(allViews),
      avgCaptionLength: avg(allCaptions),
    },
  };
}
