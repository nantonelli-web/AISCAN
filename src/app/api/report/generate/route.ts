import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inferObjective } from "@/lib/analytics/objective-inference";
import { generateSinglePptx, generateComparisonPptx, type BrandData, type SectionType } from "@/lib/report/generate-pptx";
import { generateSinglePdf, generateComparisonPdf } from "@/lib/report/generate-pdf";
import { analyzeCopy, analyzeVisuals, type BrandAdData, type CreativeAnalysisResult } from "@/lib/ai/creative-analysis";
import { extractImagesFromTemplate, type ThemeConfig } from "@/lib/report/parse-template";

export const maxDuration = 120;

const schema = z.object({
  type: z.enum(["single", "comparison"]),
  channel: z.enum(["all", "meta", "google", "instagram"]).optional().default("all"),
  competitor_ids: z.array(z.string().uuid()).min(1).max(3),
  template_id: z.string().uuid().optional(),
  format: z.enum(["pptx", "pdf"]),
  locale: z.enum(["it", "en"]),
  sections: z.array(z.enum(["technical", "copy", "visual"])).optional(),
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
      .select("id, page_name, last_scraped_at")
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
  const imageCount = adsList.filter(
    (a) => a.image_url && !a.video_url
  ).length;
  const videoCount = adsList.filter((a) => a.video_url).length;

  // Carousel detection: ads with multiple cards in raw_data
  let carouselCount = 0;
  for (const a of adsList) {
    const snapshot = (a.raw_data?.snapshot ?? {}) as Record<string, unknown>;
    const cards = (snapshot?.cards ?? []) as unknown[];
    if (cards.length > 1) carouselCount++;
  }

  // CTA counts
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
    const end = a.end_date ? new Date(a.end_date).getTime() : Date.now();
    durations.push(Math.max(1, Math.round((end - start) / 86_400_000)));
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

  // Latest ads
  const latestAds = adsList
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 6)
    .map((a) => ({
      headline: a.headline,
      image_url: a.image_url,
      ad_archive_id: a.ad_archive_id,
    }));

  // Infer campaign objective
  const objectiveInference = inferObjective(adsList.map((a) => a.raw_data));

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
    lastScrapedAt: comp?.last_scraped_at ?? null,
    objectiveInference,
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

  const admin = createAdminClient();

  // Fetch theme config + images from template if provided
  let themeConfig: ThemeConfig | null = null;
  if (template_id) {
    const { data: tmpl } = await admin
      .from("mait_client_templates")
      .select("theme_config, storage_path")
      .eq("id", template_id)
      .single();
    if (tmpl?.theme_config) {
      themeConfig = tmpl.theme_config as unknown as ThemeConfig;

      // Download the original PPTX from storage to extract images
      if (tmpl.storage_path) {
        try {
          const { data: fileData } = await admin.storage
            .from("templates")
            .download(tmpl.storage_path);
          if (fileData) {
            const buffer = await fileData.arrayBuffer();
            const images = await extractImagesFromTemplate(buffer);
            themeConfig = {
              ...themeConfig,
              ...images,
            };
          }
        } catch (err) {
          console.warn("[report/generate] Failed to extract images from template:", err);
        }
      }
    }
  }

  // Fetch brand data
  const brands = await Promise.all(
    competitor_ids.map((id) =>
      fetchBrandData(
        admin,
        id,
        channel === "all" ? undefined : channel === "instagram" ? "meta" : channel
      )
    )
  );

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
        const buf = await generateSinglePptx(brand, themeConfig, locale, sections, copyAnalysis, visualAnalysis);
        fileBytes = new Uint8Array(buf);
        fileName = `MAIT_Report_${safeName}.pptx`;
        contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else {
        const buf = await generateSinglePdf(brand, themeConfig, locale, sections, copyAnalysis, visualAnalysis);
        fileBytes = new Uint8Array(buf);
        fileName = `MAIT_Report_${safeName}.pdf`;
        contentType = "application/pdf";
      }
    } else {
      const brandNames = brands.map((b) => b.name.replace(/[^a-zA-Z0-9_-]/g, "_")).join("_vs_");

      if (format === "pptx") {
        const buf = await generateComparisonPptx(brands, themeConfig, locale, sections, copyAnalysis, visualAnalysis);
        fileBytes = new Uint8Array(buf);
        fileName = `MAIT_Comparison_${brandNames}.pptx`;
        contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      } else {
        const buf = await generateComparisonPdf(brands, themeConfig, locale, sections, copyAnalysis, visualAnalysis);
        fileBytes = new Uint8Array(buf);
        fileName = `MAIT_Comparison_${brandNames}.pdf`;
        contentType = "application/pdf";
      }
    }
  } catch (err) {
    console.error("[report/generate] Generation failed:", err);
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
