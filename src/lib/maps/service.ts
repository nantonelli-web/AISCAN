/**
 * Service layer for the compass/crawler-google-places actor.
 * Same REST pattern as every other AISCAN scraper — no SDK.
 *
 * Actor: compass/crawler-google-places
 * Pricing: pay-per-result, $2.10 / 1000 places (reviews bundled).
 *
 * Single-actor strategy: the brief listed two actors (one for places,
 * one for reviews) but during the sanity test the dedicated reviews
 * actor (`automation-lab/google-maps-reviews-scraper`) returned 0
 * reviews on every URL we tried, while compass already exposes
 * reviews per place when invoked with `maxReviews=N`. We ship the
 * single-actor design — cheaper, more reliable, schema is actually
 * richer (the bundled reviews carry `reviewDetailedRating` such as
 * Cibo / Servizio / Ambiente that the dedicated actor does not).
 *
 * Schema verified live on 2026-04-28 against "ristoranti Milano" —
 * see `project_new_actors_plan.md`.
 */

import { normalizeDomain } from "@/lib/serp/service";

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "compass/crawler-google-places";

function getToken(override?: string): string {
  if (override) return override;
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN missing.");
  return token;
}

async function apifyFetch(path: string, init?: RequestInit, token?: string) {
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

export interface NormalizedMapsReview {
  review_id: string;
  review_url: string | null;
  text: string | null;
  text_translated: string | null;
  stars: number | null;
  detailed_ratings: Record<string, unknown>;
  context: Record<string, unknown>;
  likes_count: number;
  language: string | null;
  translated_language: string | null;
  review_image_urls: string[];
  reviewer_name: string | null;
  reviewer_url: string | null;
  reviewer_id: string | null;
  reviewer_photo_url: string | null;
  reviewer_review_count: number | null;
  is_local_guide: boolean;
  response_from_owner_text: string | null;
  response_from_owner_date: string | null;
  published_at: string | null;
  publish_at_text: string | null;
  last_edited_at: string | null;
  raw_data: Record<string, unknown>;
}

export interface NormalizedMapsPlace {
  place_id: string;
  cid: string | null;
  fid: string | null;
  kgmid: string | null;

  title: string | null;
  sub_title: string | null;
  description: string | null;
  category_name: string | null;
  categories: string[];
  price: string | null;

  address: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  country_code: string | null;
  neighborhood: string | null;
  location_lat: number | null;
  location_lng: number | null;
  plus_code: string | null;

  website: string | null;
  normalized_domain: string | null;
  phone: string | null;

  total_score: number | null;
  reviews_count: number;
  images_count: number;
  rank: number | null;
  is_advertisement: boolean;

  permanently_closed: boolean;
  temporarily_closed: boolean;

  opening_hours: unknown[];
  additional_info: Record<string, unknown>;
  popular_times: Record<string, unknown>;
  popular_times_live_text: string | null;
  popular_times_live_percent: number | null;

  image_url: string | null;
  url: string | null;
  search_page_url: string | null;
  reserve_table_url: string | null;
  google_food_url: string | null;

  hotel_stars: number | null;
  hotel_description: string | null;

  raw_data: Record<string, unknown>;

  /** Bundled reviews — same actor run, one less round trip. */
  reviews: NormalizedMapsReview[];
}

export interface MapsScrapeResult {
  runId: string;
  places: NormalizedMapsPlace[];
  costCu: number;
}

export interface MapsScrapeOptions {
  searchTerm: string;
  locationQuery: string;
  /** ISO alpha-2 lowercase. */
  language?: string;
  countryCode?: string;
  maxPlaces?: number;
  maxReviewsPerPlace?: number;
}

/* ── Cleaning ───────────────────────────────────────────────── */

function clean(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim().replace(/\s+/g, " ");
  return v || null;
}

export function cleanMapsSearchTerm(
  raw: string | null | undefined,
): string | null {
  const v = clean(raw);
  if (!v || v.length > 200) return null;
  return v;
}

export function cleanMapsLocationQuery(
  raw: string | null | undefined,
): string | null {
  const v = clean(raw);
  if (!v || v.length > 200) return null;
  return v;
}

/* ── Raw shapes (only typed for fields we consume) ──────────── */

interface RawMapsReview {
  reviewId?: string;
  reviewUrl?: string;
  text?: string | null;
  textTranslated?: string | null;
  stars?: number;
  rating?: number | null;
  reviewDetailedRating?: Record<string, unknown>;
  reviewContext?: Record<string, unknown>;
  likesCount?: number;
  originalLanguage?: string | null;
  translatedLanguage?: string | null;
  reviewImageUrls?: string[];
  name?: string;
  reviewerUrl?: string;
  reviewerId?: string;
  reviewerPhotoUrl?: string;
  reviewerNumberOfReviews?: number;
  isLocalGuide?: boolean;
  responseFromOwnerText?: string | null;
  responseFromOwnerDate?: string | null;
  publishedAtDate?: string;
  publishAt?: string;
  lastEditedAtDate?: string;
  [k: string]: unknown;
}

interface RawMapsPlace {
  title?: string;
  subTitle?: string | null;
  description?: string | null;
  price?: string | null;
  categoryName?: string;
  address?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  countryCode?: string;
  neighborhood?: string | null;
  website?: string | null;
  phone?: string | null;
  location?: { lat?: number; lng?: number };
  plusCode?: string | null;
  totalScore?: number;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  placeId?: string;
  categories?: string[];
  fid?: string;
  cid?: string;
  reviewsCount?: number;
  imagesCount?: number;
  scrapedAt?: string;
  reserveTableUrl?: string | null;
  googleFoodUrl?: string | null;
  hotelStars?: number | null;
  hotelDescription?: string | null;
  popularTimesLiveText?: string | null;
  popularTimesLivePercent?: number | null;
  popularTimesHistogram?: Record<string, unknown>;
  openingHours?: unknown[];
  additionalInfo?: Record<string, unknown>;
  url?: string;
  searchPageUrl?: string;
  imageUrl?: string;
  rank?: number;
  isAdvertisement?: boolean;
  kgmid?: string;
  reviews?: RawMapsReview[];
  [k: string]: unknown;
}

/* ── Normalisation ──────────────────────────────────────────── */

function normalizeReview(r: RawMapsReview): NormalizedMapsReview | null {
  const id = (r.reviewId ?? "").trim();
  if (!id) return null;
  return {
    review_id: id,
    review_url: r.reviewUrl ?? null,
    text: r.text ?? null,
    text_translated: r.textTranslated ?? null,
    stars: typeof r.stars === "number" ? r.stars : null,
    detailed_ratings:
      typeof r.reviewDetailedRating === "object" &&
      r.reviewDetailedRating !== null
        ? (r.reviewDetailedRating as Record<string, unknown>)
        : {},
    context:
      typeof r.reviewContext === "object" && r.reviewContext !== null
        ? (r.reviewContext as Record<string, unknown>)
        : {},
    likes_count: typeof r.likesCount === "number" ? r.likesCount : 0,
    language: r.originalLanguage ?? null,
    translated_language: r.translatedLanguage ?? null,
    review_image_urls: Array.isArray(r.reviewImageUrls)
      ? r.reviewImageUrls.filter((s): s is string => typeof s === "string")
      : [],
    reviewer_name: r.name ?? null,
    reviewer_url: r.reviewerUrl ?? null,
    reviewer_id: r.reviewerId ?? null,
    reviewer_photo_url: r.reviewerPhotoUrl ?? null,
    reviewer_review_count:
      typeof r.reviewerNumberOfReviews === "number"
        ? r.reviewerNumberOfReviews
        : null,
    is_local_guide: r.isLocalGuide === true,
    response_from_owner_text: r.responseFromOwnerText ?? null,
    response_from_owner_date: r.responseFromOwnerDate ?? null,
    published_at: r.publishedAtDate ?? null,
    publish_at_text: r.publishAt ?? null,
    last_edited_at: r.lastEditedAtDate ?? null,
    raw_data: r as unknown as Record<string, unknown>,
  };
}

function normalizePlace(p: RawMapsPlace): NormalizedMapsPlace | null {
  const placeId = (p.placeId ?? "").trim();
  if (!placeId) return null;
  const reviews = Array.isArray(p.reviews)
    ? p.reviews
        .map(normalizeReview)
        .filter((r): r is NormalizedMapsReview => r !== null)
    : [];
  return {
    place_id: placeId,
    cid: p.cid ?? null,
    fid: p.fid ?? null,
    kgmid: p.kgmid ?? null,

    title: p.title ?? null,
    sub_title: p.subTitle ?? null,
    description: p.description ?? null,
    category_name: p.categoryName ?? null,
    categories: Array.isArray(p.categories)
      ? p.categories.filter((s): s is string => typeof s === "string")
      : [],
    price: p.price ?? null,

    address: p.address ?? null,
    street: p.street ?? null,
    city: p.city ?? null,
    postal_code: p.postalCode ?? null,
    state: p.state ?? null,
    country_code: p.countryCode ?? null,
    neighborhood: p.neighborhood ?? null,
    location_lat:
      p.location && typeof p.location.lat === "number"
        ? p.location.lat
        : null,
    location_lng:
      p.location && typeof p.location.lng === "number"
        ? p.location.lng
        : null,
    plus_code: p.plusCode ?? null,

    website: p.website ?? null,
    normalized_domain: normalizeDomain(p.website ?? null),
    phone: p.phone ?? null,

    total_score: typeof p.totalScore === "number" ? p.totalScore : null,
    reviews_count: typeof p.reviewsCount === "number" ? p.reviewsCount : 0,
    images_count: typeof p.imagesCount === "number" ? p.imagesCount : 0,
    rank: typeof p.rank === "number" ? p.rank : null,
    is_advertisement: p.isAdvertisement === true,

    permanently_closed: p.permanentlyClosed === true,
    temporarily_closed: p.temporarilyClosed === true,

    opening_hours: Array.isArray(p.openingHours) ? p.openingHours : [],
    additional_info:
      typeof p.additionalInfo === "object" && p.additionalInfo !== null
        ? (p.additionalInfo as Record<string, unknown>)
        : {},
    popular_times:
      typeof p.popularTimesHistogram === "object" &&
      p.popularTimesHistogram !== null
        ? (p.popularTimesHistogram as Record<string, unknown>)
        : {},
    popular_times_live_text: p.popularTimesLiveText ?? null,
    popular_times_live_percent:
      typeof p.popularTimesLivePercent === "number"
        ? p.popularTimesLivePercent
        : null,

    image_url: p.imageUrl ?? null,
    url: p.url ?? null,
    search_page_url: p.searchPageUrl ?? null,
    reserve_table_url: p.reserveTableUrl ?? null,
    google_food_url: p.googleFoodUrl ?? null,

    hotel_stars: typeof p.hotelStars === "number" ? p.hotelStars : null,
    hotel_description: p.hotelDescription ?? null,

    raw_data: p as unknown as Record<string, unknown>,
    reviews,
  };
}

/* ── Scrape ─────────────────────────────────────────────────── */

export async function scrapeMapsPlaces(
  opts: MapsScrapeOptions,
): Promise<MapsScrapeResult> {
  const searchTerm = cleanMapsSearchTerm(opts.searchTerm);
  if (!searchTerm) {
    throw new Error(`Search term non valido: "${opts.searchTerm}"`);
  }
  const locationQuery = cleanMapsLocationQuery(opts.locationQuery);
  if (!locationQuery) {
    throw new Error(`Location non valida: "${opts.locationQuery}"`);
  }
  const language = (opts.language ?? "it").toLowerCase();
  const countryCode = (opts.countryCode ?? "IT").toUpperCase();
  const maxPlaces = Math.min(Math.max(opts.maxPlaces ?? 20, 1), 100);
  const maxReviewsPerPlace = Math.min(
    Math.max(opts.maxReviewsPerPlace ?? 10, 0),
    50,
  );

  const input: Record<string, unknown> = {
    searchStringsArray: [searchTerm],
    locationQuery,
    maxCrawledPlacesPerSearch: maxPlaces,
    language,
    countryCode,
    skipClosedPlaces: false,
    maxReviews: maxReviewsPerPlace,
    reviewsSort: "newest",
    scrapeReviewsPersonalData: false,
    deeperCityScrape: false,
    onlyDataFromSearchPage: false,
  };

  console.log(
    `[Maps] Starting: actor=${ACTOR_ID} term="${searchTerm}" loc="${locationQuery}" max=${maxPlaces} reviews=${maxReviewsPerPlace}`,
  );

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxPlaces}`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  });

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[Maps] Run created: runId=${runId} datasetId=${datasetId}`);
  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Maps runs take 30-90s for 20 places + reviews. Same 5-min cap.
  let status = run.data?.status ?? run.status ?? "RUNNING";
  const startTime = Date.now();
  const maxWait = 5 * 60 * 1000;
  let pollCount = 0;
  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - startTime < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    pollCount++;
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    console.log(
      `[Maps] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
    );
  }

  if (status !== "SUCCEEDED") {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(
      `[Maps] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s`,
    );
    throw new Error(
      `Maps actor ${status} after ${elapsed}s (term: "${searchTerm}")`,
    );
  }

  console.log(`[Maps] Run succeeded, fetching dataset...`);
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=200`,
  );
  const items: RawMapsPlace[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(
    `[Maps] Dataset: ${items.length} places. Sample keys: ${items[0] ? Object.keys(items[0]).slice(0, 12).join(", ") : "empty"}`,
  );

  const places = items
    .map(normalizePlace)
    .filter((p): p is NormalizedMapsPlace => p !== null);

  // Cost: $2.10 / 1000 places. Reviews are bundled — no extra event
  // event under the actor's pricing model.
  const costCu = items.length * (2.1 / 1000);

  return {
    runId,
    places,
    costCu,
  };
}
