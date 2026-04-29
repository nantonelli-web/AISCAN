/**
 * Cross-surface metric helpers shared by Benchmarks, Compare, and the
 * Report pipeline. The previous setup had three independently-evolved
 * implementations of the same concepts (duration, CTA aggregation,
 * format classification) and they slowly drifted into producing
 * different numbers for the same brand under the same date range.
 *
 * Single source of truth, used by every surface that ranks or
 * counts ads. Touch carefully — every metric on the platform reads
 * from these.
 */

export type AdFormatBucket = "image" | "video" | "carousel" | "dpa" | "unknown";

/** Minimum input shape needed to classify an ad's format. */
export interface AdLike {
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  image_url: string | null;
  video_url: string | null;
  raw_data: Record<string, unknown> | null;
}

/**
 * Normalise a CTA label so casing and separators do not split the
 * histogram (so "Shop Now" / "SHOP_NOW" / "shop now" all collapse to
 * "Shop Now"). Trims, replaces underscores/hyphens with spaces,
 * collapses whitespace, then title-cases each word.
 */
export function normalizeCtaLabel(raw: string): string {
  const cleaned = raw.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Classify an ad into one of five buckets, mirroring the Benchmarks
 * logic so every surface lays the format mix out the same way.
 *
 * Decision tree (priority matters):
 *   1. snapshot.displayFormat = "DPA"               → "dpa"
 *   2. snapshot.displayFormat ∈ CAROUSEL_*          → "carousel"
 *   3. snapshot.displayFormat ∈ VIDEO_*             → "video"
 *   4. snapshot.displayFormat ∈ IMAGE_*             → "image"
 *   5. snapshot.displayFormat = "DCO" (delivery
 *      mode, not a carousel) → fall back to the
 *      primary creative resolved on the ad row    → image / video / unknown
 *   6. No displayFormat at all (older payloads):
 *        cards.length > 1                          → "carousel"
 *        videos.length > 0 OR ad.video_url         → "video"
 *        ad.image_url                              → "image"
 *        else                                      → "unknown"
 *
 * The DCO case is the most error-prone — it is a delivery mode where
 * snapshot.cards is a POOL of creative variants, NOT carousel slides.
 * Older code lumped every "cards.length > 1" into carousel and
 * misclassified DCO as carousel. We rely on `ad.video_url` /
 * `ad.image_url` because the scrape normalizer already resolved the
 * primary variant.
 */
export function classifyAdFormat(ad: AdLike): AdFormatBucket {
  const snapshot = (ad.raw_data?.snapshot ?? null) as Record<string, unknown> | null;
  const rawFormat = (snapshot?.displayFormat as string | undefined)?.toUpperCase() ?? null;
  const cards = Array.isArray(snapshot?.cards) ? (snapshot?.cards as unknown[]) : null;
  const videos = Array.isArray(snapshot?.videos) ? (snapshot?.videos as unknown[]) : null;

  // Google Ads Transparency: the actor reports `adFormat` as a flat
  // "Text"/"Image"/"Video" on the row root (not under snapshot, which is
  // a Meta-only concept). Read it BEFORE the Meta switch so the chart
  // shows the real Image/Video split — without this every Google ad
  // fell through to the image_url heuristic and got bucketed as "image",
  // erasing video on YouTube/Display from the format mix.
  const googleFormat =
    (ad.raw_data?.adFormat as string | undefined)?.toUpperCase() ?? null;
  if (googleFormat === "VIDEO") return "video";
  if (googleFormat === "IMAGE") return "image";
  // Text-only Google ads (Search) carry no media — bucket as "unknown"
  // so they show up in the "Other" slice rather than inflating image.
  if (googleFormat === "TEXT") return "unknown";

  switch (rawFormat) {
    case "DPA":
      return "dpa";
    case "CAROUSEL":
    case "CAROUSEL_IMAGE":
    case "CAROUSEL_VIDEO":
    case "MULTIPLE_IMAGES":
      return "carousel";
    case "VIDEO":
    case "SINGLE_VIDEO":
      return "video";
    case "IMAGE":
    case "SINGLE_IMAGE":
      return "image";
    case "DCO": {
      if (ad.video_url) return "video";
      if (ad.image_url) return "image";
      return "unknown";
    }
    case null:
    default: {
      const cardsLen = cards?.length ?? 0;
      const videosLen = videos?.length ?? 0;
      if (cardsLen > 1) return "carousel";
      if (videosLen > 0 || ad.video_url) return "video";
      if (ad.image_url) return "image";
      return "unknown";
    }
  }
}

/**
 * Days the ad has been running. ACTIVE ads with an `end_date` set to
 * the snapshot date (Meta Ad Library convention) are treated as
 * "still running today" so a long-running campaign is not
 * undercounted. Sub-day campaigns are clamped to 1 — previous code
 * dropped them entirely, which made average duration disagree
 * between Benchmarks (clamped) and Compare/Report (excluded).
 *
 * Returns null when the ad is missing a usable start_date.
 */
export function computeAdDurationDays(ad: AdLike, now: number = Date.now()): number | null {
  if (!ad.start_date) return null;
  const start = new Date(ad.start_date).getTime();
  if (!Number.isFinite(start)) return null;
  const end =
    ad.status === "ACTIVE" || !ad.end_date
      ? now
      : new Date(ad.end_date).getTime();
  if (!Number.isFinite(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}
