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
  /** Comma-separated ISO-2 country codes (e.g. "GB,IT,FR,DE,ES").
   *  Same format the Meta scraper accepts on `competitor.country`.
   *  Honoured ONLY by the memo23 actor — its Transparency-Center URL
   *  takes one `region=XX` per call so we expand to N startUrls.
   *  The legacy automation-lab actor has no region knob and ignores
   *  this; its API returns ALL regions regardless. Empty / undefined
   *  falls back to the global "anywhere" sweep on memo23 (legacy
   *  behaviour, expensive — pass real countries to keep cost sane). */
  country?: string;
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
function normalizeMemo(
  ad: MemoRawGoogleAd,
  /** Fallback regions to seed `scan_countries` when memo23 doesn't
   *  return `creativeRegions`. Caller passes the regions it asked
   *  the actor to crawl (e.g. ["GB","IT","FR"]) so each row carries
   *  the country it was discovered in — same semantics as Meta's
   *  scan_countries field, which the Benchmarks country filter
   *  joins against. */
  fallbackRegions: string[] = [],
): NormalizedAd {
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
    // Mirror Meta semantics: each row knows which country the actor
    // observed it in. memo23 returns `creativeRegions[]` when the
    // ad served in multiple regions; otherwise we use the regions
    // that drove the scrape (one startUrl per region → fallbackRegions).
    scan_countries: (ad.creativeRegions && ad.creativeRegions.length > 0
      ? ad.creativeRegions.map((r) => r.toUpperCase())
      : fallbackRegions.length > 0
        ? fallbackRegions.map((r) => r.toUpperCase())
        : null),
  };
}

/**
 * Dedupe memo23 records by creativeId. Multi-region scans return
 * one row per (creative × region), which would (a) blow up the DB
 * row count, and (b) collapse to the LAST occurrence on upsert
 * because the unique key is (workspace_id, ad_archive_id, source).
 * We merge `scan_countries` across all duplicates so each surviving
 * row knows every region it was observed in — matches the Meta
 * scrape semantics in service.ts.
 */
function dedupeMemoNormalized(records: NormalizedAd[]): NormalizedAd[] {
  const byId = new Map<string, NormalizedAd>();
  for (const r of records) {
    if (!r.ad_archive_id) continue;
    const existing = byId.get(r.ad_archive_id);
    if (!existing) {
      byId.set(r.ad_archive_id, r);
      continue;
    }
    const merged = new Set<string>(existing.scan_countries ?? []);
    for (const c of r.scan_countries ?? []) merged.add(c);
    existing.scan_countries = merged.size > 0 ? [...merged] : null;
    // Prefer the variant that actually carries media — the first row
    // we hit might be from a region where the creative didn't render
    // (no imageUrl), but a later region might have it.
    if (!existing.image_url && r.image_url) existing.image_url = r.image_url;
    if (!existing.video_url && r.video_url) existing.video_url = r.video_url;
    if (!existing.headline && r.headline) existing.headline = r.headline;
    if (!existing.ad_text && r.ad_text) existing.ad_text = r.ad_text;
    if (!existing.cta && r.cta) existing.cta = r.cta;
  }
  return [...byId.values()];
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

  // Compute memo region list FIRST so we can size maxItems per
  // region. The list also seeds scan_countries during normalisation
  // when memo23 doesn't return creativeRegions on a row.
  const memoRegionList: string[] = (() => {
    if (!isMemoActor) return [];
    const regions = (opts.country ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    return regions.length > 0 ? regions : ["anywhere"];
  })();

  // Build actor input. The two actors expect very different shapes:
  //  - automation-lab: { advertiserIds | domains | searchTerms, maxAds }
  //  - memo23:         { startUrls: [<Transparency URL>], maxItems }
  // We dispatch on isMemoActor so the rest of the pipeline (poll,
  // fetch, normalize, return) is shared.
  //
  // memo23's `maxItems` is enforced PER-CRAWL (per startUrl), not
  // globally — confirmed by the actor's docs. To respect the
  // caller's `maxResults` total budget, divide it by the region
  // count and floor at 50 per region so a 5-country scan gets
  // 50-100 items each (≈ 250-500 total) instead of 500 each
  // (≈ 2500 total = runaway cost).
  const memoMaxPerRegion = Math.max(
    50,
    Math.floor(maxAds / Math.max(1, memoRegionList.length)),
  );
  const input: Record<string, unknown> = isMemoActor
    ? { maxItems: memoMaxPerRegion }
    : { maxAds };

  if (isMemoActor) {
    // memo23 takes Google Transparency Center URLs as input. Each
    // URL is scoped to ONE region — passing region=anywhere triggers
    // a global page-by-page crawl (~870 pages on Karen Millen,
    // 5+ minutes wall time, $1+ usage). When the caller supplies a
    // country list (the workspace's GB/IT/FR/DE/ES set), we expand
    // to one URL per region, which the actor crawls in parallel and
    // bounds total work to the brand's actual targeting.
    const baseUrl = "https://adstransparency.google.com";
    const regionList = memoRegionList;

    function urlForRegion(region: string): string {
      if (opts.advertiserId) {
        return `${baseUrl}/advertiser/${encodeURIComponent(opts.advertiserId)}?region=${encodeURIComponent(region)}`;
      }
      if (opts.advertiserDomain) {
        const cleaned = cleanAdvertiserDomain(opts.advertiserDomain);
        if (!cleaned) {
          throw new Error(
            `Dominio Google Ads non valido: "${opts.advertiserDomain}". Usa solo il dominio (es. axelarigato.com).`,
          );
        }
        return `${baseUrl}/?region=${encodeURIComponent(region)}&domain=${encodeURIComponent(cleaned)}`;
      }
      if (opts.advertiserName) {
        // The Transparency search uses ?advertiser= for the
        // advertiser name lookup; if memo23 doesn't honour that, the
        // run will surface zero results and we should switch to
        // advertiserId / advertiserDomain.
        return `${baseUrl}/?region=${encodeURIComponent(region)}&advertiser=${encodeURIComponent(opts.advertiserName)}`;
      }
      throw new Error(
        "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName",
      );
    }

    input.startUrls = regionList.map(urlForRegion);
    console.log(
      `[Google Ads] memo23 startUrls (${regionList.length} regions):`,
      input.startUrls,
    );
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
    // Cost containment: when our wait expires, abort the Apify run
    // so usage stops accumulating. Without this, a 5-min Vercel
    // timeout left the actor crawling for hours -- exactly what
    // the user hit on the first memo23 test ($1.17 and climbing
    // before manual abort). Best-effort: if the abort itself
    // fails we still throw the original timeout error.
    if (status === "RUNNING" || status === "READY") {
      try {
        await apifyFetch(`/actor-runs/${runId}/abort`, { method: "POST" });
        console.warn(`[Google Ads] Aborted run ${runId} on our side after ${elapsed}s`);
      } catch (abortErr) {
        console.error(
          `[Google Ads] Failed to abort run ${runId}:`,
          abortErr instanceof Error ? abortErr.message : abortErr,
        );
      }
    }
    throw new Error(`Apify run ended with status: ${status}`);
  }

  // Fetch dataset with pagination. The previous limit=1000 silently
  // dropped any record beyond the first 1k -- a real risk on
  // memo23 multi-region scans where a brand × 5 countries can
  // easily push past that. Loop until we've drained the dataset
  // or hit a hard 50k safety cap (any brand needing more than 50k
  // ad rows is signalling a bug, not a real volume).
  const items: Array<RawGoogleAd | MemoRawGoogleAd> = [];
  const pageSize = 1000;
  const safetyCap = 50_000;
  for (let offset = 0; offset < safetyCap; offset += pageSize) {
    const page = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=${pageSize}&offset=${offset}`,
    );
    const pageItems: Array<RawGoogleAd | MemoRawGoogleAd> = Array.isArray(page)
      ? page
      : page.items ?? [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    if (pageItems.length < pageSize) break;
  }

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
        ? normalizeMemo(it as MemoRawGoogleAd, memoRegionList)
        : normalize(it as RawGoogleAd),
    )
    .filter((a): a is NormalizedAd => !!a.ad_archive_id);

  // memo23 emits one row per (creative × region) on multi-region
  // scans. Without dedup the upsert collapses on the unique key
  // `(workspace_id, ad_archive_id, source)` and we keep only the
  // LAST observation, losing scan_countries from the others.
  if (isMemoActor) {
    const before = records.length;
    records = dedupeMemoNormalized(records);
    if (before !== records.length) {
      console.log(
        `[Google Ads] memo23 dedup: ${before} → ${records.length} (merged scan_countries on ${before - records.length} duplicates)`,
      );
    }
  }

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
