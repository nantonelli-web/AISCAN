/**
 * AI Relevance Check — judges whether each "latest ad" creative shown on
 * the Compare page actually belongs to the brand's advertising universe.
 *
 * Motivation: the deterministic geo + copy-language filters
 * (`lib/ads/ad-filters`) keep wrong-country / wrong-language creatives out,
 * but they can't catch an *on-language, in-country* creative that is simply
 * off-brand or misattributed (e.g. an unrelated sneaker surfacing for a
 * plus-size womenswear brand). That needs world knowledge — an LLM call.
 *
 * Multimodal: we pass the creative image (when fetchable) plus the copy so
 * the model can judge a Shopping/Display banner that has no descriptive
 * text. Same fetchability guards as `analyzeVisuals` (Google ships JS
 * preview wrappers and Meta render-ad endpoints that vision models hang
 * on — never send those).
 *
 * Output is the marker format (`@@adN@@ verdict | reason`), not JSON, for
 * the same reason the rest of the AI surface uses it: reasons contain
 * quotes/newlines that break `JSON.parse`. See `lib/ai/marker-format`.
 *
 * Conservative: the model is instructed to flag off-brand ONLY when
 * confident; anything ambiguous stays "relevant" so we never badge a
 * legitimate creative. Unparseable verdicts default to relevant=true.
 */

import { getOpenRouterCredentials } from "@/lib/billing/credentials";
import { logger } from "@/lib/logger";
import { parseMarkerSections } from "@/lib/ai/marker-format";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Gemini 2.5 Flash — multimodal, cheap, already the Creative Director
// model on the pragmatic tier. A handful of small images + short copy is
// a few thousand tokens → ~$0.002 per run. Flat 1 credit.
const RELEVANCE_MODEL = "google/gemini-2.5-flash";

export interface RelevanceAdInput {
  ad_archive_id: string;
  headline: string | null;
  ad_text: string | null;
  image_url: string | null;
  /** Lowercased format from the source row (text/image/video/shopping). */
  format?: string | null;
}

export interface RelevanceVerdict {
  ad_archive_id: string;
  relevant: boolean;
  reason: string;
}

/** True when the image URL is something a vision model can actually
 *  consume — mirrors the filter in analyzeVisuals so we never send a
 *  JS preview wrapper or render-ad endpoint that makes Gemini hang. */
function isFetchableImage(url: string | null | undefined): url is string {
  if (!url || !url.startsWith("http")) return false;
  if (url.includes("/render_ad/")) return false;
  if (/\.js(\?|$)/.test(url)) return false;
  if (url.includes("/ads/preview/")) return false;
  return true;
}

/**
 * Run the relevance check for ONE brand's displayed creatives. Returns a
 * verdict per input ad (always covering every input id), or null on a
 * hard failure (no credentials / network / empty model output) so the
 * caller can decide whether to refund.
 */
export async function checkAdRelevance(
  brandName: string,
  ads: RelevanceAdInput[],
  locale: "it" | "en" = "it",
  workspaceId?: string,
): Promise<RelevanceVerdict[] | null> {
  if (ads.length === 0) return [];

  let apiKey: string;
  try {
    const creds = await getOpenRouterCredentials(workspaceId);
    apiKey = creds.token;
  } catch (e) {
    logger.error(
      "checkAdRelevance credentials error",
      { channel: "ai-relevance", event: "credentials.failed", workspaceId },
      e,
    );
    return null;
  }

  // Build the per-ad text block + collect fetchable images. Sections are
  // keyed ad1..adN (parseMarkerSections only accepts \w+ keys, so we
  // can't use the raw archive id which may contain non-word chars).
  const sectionKeys = ads.map((_, i) => `ad${i + 1}`);
  const adLines = ads
    .map((ad, i) => {
      const parts: string[] = [`${sectionKeys[i]}:`];
      if (ad.headline) parts.push(`headline="${ad.headline}"`);
      if (ad.ad_text) parts.push(`body="${ad.ad_text.slice(0, 300)}"`);
      if (ad.format) parts.push(`format=${ad.format}`);
      const hasImg = isFetchableImage(ad.image_url);
      parts.push(hasImg ? "(image attached below)" : "(no image)");
      return parts.join(" ");
    })
    .join("\n");

  const imageEntries = ads
    .map((ad, i) => ({ key: sectionKeys[i], url: ad.image_url }))
    .filter((e) => isFetchableImage(e.url)) as { key: string; url: string }[];

  const langLine =
    locale === "it"
      ? "Scrivi ogni motivazione in italiano."
      : "Write each reason in English.";

  const prompt = `You are a brand-consistency auditor for digital advertising. You know the major retail/fashion brands and their product universes.

BRAND UNDER REVIEW: "${brandName}"

For EACH creative below, decide whether it plausibly belongs to this brand's own advertising — i.e. it shows the brand's products, world, or message — or whether it looks OFF-BRAND / misattributed (an unrelated product or category that does not fit this brand, a scraping mix-up, a reseller/marketplace listing, etc.).

Be CONSERVATIVE: only mark a creative as off-brand when you are clearly confident it does not fit the brand. Brands legitimately advertise many product categories (a fashion brand may run shoes, bags, accessories) — do NOT flag those. When in doubt, mark it relevant.

CREATIVES:
${adLines}

${langLine}

For each creative output exactly one section, in this marker format and nothing else:
@@adN@@
<verdict> | <one short sentence reason>

where <verdict> is the single word "relevant" or "offbrand". Example:
@@ad1@@
relevant | Mostra capi della collezione donna del brand.
@@ad2@@
offbrand | È una sneaker sportiva non riconducibile a questo brand di moda femminile.

Output one section per creative (${sectionKeys.join(", ")}). No preamble, no closing remarks.`;

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: prompt }];
  for (const e of imageEntries) {
    content.push({ type: "text", text: `Image for ${e.key}:` });
    content.push({ type: "image_url", image_url: { url: e.url } });
  }

  // Defensive timeout — vision models can hang on a bad image despite the
  // URL guards above. 60s is plenty for a handful of small creatives.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let raw: string;
  try {
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
        model: RELEVANCE_MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("checkAdRelevance non-OK response", {
        channel: "ai-relevance",
        event: "openrouter.error",
        workspaceId,
        status: res.status,
        body: errText.slice(0, 500),
      });
      return null;
    }
    const data = await res.json();
    raw = data?.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    logger.error(
      "checkAdRelevance fetch failed",
      { channel: "ai-relevance", event: "fetch.failed", workspaceId },
      e,
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!raw.trim()) return null;

  const parsed = parseMarkerSections(raw, sectionKeys);
  // Map every input ad to a verdict. Missing/garbled sections default to
  // relevant=true so we never badge a creative the model didn't clearly
  // condemn.
  return ads.map((ad, i) => {
    const body = parsed[sectionKeys[i]];
    if (!body) {
      return { ad_archive_id: ad.ad_archive_id, relevant: true, reason: "" };
    }
    const [verdictRaw, ...rest] = body.split("|");
    const verdict = verdictRaw.trim().toLowerCase();
    const reason = rest.join("|").trim();
    const relevant = !verdict.startsWith("offbrand");
    return { ad_archive_id: ad.ad_archive_id, relevant, reason };
  });
}
