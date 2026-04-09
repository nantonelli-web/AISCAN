import { ApifyClient } from "apify-client";
import { buildAdLibraryUrl } from "@/lib/meta/url";

/**
 * Service layer for the Apify Meta Ads Scraper actor.
 * Docs: https://apify.com/apify/meta-ads-scraper
 *
 * The exact actor ID is configurable via APIFY_ACTOR_ID since several actors
 * (apify/meta-ads-scraper, leadsbrary/meta-ads-library-scraper) expose the
 * same data shape with minor input differences.
 */

const ACTOR_ID = process.env.APIFY_ACTOR_ID || "apify/meta-ads-scraper";

function getClient() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN missing. Set it in .env.local before running scrapes."
    );
  }
  return new ApifyClient({ token });
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
  const client = getClient();

  const startUrl =
    opts.pageUrl?.includes("ads/library")
      ? opts.pageUrl
      : buildAdLibraryUrl({
          pageId: opts.pageId,
          country: opts.country,
          active: opts.active,
        });

  const input: Record<string, unknown> = {
    startUrls: [{ url: startUrl }],
    urls: [startUrl], // some actors use `urls`
    maxItems: opts.maxItems ?? 200,
    countryCode: opts.country ?? "ALL",
    activeStatus: opts.active === false ? "all" : "active",
  };

  const run = await client.actor(ACTOR_ID).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const records = (items as RawAd[]).map(normalize).filter(
    (a): a is NormalizedAd => !!a.ad_archive_id
  );

  // Best-effort cost lookup; not all runs expose usage immediately.
  let costCu = 0;
  try {
    const fullRun = await client.run(run.id).get();
    costCu = (fullRun?.usageTotalUsd as number | undefined) ?? 0;
  } catch {
    /* ignore */
  }

  return { runId: run.id, records, costCu };
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
