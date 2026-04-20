import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inferObjective } from "@/lib/analytics/objective-inference";
import { generateSinglePptx, generateComparisonPptx, type BrandData, type SectionType } from "@/lib/report/generate-pptx";
import { generateSinglePdf, generateComparisonPdf } from "@/lib/report/generate-pdf";
import { analyzeCopy, analyzeVisuals, type BrandAdData, type CreativeAnalysisResult } from "@/lib/ai/creative-analysis";
import { extractImagesFromTemplate, type ThemeConfig } from "@/lib/report/parse-template";
import { consumeCredits, refundCredits } from "@/lib/credits/consume";

export const maxDuration = 300;

const schema = z.object({
  type: z.enum(["single", "comparison"]),
  channel: z.enum(["all", "meta", "google", "instagram"]).optional().default("all"),
  competitor_ids: z.array(z.string().uuid()).min(1).max(3),
  template_id: z.string().uuid().optional(),
  format: z.enum(["pptx", "pdf"]),
  locale: z.enum(["it", "en"]),
  sections: z.array(z.enum(["technical", "copy", "visual", "benchmark"])).optional(),
  font_family: z.string().max(60).optional(),
});

/**
 * Fetch brand data for report generation.
 * Reuses the same data-gathering logic as /api/competitors/compare.
 */
async function fetchBrandData(
  admin: ReturnType<typeof createAdminClient>,
  competitorId: string,
  source?: "meta" | "google"
): Promise<BrandData> {
  let adsQuery = admin
    .from("mait_ads_external")
    .select(
      "ad_archive_id, headline, ad_text, cta, image_url, video_url, platforms, status, start_date, end_date, created_at, raw_data"
    )
    .eq("competitor_id", competitorId)
    .limit(500);
  if (source) adsQuery = adsQuery.eq("source", source);

  const [{ data: comp }, { data: ads }] = await Promise.all([
    admin
      .from("mait_competitors")
      .select("id, page_name, last_scraped_at, profile_picture_url")
      .eq("id", competitorId)
      .single(),
    adsQuery,
  ]);

  type AdRow = {
    ad_archive_id: string;
    headline: string | null;
    ad_text: string | null;
    cta: string | null;
    image_url: string | null;
    video_url: string | null;
    platforms: string[] | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    raw_data: Record<string, unknown> | null;
  };

  const adsList = (ads ?? []) as AdRow[];
  const active = adsList.filter((a) => a.status === "ACTIVE");
  const isGoogle = source === "google";

  // Format counts — Meta uses snapshot.cards for carousel, Google uses raw_data.adFormat
  let imageCount = 0;
  let videoCount = 0;
  let carouselCount = 0;
  for (const a of adsList) {
    if (isGoogle) {
      const fmt = ((a.raw_data?.adFormat as string) ?? "").toLowerCase();
      if (fmt.includes("video")) videoCount++;
      else imageCount++;
    } else {
      if (a.video_url) {
        videoCount++;
      } else {
        imageCount++;
      }
      const snapshot = (a.raw_data?.snapshot ?? {}) as Record<string, unknown>;
      const cards = (snapshot?.cards ?? []) as unknown[];
      if (cards.length > 1) carouselCount++;
    }
  }

  // CTA counts (Meta has CTA field, Google doesn't)
  const ctaMap = new Map<string, number>();
  for (const a of adsList) {
    if (a.cta) ctaMap.set(a.cta, (ctaMap.get(a.cta) ?? 0) + 1);
  }
  const topCtas = [...ctaMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Platforms
  const platMap = new Map<string, number>();
  for (const a of adsList) {
    for (const p of a.platforms ?? []) {
      platMap.set(p, (platMap.get(p) ?? 0) + 1);
    }
  }
  const platforms = [...platMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Duration
  const durations: number[] = [];
  for (const a of adsList) {
    if (!a.start_date) continue;
    const start = new Date(a.start_date).getTime();
    const end = a.status === "ACTIVE" || !a.end_date
      ? Date.now()
      : new Date(a.end_date).getTime();
    const days = Math.round((end - start) / 86_400_000);
    if (days < 1) continue;
    durations.push(days);
  }
  const avgDuration =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  // Copy length
  const lengths = adsList
    .map((a) => (a.ad_text ?? "").length)
    .filter((l) => l > 0);
  const avgCopyLength =
    lengths.length > 0
      ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
      : 0;

  // Refresh rate (90 days)
  const ninetyAgo = Date.now() - 90 * 86_400_000;
  const recent = adsList.filter(
    (a) => new Date(a.created_at).getTime() > ninetyAgo
  ).length;
  const adsPerWeek = Math.round((recent / (90 / 7)) * 10) / 10;

  // Advantage+ usage (Meta-specific flag in raw_data.isAaaEligible)
  const aaaCount = isGoogle
    ? 0
    : adsList.filter((a) => a.raw_data?.isAaaEligible === true).length;
  const advantagePlusPercent = adsList.length > 0
    ? Math.round((aaaCount / adsList.length) * 100)
    : 0;

  // Avg variants per ad (Meta-specific collationCount in raw_data)
  const variantCounts = isGoogle
    ? []
    : adsList
        .map((a) => a.raw_data?.collationCount)
        .filter((v): v is number => typeof v === "number" && v > 0);
  const avgVariants = variantCounts.length > 0
    ? Math.round((variantCounts.reduce((a, b) => a + b, 0) / variantCounts.length) * 10) / 10
    : 0;

  // Latest ads — download images as base64 for PPTX embedding.
  // Aggressive dedup: different ad_archive_ids often share the same creative.
  // Primary key = content signature (headline + body + cta). Fallback = image
  // URL pathname (ignoring query strings so CDN-signed URLs still match).
  const dedupKey = (a: AdRow): string => {
    const content = [a.headline?.trim(), a.ad_text?.trim(), a.cta?.trim()]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
    if (content.length > 0) return `c:${content.slice(0, 400)}`;
    if (a.image_url) {
      try {
        const u = new URL(a.image_url);
        return `i:${u.pathname}`;
      } catch {
        return `i:${a.image_url}`;
      }
    }
    return `id:${a.ad_archive_id}`;
  };

  const seenKeys = new Set<string>();
  const sortedAds = adsList
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .filter((a) => {
      const key = dedupKey(a);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .slice(0, 8); // a bit more than we display (6) to give analysis slides headroom

  const latestAds = await Promise.all(
    sortedAds.map(async (a) => {
      let imageBase64: string | null = null;
      let imageMimeType: string | null = null;
      if (a.image_url && !a.image_url.includes("/render_ad/") && a.image_url.startsWith("http")) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(a.image_url, { signal: controller.signal });
          clearTimeout(timer);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 100) {
              imageMimeType = res.headers.get("content-type") ?? "image/jpeg";
              imageBase64 = buf.toString("base64");
            }
          }
        } catch { /* skip */ }
      }
      return {
        headline: a.headline,
        image_url: a.image_url,
        ad_archive_id: a.ad_archive_id,
        cta: a.cta,
        adText: a.ad_text,
        platforms: a.platforms,
        status: a.status,
        startDate: a.start_date,
        imageBase64,
        imageMimeType,
      };
    })
  );

  // Infer campaign objective — only for Meta (Google lacks the needed signals)
  const objectiveInference = isGoogle
    ? { objective: "unknown" as const, confidence: 0, signals: [] as string[] }
    : inferObjective(adsList.map((a) => a.raw_data));

  // Download brand logo — try profile_picture_url, fallback to raw_data
  let brandLogoBase64: string | null = null;
  let brandLogoMimeType: string | null = null;
  const logoUrl = (comp?.profile_picture_url as string | null)
    ?? ((adsList[0]?.raw_data?.snapshot as Record<string, unknown> | undefined)?.pageProfilePictureUrl as string | null);
  if (logoUrl && logoUrl.startsWith("http")) {
    try {
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(logoUrl, { signal: ctrl.signal });
      clearTimeout(tmr);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 100) {
          brandLogoMimeType = r.headers.get("content-type") ?? "image/jpeg";
          brandLogoBase64 = buf.toString("base64");
        }
      }
    } catch { /* skip */ }
  }

  return {
    id: competitorId,
    name: comp?.page_name ?? "\u2014",
    totalAds: adsList.length,
    activeAds: active.length,
    imageCount,
    videoCount,
    carouselCount,
    topCtas,
    platforms,
    avgDuration,
    avgCopyLength,
    adsPerWeek,
    advantagePlusPercent,
    avgVariants,
    lastScrapedAt: comp?.last_scraped_at ?? null,
    brandLogoBase64,
    brandLogoMimeType,
    objectiveInference,
    latestAds,
  };
}

/**
 * Fetch Instagram organic data mapped to BrandData structure.
 */
async function fetchInstagramBrandData(
  admin: ReturnType<typeof createAdminClient>,
  competitorId: string
): Promise<BrandData> {
  const [{ data: comp }, { data: posts }] = await Promise.all([
    admin
      .from("mait_competitors")
      .select("id, page_name, last_scraped_at")
      .eq("id", competitorId)
      .single(),
    admin
      .from("mait_organic_posts")
      .select("post_id, caption, display_url, video_url, post_type, likes_count, comments_count, posted_at, created_at")
      .eq("competitor_id", competitorId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(500),
  ]);

  type PostRow = {
    post_id: string;
    caption: string | null;
    display_url: string | null;
    video_url: string | null;
    post_type: string | null;
    likes_count: number;
    comments_count: number;
    posted_at: string | null;
    created_at: string;
  };

  const postsList = (posts ?? []) as PostRow[];
  const imageCount = postsList.filter((p) => p.post_type === "Image" || p.post_type === "Sidecar").length;
  const videoCount = postsList.filter((p) => p.post_type === "Video" || p.post_type === "Reel").length;

  // Map post types as "platforms"
  const typeMap = new Map<string, number>();
  for (const p of postsList) {
    const t = p.post_type ?? "Image";
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
  }
  const platforms = [...typeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Duration (days since first post)
  const avgDuration = 0;

  // Caption length
  const lengths = postsList.map((p) => (p.caption ?? "").length).filter((l) => l > 0);
  const avgCopyLength = lengths.length > 0
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : 0;

  // Refresh rate
  const ninetyAgo = Date.now() - 90 * 86_400_000;
  const recent = postsList.filter((p) => new Date(p.created_at).getTime() > ninetyAgo).length;
  const adsPerWeek = Math.round((recent / (90 / 7)) * 10) / 10;

  const latestAds = postsList.slice(0, 6).map((p) => ({
    headline: p.caption?.slice(0, 80) ?? null,
    image_url: p.display_url,
    ad_archive_id: p.post_id,
  }));

  return {
    id: competitorId,
    name: comp?.page_name ?? "\u2014",
    totalAds: postsList.length,
    activeAds: postsList.length,
    imageCount,
    videoCount,
    carouselCount: 0,
    topCtas: [],
    platforms,
    avgDuration,
    avgCopyLength,
    adsPerWeek,
    lastScrapedAt: comp?.last_scraped_at ?? null,
    objectiveInference: { objective: "unknown" as const, confidence: 0, signals: [] },
    latestAds,
  };
}

/**
 * Fetch ad data for AI analysis (copy & visual agents).
 */
async function fetchBrandAdData(
  admin: ReturnType<typeof createAdminClient>,
  competitorId: string,
  brandName: string
): Promise<BrandAdData> {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { data: ads } = await admin
    .from("mait_ads_external")
    .select("headline, ad_text, cta, image_url, raw_data")
    .eq("competitor_id", competitorId)
    .gte("created_at", tenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(12);

  type AdRow = {
    headline: string | null;
    ad_text: string | null;
    cta: string | null;
    image_url: string | null;
    raw_data: Record<string, unknown> | null;
  };

  const adsList = (ads ?? []) as AdRow[];

  return {
    brandName,
    competitorId,
    ads: adsList.map((a) => ({
      headline: a.headline,
      ad_text: a.ad_text,
      description: ((a.raw_data?.snapshot as Record<string, unknown> | undefined)?.link_description as string | undefined) ?? null,
      cta: a.cta,
      image_url: a.image_url,
    })),
  };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { type, channel, competitor_ids, template_id, format, locale } = parsed.data;
  const sections: SectionType[] = (parsed.data.sections as SectionType[] | undefined) ?? ["technical"];

  // Validate: single requires exactly 1, comparison requires 2-3
  if (type === "single" && competitor_ids.length !== 1) {
    return NextResponse.json({ error: "Single report requires exactly 1 brand" }, { status: 400 });
  }
  if (type === "comparison" && competitor_ids.length < 2) {
    return NextResponse.json({ error: "Comparison report requires 2-3 brands" }, { status: 400 });
  }

  // Credit check
  const creditAction = parsed.data.type === "single" ? "report_single" as const : "report_comparison" as const;
  const credit = await consumeCredits(user.id, creditAction, `Report generation: ${parsed.data.type}`);
  if (!credit.ok) {
    return NextResponse.json(
      { error: "Insufficient credits", balance: credit.balance },
      { status: 402 }
    );
  }

  const admin = createAdminClient();

  // Fetch template + brand data IN PARALLEL (saves 0.5-2s)
  const [templateResult, brands] = await Promise.all([
    // Template fetch
    (async (): Promise<ThemeConfig | null> => {
      if (!template_id) return null;
      const { data: tmpl } = await admin
        .from("mait_client_templates")
        .select("theme_config, storage_path")
        .eq("id", template_id)
        .single();
      if (!tmpl?.theme_config) return null;
      let cfg = tmpl.theme_config as unknown as ThemeConfig;
      if (tmpl.storage_path) {
        try {
          const { data: fileData } = await admin.storage
            .from("templates")
            .download(tmpl.storage_path);
          if (fileData) {
            const buffer = await fileData.arrayBuffer();
            const images = await extractImagesFromTemplate(buffer);
            cfg = { ...cfg, ...images };
          }
        } catch (err) {
          console.warn("[report/generate] Failed to extract images from template:", err);
        }
      }
      return cfg;
    })(),
    // Brand data fetch
    Promise.all(
      competitor_ids.map(async (id) => {
        if (channel === "instagram") {
          return fetchInstagramBrandData(admin, id);
        }
        return fetchBrandData(admin, id, channel === "all" ? undefined : channel);
      })
    ),
  ]);
  let themeConfig = templateResult;

  // Fetch AI analysis if needed — check comparison cache first
  let copyAnalysis: CreativeAnalysisResult["copywriterReport"] | null = null;
  let visualAnalysis: CreativeAnalysisResult["creativeDirectorReport"] | null = null;

  const needsCopy = sections.includes("copy");
  const needsVisual = sections.includes("visual");

  if (needsCopy || needsVisual) {
    // Check if we have cached comparison data that's not stale
    const sortedIds = [...competitor_ids].sort();
    const { data: userProfile } = await admin
      .from("mait_users")
      .select("workspace_id")
      .eq("id", user.id)
      .single();
    const wsId = userProfile?.workspace_id;

    const { data: cached } = wsId
      ? await admin
          .from("mait_comparisons")
          .select("copy_analysis, visual_analysis, stale")
          .eq("workspace_id", wsId)
          .eq("competitor_ids", sortedIds)
          .eq("locale", locale)
          .single()
      : { data: null };

    const cachedCopy = cached && !cached.stale ? cached.copy_analysis : null;
    const cachedVisual = cached && !cached.stale ? cached.visual_analysis : null;

    // Use cache where available, generate only what's missing
    const mustGenerateCopy = needsCopy && !cachedCopy;
    const mustGenerateVisual = needsVisual && !cachedVisual;

    if (mustGenerateCopy || mustGenerateVisual) {
      const brandAdData = await Promise.all(
        brands.map((b) => fetchBrandAdData(admin, b.id, b.name))
      );

      const [copyResult, visualResult] = await Promise.all([
        mustGenerateCopy ? analyzeCopy(brandAdData, parsed.data.locale) : null,
        mustGenerateVisual ? analyzeVisuals(brandAdData, parsed.data.locale) : null,
      ]);

      copyAnalysis = copyResult ?? cachedCopy;
      visualAnalysis = visualResult ?? cachedVisual;

      // Save freshly generated analysis to cache for future reuse (fire-and-forget)
      if (wsId && (copyResult || visualResult)) {
        void admin
          .from("mait_comparisons")
          .upsert(
            {
              workspace_id: wsId,
              competitor_ids: sortedIds,
              locale,
              ...(copyResult ? { copy_analysis: copyResult } : {}),
              ...(visualResult ? { visual_analysis: visualResult } : {}),
              stale: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "workspace_id,competitor_ids,locale" }
          );
      }
    } else {
      copyAnalysis = cachedCopy;
      visualAnalysis = cachedVisual;
    }
  }

  // Override font if user selected one
  if (parsed.data.font_family) {
    const base = themeConfig ?? {} as Partial<ThemeConfig>;
    themeConfig = {
      colors: base.colors ?? { primary: "#D4A843", secondary: "#5b7ea3", background: "#0A0A0A", text: "#F5F5F5", accent: "#6b8e6b" },
      fonts: {
        heading: parsed.data.font_family,
        body: parsed.data.font_family,
      },
      logoBase64: base.logoBase64 ?? null,
      logoMimeType: base.logoMimeType ?? null,
      coverImageBase64: base.coverImageBase64 ?? null,
      coverImageMimeType: base.coverImageMimeType ?? null,
      contentBackground: base.contentBackground ?? null,
    };
  }

  let fileBytes: Uint8Array;
  let fileName: string;
  let contentType: string;

  try {
    if (type === "single") {
      const brand = brands[0];
      const safeName = brand.name.replace(/[^a-zA-Z0-9_-]/g, "_");

      if (format === "pptx") {
        const buf = await generateSinglePptx(brand, themeConfig, locale, sections, copyAnalysis, visualAnalysis, channel);
        fileBytes = new Uint8Array(buf);
        fileName = `AISCAN_Report_${safeName}.pptx`;
        contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else {
        const buf = await generateSinglePdf(brand, themeConfig, locale, sections, copyAnalysis, visualAnalysis);
        fileBytes = new Uint8Array(buf);
        fileName = `AISCAN_Report_${safeName}.pdf`;
        contentType = "application/pdf";
      }
    } else {
      const brandNames = brands.map((b) => b.name.replace(/[^a-zA-Z0-9_-]/g, "_")).join("_vs_");

      if (format === "pptx") {
        const buf = await generateComparisonPptx(brands, themeConfig, locale, sections, copyAnalysis, visualAnalysis, channel);
        fileBytes = new Uint8Array(buf);
        fileName = `AISCAN_Comparison_${brandNames}.pptx`;
        contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else {
        const buf = await generateComparisonPdf(brands, themeConfig, locale, sections, copyAnalysis, visualAnalysis);
        fileBytes = new Uint8Array(buf);
        fileName = `AISCAN_Comparison_${brandNames}.pdf`;
        contentType = "application/pdf";
      }
    }
  } catch (err) {
    console.error("[report/generate] Generation failed:", err);
    await refundCredits(user.id, creditAction, `Report generation: ${parsed.data.type}`);
    return NextResponse.json({ error: "Report generation failed" }, { status: 500 });
  }

  return new NextResponse(Buffer.from(fileBytes) as never, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
