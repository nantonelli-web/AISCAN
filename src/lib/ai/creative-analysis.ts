/**
 * AI Creative Analysis — two-agent system for comparative ad analysis.
 *
 * 1. Copywriter Agent (DeepSeek V3.2) — analyzes text: headlines, copy, CTA
 * 2. Creative Director Agent (Gemini Flash Lite) — analyzes images/visuals
 *
 * Both use OpenRouter with the same API key.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const COPYWRITER_MODEL = "deepseek/deepseek-v3.2";
const CREATIVE_DIRECTOR_MODEL = "google/gemini-2.0-flash-lite-001";

export interface BrandAdData {
  brandName: string;
  competitorId: string;
  ads: {
    headline: string | null;
    ad_text: string | null;
    description: string | null;
    cta: string | null;
    image_url: string | null;
  }[];
}

export interface CopywriterBrandAnalysis {
  brandName: string;
  toneOfVoice: string;
  copyStyle: string;
  emotionalTriggers: string[];
  ctaPatterns: string;
  strengths: string;
  weaknesses: string;
}

export interface CreativeDirectorBrandAnalysis {
  brandName: string;
  visualStyle: string;
  colorPalette: string;
  photographyStyle: string;
  brandConsistency: string;
  formatPreferences: string;
  strengths: string;
  weaknesses: string;
}

export interface CreativeAnalysisResult {
  copywriterReport: {
    brandAnalyses: CopywriterBrandAnalysis[];
    comparison: string;
    recommendations: string;
  } | null;
  creativeDirectorReport: {
    brandAnalyses: CreativeDirectorBrandAnalysis[];
    comparison: string;
    recommendations: string;
  } | null;
}

function stripMarkdownFences(text: string): string {
  return text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
}

/**
 * Copywriter Agent — analyzes ad text (headline, copy, CTA) across brands.
 * Uses DeepSeek V3.2 via OpenRouter.
 */
export async function analyzeCopy(
  brands: BrandAdData[]
): Promise<CreativeAnalysisResult["copywriterReport"]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not set, skipping copy analysis");
    return null;
  }

  // Build grouped text for each brand
  const brandSections = brands
    .map((brand) => {
      const adsText = brand.ads
        .map((ad, i) => {
          const parts: string[] = [];
          if (ad.headline) parts.push(`Headline: ${ad.headline}`);
          if (ad.ad_text) parts.push(`Copy: ${ad.ad_text}`);
          if (ad.description) parts.push(`Description: ${ad.description}`);
          if (ad.cta) parts.push(`CTA: ${ad.cta}`);
          return parts.length > 0
            ? `  Ad ${i + 1}:\n    ${parts.join("\n    ")}`
            : null;
        })
        .filter(Boolean)
        .join("\n");
      return `Brand: ${brand.brandName}\n${adsText}`;
    })
    .join("\n\n---\n\n");

  const prompt = `You are a senior copywriter with 15+ years of experience in digital advertising, fluent in Italian and English. You specialize in Meta (Facebook/Instagram) ad copy analysis for fashion, luxury, lifestyle, and DTC brands.

Analyze the following ads from ${brands.length} competing brands. For each brand, evaluate their ad copy strategy, then provide a direct comparison and actionable recommendations.

${brandSections}

Return a JSON object with this exact structure (no markdown, no explanation, just the JSON):
{
  "brandAnalyses": [
    {
      "brandName": "...",
      "toneOfVoice": "description of the brand's tone (e.g. aspirational, conversational, urgent, professional)",
      "copyStyle": "description of copy style (length, structure, use of emojis, formatting)",
      "emotionalTriggers": ["trigger1", "trigger2", "trigger3"],
      "ctaPatterns": "analysis of CTA usage and patterns",
      "strengths": "what they do well in their copy",
      "weaknesses": "areas for improvement"
    }
  ],
  "comparison": "A direct narrative comparison between the brands, highlighting key differences and who does what better. Use Italian market terminology where relevant.",
  "recommendations": "Actionable recommendations for each brand to improve their copy strategy. Reference specific examples from the ads analyzed."
}

Important:
- Provide one entry in brandAnalyses for each brand, in the same order as presented
- Be specific, reference actual ad examples when possible
- Include Italian marketing terminology where it adds value
- emotionalTriggers should be 3-5 specific triggers per brand`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "MAIT - Meta Ads Intelligence Tool",
      },
      body: JSON.stringify({
        model: COPYWRITER_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.error(
        `Copywriter agent error: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const body = await res.json();
    const text = body.choices?.[0]?.message?.content ?? null;
    if (!text) {
      console.error("Copywriter agent returned no content");
      return null;
    }

    const clean = stripMarkdownFences(text);
    const parsed = JSON.parse(clean);
    return parsed as CreativeAnalysisResult["copywriterReport"];
  } catch (e) {
    console.error("Copywriter agent failed:", e);
    return null;
  }
}

/**
 * Creative Director Agent — analyzes ad images across brands.
 * Uses Gemini Flash Lite via OpenRouter (multimodal).
 * Max 3 images per brand, 9 total.
 */
export async function analyzeVisuals(
  brands: BrandAdData[]
): Promise<CreativeAnalysisResult["creativeDirectorReport"]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not set, skipping visual analysis");
    return null;
  }

  // Collect image URLs: max 3 per brand, max 9 total
  const imageEntries: { brandName: string; url: string }[] = [];
  for (const brand of brands) {
    const brandImages = brand.ads
      .filter(
        (ad) =>
          ad.image_url &&
          !ad.image_url.includes("/render_ad/") &&
          ad.image_url.startsWith("http")
      )
      .slice(0, 3);
    for (const ad of brandImages) {
      if (imageEntries.length >= 9) break;
      imageEntries.push({ brandName: brand.brandName, url: ad.image_url! });
    }
  }

  if (imageEntries.length === 0) {
    console.error("No valid image URLs found for visual analysis");
    return null;
  }

  // Build message content with text + image_url parts
  const brandImageLabels = brands
    .map((b) => {
      const count = imageEntries.filter((e) => e.brandName === b.brandName).length;
      return `- ${b.brandName}: ${count} images`;
    })
    .join("\n");

  const textPart = {
    type: "text" as const,
    text: `You are a creative director with 15+ years of experience in fashion, luxury, and lifestyle advertising. You have a keen eye for visual trends, brand consistency, and creative effectiveness in digital paid media.

Analyze the following ad images from ${brands.length} competing brands. The images are organized as follows:
${brandImageLabels}

The images are provided in order: first all images from the first brand, then the second, etc.

For each brand, evaluate their visual strategy. Then provide a direct comparison and actionable recommendations.

Return a JSON object with this exact structure (no markdown, no explanation, just the JSON):
{
  "brandAnalyses": [
    {
      "brandName": "...",
      "visualStyle": "description of overall visual style (minimalist, bold, editorial, lifestyle, etc.)",
      "colorPalette": "dominant colors and their usage patterns",
      "photographyStyle": "type of photography or illustration (studio, lifestyle, UGC, flat lay, etc.)",
      "brandConsistency": "how consistent the visual identity is across ads",
      "formatPreferences": "preferred ad formats and compositions (single image, carousel, square, vertical, etc.)",
      "strengths": "visual strengths and what works well",
      "weaknesses": "visual weaknesses and areas for improvement"
    }
  ],
  "comparison": "A direct narrative comparison of the visual strategies. Who stands out and why. Reference Italian/European market visual trends where relevant.",
  "recommendations": "Actionable recommendations for each brand's visual strategy."
}

Important:
- Provide one entry in brandAnalyses for each brand, in the same order as listed above
- Be specific about colors (use names or approximate hex values), compositions, and styles
- Reference fashion/luxury advertising benchmarks where relevant`,
  };

  const imageParts = imageEntries.map((entry) => ({
    type: "image_url" as const,
    image_url: { url: entry.url },
  }));

  const content = [textPart, ...imageParts];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "MAIT - Meta Ads Intelligence Tool",
      },
      body: JSON.stringify({
        model: CREATIVE_DIRECTOR_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(
        `Creative Director agent error: ${res.status} ${res.statusText} — ${errText.slice(0, 500)}`
      );
      return null;
    }

    const body = await res.json();
    const text = body.choices?.[0]?.message?.content ?? null;
    if (!text) {
      console.error("Creative Director agent returned no content");
      return null;
    }

    const clean = stripMarkdownFences(text);
    const parsed = JSON.parse(clean);
    return parsed as CreativeAnalysisResult["creativeDirectorReport"];
  } catch (e) {
    console.error("Creative Director agent failed:", e);
    return null;
  }
}
