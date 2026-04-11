import { buildAdLibraryUrl } from "@/lib/meta/url";

/**
 * Service layer for the Apify Meta Ads Scraper actor.
 * Uses the Apify REST API directly (no apify-client SDK) to avoid
 * native dependency issues on Vercel serverless.
 *
 * API docs: https://docs.apify.com/api/v2
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = process.env.APIFY_ACTOR_ID || "leadsbrary/meta-ads-library-scraper";

function getToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error("APIFY_API_TOKEN missing.");
  }
  return token;
}

async function apifyFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const url = `${APIFY_BASE}${path}`;
  const res = await fetch(url, {
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

export interface NormalizedAd {
  ad_archive_id: string;
  ad_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  image_url: string | null;
  video_url: string | null;
  landing_url: string | null;
  platforms: string[];
  languages: string[];
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  raw_data: Record<string, unknown>;
}

export interface ScrapeResult {
  runId: string;
  records: NormalizedAd[];
  costCu: number;
}

export interface ScrapeOptions {
  pageId?: string;
  pageUrl?: string;
  country?: string;
  maxItems?: number;
  active?: boolean;
}

/** Run the configured actor and normalize results. */
export async function scrapeMetaAds(
  opts: ScrapeOptions
): Promise<ScrapeResult> {
  const startUrl =
    opts.pageUrl?.includes("ads/library")
      ? opts.pageUrl
      : buildAdLibraryUrl({
          pageId: opts.pageId,
          country: opts.country,
          active: opts.active,
        });

  const input = {
    startUrls: [{ url: startUrl }],
    urls: [startUrl],
    maxItems: opts.maxItems ?? 200,
    countryCode: opts.country ?? "ALL",
    activeStatus: opts.active === false ? "all" : "active",
  };

  // Start the actor run (synchronous — waits for completion)
  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  });

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Poll until the run finishes (max ~5 min)
  let status = run.data?.status ?? run.status ?? "RUNNING";
  const startTime = Date.now();
  const maxWait = 5 * 60 * 1000;

  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - startTime < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    status = runInfo.data?.status ?? runInfo.status ?? status;
  }

  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ended with status: ${status}`);
  }

  // Fetch dataset items
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=1000`
  );
  const items: RawAd[] = Array.isArray(dataset) ? dataset : dataset.items ?? [];

  const records = items
    .map(normalize)
    .filter((a): a is NormalizedAd => !!a.ad_archive_id);

  // Best-effort cost lookup
  let costCu = 0;
  try {
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    costCu = runInfo.data?.usageTotalUsd ?? 0;
  } catch {
    /* ignore */
  }

  return { runId, records, costCu };
}

interface RawAd {
  adArchiveID?: string;
  ad_archive_id?: string;
  adId?: string;
  adText?: string;
  body?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  cta_text?: string;
  originalImageUrl?: string;
  imageUrl?: string;
  videoHdUrl?: string;
  videoSdUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  landingPage?: string;
  publisherPlatforms?: string[];
  platforms?: string[];
  languages?: string[];
  startDate?: string | number;
  startDateString?: string;
  endDate?: string | number;
  endDateString?: string;
  adStatus?: string;
  isActive?: boolean;
  [k: string]: unknown;
}

function toIso(v: string | number | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(ad: RawAd): NormalizedAd {
  return {
    ad_archive_id: String(ad.adArchiveID ?? ad.ad_archive_id ?? ad.adId ?? ""),
    ad_text: ad.adText ?? ad.body ?? null,
    headline: ad.headline ?? null,
    description: ad.description ?? null,
    cta: ad.callToAction ?? ad.cta_text ?? null,
    image_url: ad.originalImageUrl ?? ad.imageUrl ?? null,
    video_url: ad.videoHdUrl ?? ad.videoSdUrl ?? ad.videoUrl ?? null,
    landing_url: ad.linkUrl ?? ad.landingPage ?? null,
    platforms: ad.publisherPlatforms ?? ad.platforms ?? [],
    languages: ad.languages ?? [],
    start_date: toIso(ad.startDate ?? ad.startDateString),
    end_date: toIso(ad.endDate ?? ad.endDateString),
    status:
      ad.adStatus ??
      (typeof ad.isActive === "boolean"
        ? ad.isActive
          ? "ACTIVE"
          : "INACTIVE"
        : null),
    raw_data: ad as Record<string, unknown>,
  };
}
