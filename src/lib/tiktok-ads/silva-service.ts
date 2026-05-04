/**
 * silva95gustavo/tiktok-ads-scraper — DSA Ad Library scraper.
 *
 * Coverage: TikTok Ads Library (EU + EEA + UK + Switzerland).
 * Per-brand: filtered by advertiser name + optional advertiser
 * business ID. Returns rich targeting + impressions data.
 *
 * Pricing model: FREE on Apify Store (we only pay platform usage —
 * compute time + proxies). Per-scan cost is cents, not dollars.
 *
 * Decision history: see project memory `project_tiktok_ads_actors`.
 * This is one half of the dual-actor stack — the other half
 * (beyondops, Creative Center) lives in beyondops-service.ts.
 *
 * Schema verified live on 2026-05-04 against the public actor docs:
 *   input  : { startUrls: [{ url }], skipDetails?, resultsLimit? }
 *   output : { adId, advertiserId, advertiserName, impressions{lower,upper},
 *              paidBy, regionStats[], targeting{...}, reach{lower,upper},
 *              tiktokUser{username, displayName, avatarUrl, followersCount, profileUrl},
 *              videos[{url, coverImageUrl}], startUrl }
 *
 * The actor accepts native TikTok Library URLs as input — every
 * filter (region, date window, advertiser name, business IDs) is
 * URL-encoded. We construct the URL here so the call site stays
 * domain-friendly (`{ brandName, advertiserId, dateFrom, dateTo, region }`).
 */

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "silva95gustavo/tiktok-ads-scraper";

function getToken(override?: string): string {
  if (override) return override;
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN missing.");
  return token;
}

async function apifyFetch(
  path: string,
  init?: RequestInit,
  token?: string,
) {
  const resolved = getToken(token);
  const res = await fetch(`${APIFY_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${resolved}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/* ── Public types ────────────────────────────────────────────── */

export interface TiktokAdsLibraryScrapeOptions {
  /** The competitor's TikTok advertiser display name. Used as the
   *  `adv_name` URL param. Required because the DSA library is
   *  searched by advertiser. Pass `competitor.page_name` from the
   *  caller — there is no separate TikTok display name field on
   *  the brand record yet. */
  brandName: string;
  /** Optional TikTok Business advertiser ID (numeric string).
   *  When set, locks the result to a single advertiser via
   *  `adv_biz_ids` and disambiguates same-name brands. Most
   *  workspaces leave this unset and rely on the name match. */
  advertiserId?: string | null;
  /** Optional ISO-2 region code or "all". Defaults to "all" so
   *  every EEA market the advertiser ran in shows up. */
  region?: string;
  /** Optional scan window. Both Date objects expected. When
   *  omitted, the actor returns the advertiser's full live archive
   *  (= every ad still showing in the public library). */
  dateFrom?: Date;
  dateTo?: Date;
  /** Optional cap on results per URL (the actor calls this
   *  `resultsLimit`). Defaults to 200 — enough for a typical brand
   *  scan, conservative on Apify usage. */
  maxResults?: number;
  /** Pass workspace_id from the API route so the BYO-credentials
   *  path (`getApifyCredentials`) can resolve the workspace's own
   *  Apify token when configured. */
  workspaceId?: string;
}

export interface NormalizedTiktokLibraryAd {
  ad_id: string;
  source: "library";
  advertiser_id: string | null;
  advertiser_name: string | null;
  ad_title: null;
  video_url: string | null;
  video_cover_url: string | null;
  ad_format: null;
  paid_by: string | null;
  impressions_lower: number | null;
  impressions_upper: number | null;
  reach_lower: number | null;
  reach_upper: number | null;
  region_stats: unknown;
  targeting: unknown;
  tiktok_user: unknown;
  first_shown_date: string | null;
  last_shown_date: string | null;
  days_running: number | null;
  scan_countries: string[] | null;
  raw_data: Record<string, unknown>;
}

export interface TiktokAdsLibraryScrapeResult {
  runId: string;
  ads: NormalizedTiktokLibraryAd[];
  costCu: number;
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

/* ── URL builder ────────────────────────────────────────────── */

/**
 * Build the TikTok Library search URL the actor accepts as input.
 *
 * Reference (verified 2026-05-04 against the public actor docs):
 *   https://library.tiktok.com/ads
 *     ?region=all
 *     &start_time=<unix-ms>
 *     &end_time=<unix-ms>
 *     &adv_name=<display name URL-encoded>
 *     &adv_biz_ids=<numeric advertiser id>     (optional)
 *     &query_type=2                            (1=keyword, 2=advertiser)
 *     &sort_type=last_shown_date,desc
 *
 * `query_type=2` (advertiser search) is what we always want — we're
 * looking for ads BY an advertiser, not ads matching keywords.
 */
function buildLibraryUrl(opts: {
  brandName: string;
  advertiserId?: string | null;
  region?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): string {
  const params = new URLSearchParams();
  params.set("region", opts.region ?? "all");
  if (opts.dateFrom) {
    params.set("start_time", String(opts.dateFrom.getTime()));
  }
  if (opts.dateTo) {
    params.set("end_time", String(opts.dateTo.getTime()));
  }
  params.set("adv_name", opts.brandName);
  if (opts.advertiserId) {
    params.set("adv_biz_ids", opts.advertiserId);
  }
  params.set("query_type", "2");
  params.set("sort_type", "last_shown_date,desc");
  return `https://library.tiktok.com/ads?${params.toString()}`;
}

/* ── Normalisation ──────────────────────────────────────────── */

/** Best-effort first-/last-shown date computation. The library
 *  actor doesn't expose these directly per ad — they're embedded
 *  in the `regionStats[].firstShown/lastShown` fields when present.
 *  We take the min(firstShown) / max(lastShown) across regions.
 *  Returns ISO date string (yyyy-mm-dd) or null. */
function extractWindow(regionStats: unknown): {
  firstShown: string | null;
  lastShown: string | null;
  daysRunning: number | null;
} {
  if (!Array.isArray(regionStats)) {
    return { firstShown: null, lastShown: null, daysRunning: null };
  }
  let minFirst: number | null = null;
  let maxLast: number | null = null;
  for (const r of regionStats) {
    const rec = r as Record<string, unknown>;
    const f = rec.firstShown ? new Date(rec.firstShown as string).getTime() : NaN;
    const l = rec.lastShown ? new Date(rec.lastShown as string).getTime() : NaN;
    if (!Number.isNaN(f)) minFirst = minFirst === null ? f : Math.min(minFirst, f);
    if (!Number.isNaN(l)) maxLast = maxLast === null ? l : Math.max(maxLast, l);
  }
  const firstShown = minFirst !== null ? new Date(minFirst).toISOString().slice(0, 10) : null;
  const lastShown = maxLast !== null ? new Date(maxLast).toISOString().slice(0, 10) : null;
  let daysRunning: number | null = null;
  if (minFirst !== null && maxLast !== null && maxLast >= minFirst) {
    daysRunning = Math.max(1, Math.round((maxLast - minFirst) / 86_400_000));
  }
  return { firstShown, lastShown, daysRunning };
}

interface RawSilvaItem {
  adId?: string;
  adName?: string;
  advertiserId?: string;
  advertiserName?: string;
  impressions?: { lowerBound?: number; upperBound?: number | null };
  paidBy?: string;
  regionStats?: unknown[];
  targeting?: unknown;
  reach?: { lowerBound?: number; upperBound?: number | null };
  tiktokUser?: unknown;
  videos?: { url?: string; coverImageUrl?: string }[];
  startUrl?: string;
  [k: string]: unknown;
}

function normalizeItem(item: RawSilvaItem): NormalizedTiktokLibraryAd | null {
  if (!item.adId) return null;
  const video = Array.isArray(item.videos) && item.videos.length > 0 ? item.videos[0] : null;
  const window = extractWindow(item.regionStats);
  return {
    ad_id: String(item.adId),
    source: "library",
    advertiser_id: item.advertiserId ? String(item.advertiserId) : null,
    advertiser_name: item.advertiserName ?? item.adName ?? null,
    ad_title: null,
    video_url: video?.url ?? null,
    video_cover_url: video?.coverImageUrl ?? null,
    ad_format: null,
    paid_by: item.paidBy ?? null,
    impressions_lower: typeof item.impressions?.lowerBound === "number" ? item.impressions.lowerBound : null,
    impressions_upper: typeof item.impressions?.upperBound === "number" ? item.impressions.upperBound : null,
    reach_lower: typeof item.reach?.lowerBound === "number" ? item.reach.lowerBound : null,
    reach_upper: typeof item.reach?.upperBound === "number" ? item.reach.upperBound : null,
    region_stats: item.regionStats ?? null,
    targeting: item.targeting ?? null,
    tiktok_user: item.tiktokUser ?? null,
    first_shown_date: window.firstShown,
    last_shown_date: window.lastShown,
    days_running: window.daysRunning,
    scan_countries: null,
    raw_data: item as unknown as Record<string, unknown>,
  };
}

/* ── Scrape ─────────────────────────────────────────────────── */

export async function scrapeTiktokAdsLibrary(
  opts: TiktokAdsLibraryScrapeOptions,
): Promise<TiktokAdsLibraryScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const startUrl = buildLibraryUrl({
    brandName: opts.brandName,
    advertiserId: opts.advertiserId ?? null,
    region: opts.region ?? "all",
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
  });

  const input: Record<string, unknown> = {
    startUrls: [{ url: startUrl }],
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
    skipDetails: false,
    resultsLimit: opts.maxResults ?? 200,
  };

  console.log(
    `[TikTokLib] Starting: actor=${ACTOR_ID} brand="${opts.brandName}" advId=${opts.advertiserId ?? "—"} region=${opts.region ?? "all"} max=${opts.maxResults ?? 200}`,
  );

  // Same maxTotalChargeUsd safety pattern as SERP — Apify rejects
  // pay-per-result runs whose cost ceiling falls below $0.50. silva
  // is FREE pricing (compute-only) so the cap is academic, but we
  // pass a conservative $0.50 ceiling for consistency and to guard
  // against a future pricing change.
  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxTotalChargeUsd=0.5`;
  const run = await apifyFetch(
    actorPath,
    { method: "POST", body: JSON.stringify(input) },
    token,
  );

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  if (!datasetId) {
    throw new Error("Apify TikTok library run started but no datasetId returned.");
  }

  // Poll until the actor finishes. TikTok library scans take ~30-90s
  // for a typical brand (the actor walks the library page-by-page).
  // Same 5-min cap as the other scrapers.
  let status = run.data?.status ?? run.status ?? "RUNNING";
  const startTime = Date.now();
  const maxWait = 5 * 60 * 1000;
  let pollCount = 0;
  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - startTime < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 4000));
    pollCount++;
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    if (pollCount % 5 === 0) {
      console.log(
        `[TikTokLib] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
      );
    }
  }

  if (status !== "SUCCEEDED") {
    throw new Error(
      `TikTok library actor ${status} after ${Math.round((Date.now() - startTime) / 1000)}s (brand: "${opts.brandName}")`,
    );
  }

  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&clean=true`,
    undefined,
    token,
  );
  const items: RawSilvaItem[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(`[TikTokLib] Run ${runId} returned ${items.length} ads`);

  const ads = items
    .map(normalizeItem)
    .filter((a): a is NormalizedTiktokLibraryAd => a !== null);

  // Cost is compute-based for silva (FREE pricing model on Apify).
  // We don't get a per-result number to attribute; report 0 here
  // and let the caller log Apify's actual run cost via the
  // /actor-runs/{id} response when they need accounting.
  return {
    runId,
    ads,
    costCu: 0,
    credentials: creds,
  };
}
