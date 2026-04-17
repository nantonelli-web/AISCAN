/**
 * Service layer for Google Ads Transparency scraping on Apify.
 * Actor: automation-lab/google-ads-scraper
 *
 * Uses pure HTTP (no browser), ~10-20 seconds per advertiser.
 * Pricing: ~$0.001/ad (pay-per-event)
 *
 * Input: { domains: ["example.com"], maxAds: 200 }
 * Output: { advertiserId, advertiserName, creativeId, adFormat,
 *           firstShown, lastShown, previewUrl, imageUrl, region }
 */

import type { NormalizedAd, ScrapeResult } from "./service";

const APIFY_BASE = "https://api.apify.com/v2";
const GOOGLE_ACTOR_ID =
  process.env.APIFY_GOOGLE_ACTOR_ID ||
  "automation-lab/google-ads-scraper";

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
  previewUrl?: string;
  imageUrl?: string;
  region?: string;
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

// ─── Normalize ───

function normalize(ad: RawGoogleAd): NormalizedAd {
  const adId = ad.creativeId ?? "";

  // Status: if lastShown is null/undefined → still active
  const status = ad.lastShown == null ? "ACTIVE" : "INACTIVE";

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
    image_url: ad.imageUrl ?? null,
    video_url: null,
    landing_url: null,
    platforms: platforms.length > 0 ? platforms : ["google"],
    languages: [],
    start_date: ad.firstShown
      ? new Date(ad.firstShown).toISOString()
      : null,
    end_date: ad.lastShown
      ? new Date(ad.lastShown).toISOString()
      : null,
    status,
    raw_data: ad as unknown as Record<string, unknown>,
  };
}

// ─── Main scrape function ───

export async function scrapeGoogleAds(
  opts: GoogleScrapeOptions
): Promise<ScrapeResult> {
  const maxAds = opts.maxResults ?? 200;
  const t0 = Date.now();

  // Build actor input
  const input: Record<string, unknown> = { maxAds };

  if (opts.advertiserId) {
    input.advertiserIds = [opts.advertiserId];
  } else if (opts.advertiserDomain) {
    input.domains = [opts.advertiserDomain];
  } else if (opts.advertiserName) {
    input.searchTerms = [opts.advertiserName];
  } else {
    throw new Error(
      "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName"
    );
  }

  console.log(`[Google Ads] Starting: actor=${GOOGLE_ACTOR_ID}`);
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
  const items: RawGoogleAd[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  if (items.length === 0) {
    console.warn(`[Google Ads] Dataset empty after SUCCEEDED run`);
  } else {
    console.log(`[Google Ads] ${items.length} raw items. Sample keys:`, Object.keys(items[0]));
  }

  let records = items
    .map(normalize)
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
