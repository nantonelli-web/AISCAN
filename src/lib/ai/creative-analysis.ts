/**
 * AI Creative Analysis — two-agent system for comparative ad analysis.
 *
 * 1. Copywriter Agent (Claude Haiku 4.5) — analyzes text: headlines, copy, CTA
 * 2. Creative Director Agent (Gemini 2.5 Flash) — analyzes images/visuals
 *
 * Both use OpenRouter with the same API key. Three model tiers were
 * evaluated on 2026-04-27: cheap (DeepSeek V3.2 + Gemini 2.0 Flash
 * Lite), pragmatic (current), premium (Claude Sonnet 4.5 on both).
 * The pragmatic tier costs ~$0.025 per Compare — negligible — and
 * delivers native-quality Italian narrative + proper multimodal
 * vision. See memory/project_ai_model_options.md for the matrix.
 */

import { getOpenRouterCredentials } from "@/lib/billing/credentials";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const COPYWRITER_MODEL = "anthropic/claude-haiku-4.5";
const CREATIVE_DIRECTOR_MODEL = "google/gemini-2.5-flash";

export interface BrandAdData {
  brandName: string;
  competitorId: string;
  ads: {
    headline: string | null;
    ad_text: string | null;
    description: string | null;
    cta: string | null;
    image_url: string | null;
    /** Surfaces the ad served on. For Meta this is facebook/instagram/etc.;
     *  for Google it's google_search/display/youtube. Surfaced into the
     *  visual-analysis prompt so the LLM can label each image with the
     *  Google ad type (YouTube vs Display vs Search) instead of writing
     *  generic visual notes. */
    platforms?: string[] | null;
    /** Lowercased ad format ("text" / "image" / "video" / "shopping"
     *  on Google; "image" / "video" / "carousel" / "dpa" / "text" on
     *  Meta). Lets the visual analysis skip TEXT-format rows because
     *  their `image_url` is a screenshot of formatted text — analysing
     *  it as a creative produces nonsense like "the brand uses a clean
     *  white background and minimal photography". */
    format?: string | null;
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
 * Coerce an AI-returned value into a single string, even if the model
 * occasionally answers a per-brand field with a comparative object
 * keyed by brand name (e.g. `{ "Marina Rinaldi": "...", "Ulla Popken": "..." }`).
 * Without this guard the React renderer hits error #31 when it tries
 * to render the object directly.
 *
 * Resolution order:
 *   1. Already a string → return as-is.
 *   2. Object with a key matching `brandName` → use that value.
 *   3. Object → return the first string value found.
 *   4. Array → join with " · ".
 *   5. Anything else → stringified, truncated to 400 chars.
 */
function coerceString(v: unknown, brandName: string): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .join(" · ");
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const direct = obj[brandName];
    if (typeof direct === "string") return direct;
    for (const value of Object.values(obj)) {
      if (typeof value === "string" && value) return value;
    }
    return JSON.stringify(v).slice(0, 400);
  }
  return String(v).slice(0, 400);
}

function coerceStringArray(v: unknown, brandName: string): string[] {
  if (Array.isArray(v)) {
    return v.flatMap((x) => {
      if (typeof x === "string") return [x];
      if (typeof x === "object" && x !== null) {
        const sub = (x as Record<string, unknown>)[brandName];
        if (typeof sub === "string") return [sub];
      }
      return [];
    });
  }
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    const direct = obj[brandName];
    if (Array.isArray(direct)) {
      return direct.filter((x): x is string => typeof x === "string");
    }
  }
  return [];
}

/**
 * Normalize a raw copywriter response. Guarantees every per-brand
 * field is a plain string (or string[] for emotionalTriggers) so the
 * React renderer cannot trip over schema drift.
 */
function normalizeCopywriterReport(
  raw: unknown,
): CreativeAnalysisResult["copywriterReport"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const inputBrands = Array.isArray(r.brandAnalyses) ? r.brandAnalyses : [];
  const brandAnalyses: CopywriterBrandAnalysis[] = inputBrands.map((b) => {
    const entry = (b ?? {}) as Record<string, unknown>;
    const name =
      typeof entry.brandName === "string" ? entry.brandName : "";
    return {
      brandName: name,
      toneOfVoice: coerceString(entry.toneOfVoice, name),
      copyStyle: coerceString(entry.copyStyle, name),
      emotionalTriggers: coerceStringArray(entry.emotionalTriggers, name),
      ctaPatterns: coerceString(entry.ctaPatterns, name),
      strengths: coerceString(entry.strengths, name),
      weaknesses: coerceString(entry.weaknesses, name),
    };
  });
  return {
    brandAnalyses,
    comparison: coerceString(r.comparison, ""),
    recommendations: coerceString(r.recommendations, ""),
  };
}

function normalizeCreativeDirectorReport(
  raw: unknown,
): CreativeAnalysisResult["creativeDirectorReport"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const inputBrands = Array.isArray(r.brandAnalyses) ? r.brandAnalyses : [];
  const brandAnalyses: CreativeDirectorBrandAnalysis[] = inputBrands.map((b) => {
    const entry = (b ?? {}) as Record<string, unknown>;
    const name =
      typeof entry.brandName === "string" ? entry.brandName : "";
    return {
      brandName: name,
      visualStyle: coerceString(entry.visualStyle, name),
      colorPalette: coerceString(entry.colorPalette, name),
      photographyStyle: coerceString(entry.photographyStyle, name),
      brandConsistency: coerceString(entry.brandConsistency, name),
      formatPreferences: coerceString(entry.formatPreferences, name),
      strengths: coerceString(entry.strengths, name),
      weaknesses: coerceString(entry.weaknesses, name),
    };
  });
  return {
    brandAnalyses,
    comparison: coerceString(r.comparison, ""),
    recommendations: coerceString(r.recommendations, ""),
  };
}

/**
 * Copywriter Agent — analyzes ad text (headline, copy, CTA) across brands.
 * Uses DeepSeek V3.2 via OpenRouter.
 */
export async function analyzeCopy(
  brands: BrandAdData[],
  locale: "it" | "en" = "en",
  source?: "meta" | "google",
  workspaceId?: string,
): Promise<CreativeAnalysisResult["copywriterReport"]> {
  // BYO dispatch: subscription-mode workspaces hit their own
  // OpenRouter key. Caller without a workspace context falls back
  // to env (legacy behaviour). MISSING_KEY surfaces here as a
  // BillingError that the comparisons route translates to a
  // user-facing "configure your OpenRouter key" message.
  let apiKey: string;
  try {
    const creds = await getOpenRouterCredentials(workspaceId);
    apiKey = creds.token;
  } catch (e) {
    console.error("[analyzeCopy] credentials error:", e);
    return null;
  }

  // Build grouped text for each brand. Each ad is included only if it
  // carries at least one of headline / body / description / cta —
  // empty rows would just dilute the prompt. Google rows from silva
  // hit this filter heavily because the Transparency Library publishes
  // copy only on a fraction of creatives (mostly Shopping + some
  // VIDEO Skippable); brands with zero usable rows fall through to
  // the no-data placeholder below.
  let totalAdsWithCopy = 0;
  const brandSections = brands
    .map((brand) => {
      const adsText = brand.ads
        .map((ad, i) => {
          const parts: string[] = [];
          if (ad.headline) parts.push(`Headline: ${ad.headline}`);
          if (ad.ad_text) parts.push(`Copy: ${ad.ad_text}`);
          if (ad.description) parts.push(`Description: ${ad.description}`);
          if (ad.cta) parts.push(`CTA: ${ad.cta}`);
          if (parts.length === 0) return null;
          totalAdsWithCopy += 1;
          return `  Ad ${i + 1}:\n    ${parts.join("\n    ")}`;
        })
        .filter(Boolean)
        .join("\n");
      return `Brand: ${brand.brandName}\n${adsText}`;
    })
    .join("\n\n---\n\n");

  // Hard floor: if NO brand has any copy across all ads, running the
  // LLM produces hallucinations ("the brand uses emojis" when there is
  // literally no text to look at). Return a structured placeholder so
  // the UI shows a clear "no copy data" state.
  if (totalAdsWithCopy === 0) {
    const message =
      locale === "it"
        ? source === "google"
          ? "Nessuna copy disponibile per le ads scansionate. Google Transparency Library espone testo / headline solo per una frazione dei creativi (principalmente Shopping e alcuni VIDEO Skippable)."
          : "Nessuna copy disponibile per le ads scansionate."
        : source === "google"
          ? "No ad copy available on the scanned ads. Google Transparency Library only exposes ad text / headline for a fraction of creatives (mostly Shopping and some Skippable VIDEO)."
          : "No ad copy available on the scanned ads.";
    return {
      brandAnalyses: brands.map((b) => ({
        brandName: b.brandName,
        toneOfVoice: message,
        copyStyle: "",
        emotionalTriggers: [],
        ctaPatterns: "",
        strengths: "",
        weaknesses: "",
      })),
      comparison: message,
      recommendations: message,
    };
  }

  const langInstruction = locale === "it"
    ? "IMPORTANT: Write ALL text values in Italian. The entire output must be in Italian."
    : "Write all text values in English.";

  const channelLine =
    source === "meta"
      ? "You specialize in Meta (Facebook/Instagram) ad copy analysis for fashion, luxury, lifestyle, and DTC brands."
      : "You specialize in paid-advertising copy analysis (Meta, Google) for fashion, luxury, lifestyle, and DTC brands. Adapt tone and style observations to the channel where each ad runs.";

  // When source=google, warn the LLM that the input is a sparse
  // sample — Google Transparency only publishes copy for a fraction
  // of creatives. Without this hint the model writes things like
  // "this brand rarely uses CTAs" when in reality CTAs are simply
  // not exposed by Google for most ads. Frame the analysis around
  // what IS in the sample, not what is missing.
  const dataNote =
    source === "google"
      ? `\nDATA NOTE: This sample comes from Google Ads Transparency, which only publishes structured copy / headline / CTA for a fraction of creatives (mostly Shopping and some Skippable VIDEO). Analyse only the copy that is present — DO NOT infer absences (e.g. "the brand rarely uses CTAs"). Limited copy reflects the platform's data exposure, not the brand's strategy.\n`
      : "";

  const prompt = `You are a senior copywriter with 15+ years of experience in digital advertising, fluent in Italian and English. ${channelLine}

${langInstruction}
${dataNote}
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
- emotionalTriggers should be 3-5 specific triggers per brand
- ${locale === "it" ? "Write ALL descriptions, comparisons, and recommendations in Italian" : "Write all in English"}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "AISCAN - Ads Analysis Tool",
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
    return normalizeCopywriterReport(parsed);
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
  brands: BrandAdData[],
  locale: "it" | "en" = "en",
  source?: "meta" | "google",
  workspaceId?: string,
): Promise<CreativeAnalysisResult["creativeDirectorReport"]> {
  // Same BYO dispatch as analyzeCopy.
  let apiKey: string;
  try {
    const creds = await getOpenRouterCredentials(workspaceId);
    apiKey = creds.token;
  } catch (e) {
    console.error("[analyzeVisuals] credentials error:", e);
    return null;
  }

  // Collect image URLs: max 2 per brand, max 6 total (reduced to avoid Gemini timeout).
  // Filter out URL patterns the vision model cannot consume — Google Ads
  // creatives in particular ship a JS preview wrapper instead of a real
  // image, and Gemini hangs on those without ever returning. Confirmed
  // 2026-04-28 on Fiorella Rubino + Marina Rinaldi (Google channel)
  // where the visual analysis stuck for >5 min until manually killed.
  // We also carry over the source `platforms` per ad so the prompt can
  // tell the LLM which Google surface (YouTube / Display / Search /
  // PMAX) each image likely targets — without it the analysis comes
  // out as generic "visual notes" with no actionable channel context.
  //
  // FORMAT FILTER: TEXT-format ads on Google are screenshots of a
  // rendered text creative (avatar + brand + URL + headline + body
  // on white background) — they look like images but contain ZERO
  // visual creative content. Letting them through made Gemini write
  // pages of nonsense like "minimalist palette, clean photography,
  // strong typography hierarchy" about what is structurally just
  // text. Drop format=text up front; if that empties the pool we
  // return a structured placeholder explaining why.
  const imageEntries: {
    brandName: string;
    url: string;
    platforms: string[];
  }[] = [];
  for (const brand of brands) {
    const brandImages = brand.ads
      .filter((ad) => {
        if ((ad.format ?? "").toLowerCase() === "text") return false;
        const url = ad.image_url;
        if (!url || !url.startsWith("http")) return false;
        // Meta render-ad endpoints — already known to be unfetchable.
        if (url.includes("/render_ad/")) return false;
        // Google Ads JS preview wrapper (returns JavaScript, not an
        // image). Hits both the `.../ads/preview/content.js?...` and
        // any `*.js?...` shape — neither can be consumed by Gemini.
        if (/\.js(\?|$)/.test(url)) return false;
        if (url.includes("/ads/preview/")) return false;
        return true;
      })
      .slice(0, 2);
    for (const ad of brandImages) {
      if (imageEntries.length >= 6) break;
      imageEntries.push({
        brandName: brand.brandName,
        url: ad.image_url!,
        platforms: (ad.platforms ?? []).filter(Boolean),
      });
    }
  }

  // No analysable visual creatives — return a structured placeholder
  // so the UI can render a clear message instead of falling back to
  // "an error occurred". Differentiate the Google text-only case
  // because that's the most common scenario worth explaining.
  if (imageEntries.length === 0) {
    const totalAds = brands.reduce((s, b) => s + b.ads.length, 0);
    const textOnlyAds = brands.reduce(
      (s, b) =>
        s +
        b.ads.filter((a) => (a.format ?? "").toLowerCase() === "text").length,
      0,
    );
    const dominantText =
      totalAds > 0 && textOnlyAds / totalAds >= 0.5;
    const message =
      locale === "it"
        ? dominantText
          ? "Analisi creativa non disponibile: la selezione contiene solo annunci Google Search (testuali). Non hanno foto, video o grafica originale — solo testo formattato in stile risultato di ricerca, quindi non c'è niente di visivo da analizzare. Il confronto creativo torna utile su brand con creativi Image, Video o Shopping."
          : "Nessun creativo visivo disponibile da analizzare. Gli annunci scansionati non includono immagini, video o caroselli prodotto utilizzabili per il confronto."
        : dominantText
          ? "Visual analysis is not available: the selection only contains Google Search ads (text). They have no photo, video or original graphics — just formatted text in search-result style, so there is nothing visual to analyse. Creative comparison is meaningful on brands with Image, Video or Shopping creatives."
          : "No visual creatives available to analyse. The scanned ads do not include usable images, videos or shopping carousels for comparison.";
    console.warn(
      `[analyzeVisuals] no analysable images — totalAds=${totalAds} textOnly=${textOnlyAds} dominantText=${dominantText}`,
    );
    return {
      brandAnalyses: brands.map((b) => ({
        brandName: b.brandName,
        visualStyle: message,
        colorPalette: "",
        photographyStyle: "",
        brandConsistency: "",
        formatPreferences: "",
        strengths: "",
        weaknesses: "",
      })),
      comparison: message,
      recommendations: message,
    };
  }

  // Build message content with text + image_url parts. Each per-brand
  // line now carries the surfaces the images target so the LLM can name
  // the campaign type (e.g. "YouTube video ad", "Display banner", "Search
  // ad") in its analysis instead of returning untyped visual notes.
  const brandImageLabels = brands
    .map((b) => {
      const entries = imageEntries.filter((e) => e.brandName === b.brandName);
      const count = entries.length;
      const surfaces = Array.from(
        new Set(entries.flatMap((e) => e.platforms)),
      );
      const surfaceHint =
        surfaces.length > 0 ? ` (surfaces: ${surfaces.join(", ")})` : "";
      return `- ${b.brandName}: ${count} images${surfaceHint}`;
    })
    .join("\n");

  // Per-image surface table — referenced inside the prompt so the LLM
  // can correlate each image with its likely Google surface. Empty for
  // Meta because that channel doesn't carry per-ad placement on
  // Transparency-style scrapes.
  const perImageSurfaces = imageEntries
    .map((entry, i) => {
      const surf = entry.platforms.length > 0 ? entry.platforms.join(", ") : "—";
      return `${i + 1}. ${entry.brandName}: ${surf}`;
    })
    .join("\n");

  const channelContext =
    source === "google"
      ? `These ads come from the Google Ads Transparency Center. They may target different Google surfaces — YouTube (video creatives), Display Network / Discovery (image banners), Performance Max (mixed), or Search (text). Whenever you can infer the surface from the visual (aspect ratio, layout, product treatment, presence of text overlay), call it out explicitly: "this is likely a YouTube pre-roll", "this is a Display banner", etc. Do NOT assume the brand runs Meta-style social creatives.`
      : source === "meta"
        ? `These ads come from the Meta Ad Library — Facebook and Instagram placements (feed, stories, reels). Frame your analysis around social-feed aesthetic and platform conventions.`
        : `These ads span multiple channels. Surface the platform context in your analysis where it adds clarity.`;

  const textPart = {
    type: "text" as const,
    text: `You are a creative director with 15+ years of experience in fashion, luxury, and lifestyle advertising. You have a keen eye for visual trends, brand consistency, and creative effectiveness in digital paid media.

${locale === "it" ? "IMPORTANT: Write ALL text values in Italian. The entire output must be in Italian." : "Write all text values in English."}

CHANNEL CONTEXT
${channelContext}

Analyze the following ad images from ${brands.length} competing brands. The images are organized as follows:
${brandImageLabels}

Per-image surfaces (in the order images are attached below):
${perImageSurfaces}

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
- Reference fashion/luxury advertising benchmarks where relevant
- ${locale === "it" ? "Write ALL descriptions, comparisons, and recommendations in Italian" : "Write all in English"}`,
  };

  const imageParts = imageEntries.map((entry) => ({
    type: "image_url" as const,
    image_url: { url: entry.url },
  }));

  const content = [textPart, ...imageParts];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer":
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "AISCAN - Ads Analysis Tool",
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
    return normalizeCreativeDirectorReport(parsed);
  } catch (e) {
    console.error("Creative Director agent failed:", e);
    return null;
  }
}
