/**
 * AI-powered ad tagging via OpenRouter (Claude Haiku).
 *
 * Uses the OpenAI-compatible endpoint at openrouter.ai.
 * Requires OPENROUTER_API_KEY in env. If missing, tagging is silently
 * skipped — the rest of the app works fine without it.
 */

export interface AdTagResult {
  sector: string;
  creative_format: string;
  tone: string;
  objective: string;
  seasonality: string | null;
  language: string;
}

interface AdInput {
  ad_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  has_video: boolean;
  has_image: boolean;
  platforms: string[];
  landing_url: string | null;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4-5-20251001";

export async function tagAd(ad: AdInput): Promise<AdTagResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const prompt = `Analyze this Meta ad and return a JSON object with exactly these keys:
- sector: the industry/sector (e.g. "Fashion", "E-Commerce", "Food & Beverage", "SaaS", "Real Estate", "Beauty", "Fitness", "Automotive", "Travel", "Finance", "Education", "Healthcare", "Entertainment")
- creative_format: one of "Product Shot", "Lifestyle", "UGC", "Testimonial", "Promo/Sale", "Educational", "Behind the Scenes", "Meme/Humor", "Comparison", "Unboxing"
- tone: one of "Aspirational", "Informative", "Urgent", "Playful", "Professional", "Emotional", "Provocative"
- objective: estimated campaign objective, one of "Brand Awareness", "Consideration", "Traffic", "Engagement", "Lead Generation", "Conversions", "App Install", "Retargeting"
- seasonality: if the ad is clearly tied to a season/event (e.g. "Black Friday", "Summer Sale", "Ramadan", "Christmas", "Back to School"), otherwise null
- language: ISO 639-1 code of the primary language (e.g. "en", "it", "ar")

Ad data:
- Headline: ${ad.headline ?? "(none)"}
- Primary text: ${ad.ad_text ?? "(none)"}
- Description: ${ad.description ?? "(none)"}
- CTA button: ${ad.cta ?? "(none)"}
- Format: ${ad.has_video ? "Video" : ad.has_image ? "Image" : "Unknown"}
- Platforms: ${ad.platforms.join(", ") || "N/A"}
- Landing URL: ${ad.landing_url ?? "(none)"}

Return ONLY the JSON object, no markdown, no explanation.`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "x-title": "MAIT - Meta Ads Intelligence Tool",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error(`OpenRouter API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const body = await res.json();
    const text = body.choices?.[0]?.message?.content ?? null;
    if (!text) return null;

    // Strip potential markdown fences
    const clean = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean) as AdTagResult;
    return parsed;
  } catch (e) {
    console.error("AI tagging failed:", e);
    return null;
  }
}

/** Tag multiple ads in parallel (batched to avoid rate limits). */
export async function tagAdsBatch(
  ads: (AdInput & { id: string })[],
  concurrency = 3
): Promise<Map<string, AdTagResult>> {
  const results = new Map<string, AdTagResult>();

  for (let i = 0; i < ads.length; i += concurrency) {
    const batch = ads.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (ad) => {
        const tags = await tagAd(ad);
        if (tags) results.set(ad.id, tags);
      })
    );
    for (const s of settled) {
      if (s.status === "rejected") {
        console.error("Tag batch item failed:", s.reason);
      }
    }
  }

  return results;
}
