/**
 * Service layer for Google Ads Transparency scraping on Apify.
 *
 * Two actors supported, dispatched by APIFY_GOOGLE_ACTOR_ID:
 *
 * 1. `automation-lab/google-ads-scraper` (legacy default)
 *    - Pay-per-ad (~$0.001 each), HTTP-only.
 *    - Returns: advertiserId, creativeId, adFormat, firstShown,
 *      lastShown, previewUrl, imageUrl. NO copy / headline / CTA /
 *      video URL — the source of the "Top CTA empty" + "Avg copy
 *      length 0" + "video tile blank" gaps.
 *
 * 2. `memo23/google-ad-transparency-scraper-cheerio` (new, opt-in)
 *    - $19/mo subscription + usage. HTTP-only.
 *    - Returns the same identifiers PLUS variations[] with
 *      headline/title, description/body, callToAction, video URL,
 *      adImage. Resolves the gaps above without touching downstream
 *      consumers — we map both shapes onto the same NormalizedAd.
 *
 * Switching: set APIFY_GOOGLE_ACTOR_ID env var on Vercel to the new
 * actor id and subscribe on Apify. New scans use the new actor; old
 * rows in the DB stay as-is until re-scanned.
 */

import type { NormalizedAd, ScrapeResult } from "./service";

const APIFY_BASE = "https://api.apify.com/v2";
const GOOGLE_ACTOR_ID =
  process.env.APIFY_GOOGLE_ACTOR_ID ||
  "automation-lab/google-ads-scraper";
const isMemoActor = GOOGLE_ACTOR_ID.startsWith("memo23/");

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN missing.");
  return token;
}

async function apifyFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${APIFY_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ─── Raw shape from automation-lab/google-ads-scraper ───

interface RawGoogleAd {
  advertiserId?: string;
  advertiserName?: string;
  isVerified?: boolean;
  creativeId?: string;
  adFormat?: string; // Text | Image | Video
  firstShown?: string; // YYYY-MM-DD
  lastShown?: string; // YYYY-MM-DD
  previewUrl?: string | null;
  imageUrl?: string | null;
  region?: string;
  [k: string]: unknown;
}

// ─── Raw shape from memo23/google-ad-transparency-scraper-cheerio ───
//
// Field names confirmed from the actor's public docs; the inner
// `variations` array carries the per-variant media + copy. The exact
// child field names inside a variation aren't fully spec'd publicly,
// so the normaliser tries multiple paths and logs the first record's
// keys on the first run so we can refine after seeing a real sample.

interface MemoGoogleAdVariation {
  // Image variants
  adImage?: string;
  imageUrl?: string;
  title?: string;
  description?: string;
  // Video variants
  video?: string;
  videoUrl?: string;
  thumbnail?: string;
  // Text variants
  headline?: string;
  archiveImage?: string;
  body?: string;
  // CTA — may live on the variant or at root (we try both)
  callToAction?: string;
  cta?: string;
  // Landing page
  destinationUrl?: string;
  clickUrl?: string;
  [k: string]: unknown;
}

interface MemoRawGoogleAd {
  advertiserId?: string;
  advertiserName?: string;
  advertiserDomain?: string;
  creativeId?: string;
  adUrl?: string;
  format?: string; // Video | Image | Text (capitalised in docs)
  firstShown?: string;
  lastShown?: string;
  creativeRegions?: string[];
  regionStats?: unknown[];
  variations?: MemoGoogleAdVariation[];
  // Some shapes hoist top-level CTA / URLs
  callToAction?: string;
  destinationUrl?: string;
  scraped_at?: string;
  source_url?: string;
  [k: string]: unknown;
}

// ─── Options ───

export interface GoogleScrapeOptions {
  advertiserDomain?: string;
  advertiserName?: string;
  advertiserId?: string;
  /** Filter results by date range (applied client-side after fetch). */
  dateFrom?: string;
  dateTo?: string;
  maxResults?: number;
}

/**
 * Strip protocol, www., trailing slash/path/query from a domain input.
 * "https://axelarigato.com/" → "axelarigato.com"
 * "http://www.example.com/about?x=1" → "example.com"
 * Returns null if nothing domain-shaped can be recovered.
 */
export function cleanAdvertiserDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(/^www\./i, "");
  v = v.replace(/[/?#].*$/, "");
  if (!v || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v)) return null;
  return v;
}

// ─── Normalize: memo23 ───

/**
 * Convert a memo23 row into the shared NormalizedAd shape.
 *
 * Defensive on field names: the public docs don't fully spec the
 * inner `variations[]` schema, so we try multiple plausible field
 * paths and fall back gracefully. The first dataset run logs
 * Object.keys(items[0]) and Object.keys(items[0].variations[0])
 * (when present) so we can tighten this once we have a real sample.
 */
function normalizeMemo(ad: MemoRawGoogleAd): NormalizedAd {
  const adId = ad.creativeId ?? "";
  const variant = ad.variations?.[0] ?? {};

  // Same active heuristic as automation-lab — lastShown is a polling
  // observation, not a hard end.
  const todayMs = Date.now();
  const lastShownMs = ad.lastShown ? new Date(ad.lastShown).getTime() : Number.NaN;
  const ageDays = Number.isFinite(lastShownMs)
    ? (todayMs - lastShownMs) / 86_400_000
    : Number.POSITIVE_INFINITY;
  const isLikelyActive = ad.lastShown == null || ageDays <= 1;
  const status = isLikelyActive ? "ACTIVE" : "INACTIVE";

  // Format → platforms hint (same buckets as automation-lab)
  const fmt = (ad.format ?? "").toLowerCase();
  const platforms: string[] = [];
  if (fmt.includes("video")) platforms.push("youtube");
  if (fmt.includes("text")) platforms.push("google_search");
  if (fmt.includes("image")) platforms.push("display");

  // Media — branch by format. Prefer the variant's video when
  // available; fall back to thumbnail as a static preview.
  let imageUrl: string | null = null;
  let videoUrl: string | null = null;
  if (fmt === "video") {
    videoUrl = variant.video ?? variant.videoUrl ?? null;
    imageUrl = variant.thumbnail ?? null;
  } else if (fmt === "image") {
    imageUrl = variant.adImage ?? variant.imageUrl ?? variant.thumbnail ?? null;
  } else if (fmt === "text") {
    // Search/Text ads sometimes ship a rendered screenshot — keep it
    // when present so the Compare tile has something to show.
    imageUrl = variant.archiveImage ?? variant.adImage ?? null;
  }

  const headline = variant.headline ?? variant.title ?? null;
  const description = variant.description ?? variant.body ?? null;
  const cta = variant.callToAction ?? variant.cta ?? ad.callToAction ?? null;
  const landingUrl = variant.destinationUrl ?? variant.clickUrl ?? ad.destinationUrl ?? null;

  return {
    ad_archive_id: adId,
    // Memo returns headline/description on Text + Image ads. Use
    // description as the body field (mait_ads_external.ad_text)
    // because it matches the Meta `ad_text` semantics used by Avg
    // copy length and AI Copy analysis.
    ad_text: description,
    headline,
    description,
    cta,
    image_url: imageUrl,
    video_url: videoUrl,
    landing_url: landingUrl,
    platforms: platforms.length > 0 ? platforms : ["google"],
    languages: [],
    start_date: ad.firstShown ? new Date(ad.firstShown).toISOString() : null,
    end_date: isLikelyActive ? null : new Date(ad.lastShown!).toISOString(),
    status,
    // Persist the original row so classifyAdFormat / future
    // back-fills can still inspect every field memo23 returns.
    raw_data: ad as unknown as Record<string, unknown>,
    scan_countries: null,
  };
}

// ─── Normalize: automation-lab (legacy) ───

function normalize(ad: RawGoogleAd): NormalizedAd {
  const adId = ad.creativeId ?? "";

  // ⚠ Same family as the Meta isActive bug. The Apify Google actor
  // sets `lastShown = today's scan day` for ads that are STILL
  // running (it polls and reports the most recent observation).
  // Trusting that field as a hard end_date marks every fresh ad
  // as "ended today" with status=INACTIVE, which then makes
  // computeAdDurationDays clamp duration to 1 day for ads scanned
  // for the first time (firstShown == lastShown).
  //
  // Heuristic: treat anything with `lastShown >= today - 1 day` as
  // still running. Strict equality (`lastShown == today`) was too
  // tight and produced bursts of false-INACTIVE rows whenever
  // Google's transparency-library refresh lagged a day behind our
  // scrape — verified on a Marina Rinaldi sample where ~40% of the
  // "INACTIVE" rows had `lastShown = scrape_day - 1` (a polling
  // artifact, not a real end). Real ends keep their lastShown date.
  const todayMs = Date.now();
  const lastShownMs = ad.lastShown
    ? new Date(ad.lastShown).getTime()
    : Number.NaN;
  const ageDays = Number.isFinite(lastShownMs)
    ? (todayMs - lastShownMs) / 86_400_000
    : Number.POSITIVE_INFINITY;
  const isLikelyActive = ad.lastShown == null || ageDays <= 1;
  const status = isLikelyActive ? "ACTIVE" : "INACTIVE";

  // Map adFormat to platforms hint
  const format = (ad.adFormat ?? "").toLowerCase();
  const platforms: string[] = [];
  if (format.includes("video")) platforms.push("youtube");
  if (format.includes("text")) platforms.push("google_search");
  if (format.includes("image")) platforms.push("display");

  return {
    ad_archive_id: adId,
    ad_text: null,
    headline: null,
    description: null,
    cta: null,
    image_url: ad.imageUrl ?? ad.previewUrl ?? null,
    video_url: null,
    landing_url: null,
    platforms: platforms.length > 0 ? platforms : ["google"],
    languages: [],
    start_date: ad.firstShown
      ? new Date(ad.firstShown).toISOString()
      : null,
    end_date: isLikelyActive
      ? null
      : new Date(ad.lastShown!).toISOString(),
    status,
    raw_data: ad as unknown as Record<string, unknown>,
    // Google ads are not scraped per-country — scan_countries stays null
    // and the Benchmarks country filter does not apply to them.
    scan_countries: null,
  };
}

// ─── Main scrape function ───

export async function scrapeGoogleAds(
  opts: GoogleScrapeOptions
): Promise<ScrapeResult> {
  const maxAds = opts.maxResults ?? 200;
  const t0 = Date.now();

  // Build actor input. The two actors expect very different shapes:
  //  - automation-lab: { advertiserIds | domains | searchTerms, maxAds }
  //  - memo23:         { startUrls: [<Transparency Center URL>], maxItems }
  // We dispatch on isMemoActor so the rest of the pipeline (poll, fetch,
  // normalize, return) is shared.
  const input: Record<string, unknown> = isMemoActor
    ? { maxItems: maxAds }
    : { maxAds };

  if (isMemoActor) {
    // memo23 takes a Google Transparency Center URL as input.
    // Region "anywhere" matches the public default in Google's UI.
    const baseUrl = "https://adstransparency.google.com";
    let startUrl: string;
    if (opts.advertiserId) {
      startUrl = `${baseUrl}/advertiser/${encodeURIComponent(opts.advertiserId)}?region=anywhere`;
    } else if (opts.advertiserDomain) {
      const cleaned = cleanAdvertiserDomain(opts.advertiserDomain);
      if (!cleaned) {
        throw new Error(
          `Dominio Google Ads non valido: "${opts.advertiserDomain}". Usa solo il dominio (es. axelarigato.com).`,
        );
      }
      startUrl = `${baseUrl}/?region=anywhere&domain=${encodeURIComponent(cleaned)}`;
    } else if (opts.advertiserName) {
      // The Transparency search uses ?advertiser= for the advertiser
      // name lookup; if memo23 doesn't honour that, the run will
      // surface zero results and we should switch to advertiserId
      // / advertiserDomain. Logged below so we catch this in dev.
      startUrl = `${baseUrl}/?region=anywhere&advertiser=${encodeURIComponent(opts.advertiserName)}`;
    } else {
      throw new Error(
        "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName",
      );
    }
    input.startUrls = [startUrl];
  } else if (opts.advertiserId) {
    input.advertiserIds = [opts.advertiserId];
  } else if (opts.advertiserDomain) {
    const cleaned = cleanAdvertiserDomain(opts.advertiserDomain);
    if (!cleaned) {
      throw new Error(
        `Dominio Google Ads non valido: "${opts.advertiserDomain}". Usa solo il dominio (es. axelarigato.com).`
      );
    }
    input.domains = [cleaned];
  } else if (opts.advertiserName) {
    input.searchTerms = [opts.advertiserName];
  } else {
    throw new Error(
      "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName"
    );
  }

  console.log(
    `[Google Ads] Starting: actor=${GOOGLE_ACTOR_ID} (mode=${isMemoActor ? "memo23" : "automation-lab"})`,
  );
  console.log(`[Google Ads] Input:`, JSON.stringify(input));

  const actorPath = `/acts/${encodeURIComponent(GOOGLE_ACTOR_ID)}/runs`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  });

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[Google Ads] Run created: runId=${runId} datasetId=${datasetId}`);

  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Poll until the run finishes (max 3 min)
  let status = run.data?.status ?? run.status ?? "RUNNING";
  let pollCount = 0;
  const maxWait = 3 * 60 * 1000;

  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - t0 < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    pollCount++;
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    console.log(`[Google Ads] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
  }

  if (status !== "SUCCEEDED") {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.error(`[Google Ads] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s`);
    throw new Error(`Apify run ended with status: ${status}`);
  }

  // Fetch dataset
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=1000`
  );
  const items: Array<RawGoogleAd | MemoRawGoogleAd> = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  if (items.length === 0) {
    console.warn(`[Google Ads] Dataset empty after SUCCEEDED run`);
  } else {
    // First-run debugging: log the keys of the first item (and the
    // first variant when memo23 is in play) so we can spot a real
    // schema and tighten the normaliser without guessing.
    console.log(`[Google Ads] ${items.length} raw items. Sample keys:`, Object.keys(items[0]));
    if (isMemoActor) {
      const first = items[0] as MemoRawGoogleAd;
      const variant = first.variations?.[0];
      if (variant) {
        console.log(
          `[Google Ads] Sample variation keys:`,
          Object.keys(variant),
        );
      } else {
        console.warn(
          `[Google Ads] First memo23 item has NO variations array — schema may differ; check raw JSON.`,
        );
      }
    }
  }

  let records = items
    .map((it) =>
      isMemoActor
        ? normalizeMemo(it as MemoRawGoogleAd)
        : normalize(it as RawGoogleAd),
    )
    .filter((a): a is NormalizedAd => !!a.ad_archive_id);

  const beforeFilter = records.length;

  // Client-side date filter
  if (opts.dateFrom || opts.dateTo) {
    const from = opts.dateFrom ? new Date(opts.dateFrom).getTime() : 0;
    const to = opts.dateTo ? new Date(opts.dateTo).getTime() + 86_400_000 : Infinity;
    records = records.filter((r) => {
      const start = r.start_date ? new Date(r.start_date).getTime() : 0;
      return start >= from && start <= to;
    });
    console.log(`[Google Ads] Date filter: ${beforeFilter} → ${records.length}`);
  }

  let costCu = 0;
  try {
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    costCu = runInfo.data?.usageTotalUsd ?? 0;
  } catch {
    /* ignore */
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`[Google Ads] Done: ${items.length} raw → ${records.length} final in ${elapsed}s, cost $${costCu.toFixed(3)}`);

  const startUrl = `https://adstransparency.google.com/?domain=${opts.advertiserDomain ?? opts.advertiserName ?? opts.advertiserId}`;
  return {
    runId,
    records,
    costCu,
    startUrl,
    // Google Ads is not scraped per-country, so callers must NOT use
    // this list to drive a status reconcile. Empty by design.
    scannedCountries: [],
    debug: {
      actorId: GOOGLE_ACTOR_ID,
      input,
      runId,
      datasetId,
      pollCount,
      finalStatus: status,
      rawItemCount: items.length,
      normalizedCount: records.length,
      elapsedMs: Date.now() - t0,
    },
  };
}
