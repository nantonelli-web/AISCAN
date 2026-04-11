import { buildAdLibraryUrl } from "@/lib/meta/url";

/**
 * Service layer for the leadsbrary/meta-ads-library-scraper Apify actor.
 * Uses the Apify REST API directly (no SDK) to avoid native dep issues on Vercel.
 *
 * Actor output fields (verified):
 *   adArchiveID, pageID, pageName, pageURL, pageCategory, pageLikes,
 *   pageVerified, pageInstagramUser, pageInstagramFollowers, adText,
 *   adCreativeBodies, publisherPlatforms, adStatus, languages,
 *   startDate, endDate, adCreationTime, adLibraryURL, adSnapshotUrl,
 *   ctaDomain, ctaHeadline, ctaDescription, estimatedAudienceSize
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = process.env.APIFY_ACTOR_ID || "leadsbrary/meta-ads-library-scraper";

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

export async function scrapeMetaAds(
  opts: ScrapeOptions
): Promise<ScrapeResult> {
  // Build the Ad Library URL. The actor requires a full Ad Library URL
  // with view_all_page_id for page-specific scraping.
  const startUrl =
    opts.pageUrl?.includes("ads/library")
      ? opts.pageUrl
      : buildAdLibraryUrl({
          pageId: opts.pageId,
          country: opts.country ? opts.country.split(",")[0].trim() : undefined,
          active: opts.active,
        });

  const input = {
    startUrls: [{ url: startUrl }],
    maxResults: opts.maxItems ?? 200,
    activeStatus: opts.active === false ? "ALL" : "ACTIVE",
    scrapeAdDetails: true,
    includeAboutPage: true,
  };

  // Start the actor run
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

// ------- Raw ad shape from leadsbrary actor -------
interface RawAd {
  adArchiveID?: string;
  adText?: string;
  adCreativeBodies?: string[];
  ctaHeadline?: string;
  ctaDescription?: string;
  ctaDomain?: string;
  adSnapshotUrl?: string;
  adLibraryURL?: string;
  publisherPlatforms?: string[];
  languages?: string[] | null;
  startDate?: string;
  endDate?: string | null;
  adStatus?: string;
  // Page info
  pageID?: string;
  pageName?: string;
  pageURL?: string;
  pageCategory?: string;
  // Fallback fields from other actors
  ad_archive_id?: string;
  body?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  originalImageUrl?: string;
  imageUrl?: string;
  videoHdUrl?: string;
  videoSdUrl?: string;
  linkUrl?: string;
  [k: string]: unknown;
}

function toIso(v: string | number | undefined | null): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(ad: RawAd): NormalizedAd {
  // adText from this actor is often duplicated across variants; use first creative body
  const primaryText =
    ad.adCreativeBodies?.[0] ?? ad.adText ?? ad.body ?? null;

  return {
    ad_archive_id: String(ad.adArchiveID ?? ad.ad_archive_id ?? ""),
    ad_text: primaryText,
    headline: ad.ctaHeadline ?? ad.headline ?? null,
    description: ad.ctaDescription ?? ad.description ?? null,
    cta: ad.ctaDomain ?? ad.callToAction ?? null,
    image_url: ad.adSnapshotUrl ?? ad.originalImageUrl ?? ad.imageUrl ?? null,
    video_url: ad.videoHdUrl ?? ad.videoSdUrl ?? null,
    landing_url: ad.ctaDomain
      ? `https://${ad.ctaDomain}`
      : ad.linkUrl ?? null,
    platforms: ad.publisherPlatforms ?? [],
    languages: Array.isArray(ad.languages) ? ad.languages : [],
    start_date: toIso(ad.startDate),
    end_date: toIso(ad.endDate),
    status: ad.adStatus ?? null,
    raw_data: ad as Record<string, unknown>,
  };
}
