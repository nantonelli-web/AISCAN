import { buildAdLibraryUrl } from "@/lib/meta/url";
import { getApifyCredentials } from "@/lib/billing/credentials";

/**
 * Service layer for the apify/facebook-ads-scraper actor (official).
 * Uses the Apify REST API directly (no SDK).
 *
 * This actor provides full ad data INCLUDING direct image/video URLs
 * inside the `snapshot.cards[]` array:
 *   - originalImageUrl / resizedImageUrl (direct fbcdn URLs)
 *   - videoHdUrl / videoSdUrl / videoPreviewImageUrl
 *   - title, body, linkUrl, ctaText, caption
 *
 * Pricing: $5.80/1000 ads (Free), $5.00 (Starter), $3.40 (Business)
 * Platform usage: Free
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = process.env.APIFY_ACTOR_ID || "apify/facebook-ads-scraper";

function getToken(token?: string): string {
  // When the caller supplied an explicit token (resolved via
  // getApifyCredentials for a workspace) use that. Otherwise fall
  // back to env. This keeps the legacy code paths working while
  // letting subscription-mode callers thread their BYO key in.
  if (token) return token;
  const fromEnv = process.env.APIFY_API_TOKEN;
  if (!fromEnv) throw new Error("APIFY_API_TOKEN missing.");
  return fromEnv;
}

/**
 * Apify gateway frequently returns 502 / 503 / 504 transients on the
 * actor POST and even on dataset reads. We retry transients but the
 * total budget has to fit inside the surrounding Vercel maxDuration
 * (300s) shared with N parallel country scans, so the backoff is
 * deliberately tight: 1s + 2s = 3s max waste per call.
 *
 * Retries cover only transient classes:
 *   - 502 / 503 / 504  → gateway / upstream timeouts
 *   - fetch threw     → network blip from Vercel to Apify
 *
 * 4xx responses (auth, quota, validation) are never retried — they
 * will not change on retry and would just waste budget.
 */
const APIFY_RETRY_STATUSES = new Set([502, 503, 504]);
const APIFY_MAX_ATTEMPTS = 3;
const APIFY_BACKOFF_MS = [1000, 2000];

async function apifyFetch(path: string, init?: RequestInit, token?: string) {
  const resolvedToken = getToken(token);
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= APIFY_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${APIFY_BASE}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${resolvedToken}`,
          ...init?.headers,
        },
      });
      if (res.ok) return res.json();

      const text = await res.text().catch(() => "");
      const error = new Error(`Apify API ${res.status}: ${text.slice(0, 300)}`);

      if (
        APIFY_RETRY_STATUSES.has(res.status) &&
        attempt < APIFY_MAX_ATTEMPTS
      ) {
        lastError = error;
        const delayMs = APIFY_BACKOFF_MS[attempt - 1] ?? 2000;
        console.warn(
          `[apify retry ${attempt}/${APIFY_MAX_ATTEMPTS - 1}] ${res.status} on ${path}, sleeping ${delayMs}ms`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw error;
    } catch (err) {
      // Network-level failure (fetch threw) is retryable; a thrown
      // Error from a non-retryable HTTP status above must propagate.
      const isHttpError =
        err instanceof Error && err.message.startsWith("Apify API ");
      if (isHttpError) throw err;
      if (attempt < APIFY_MAX_ATTEMPTS) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const delayMs = APIFY_BACKOFF_MS[attempt - 1] ?? 2000;
        console.warn(
          `[apify retry ${attempt}/${APIFY_MAX_ATTEMPTS - 1}] network error on ${path}, sleeping ${delayMs}ms`,
          err,
        );
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Apify retry exhausted");
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
  /** ISO-2 codes passed to Apify when this ad was scraped. Populated by
   *  the service layer, not by normalize(). `null` means "unknown" —
   *  reserved for the legacy country=ALL path and kept null-safe in the
   *  DB column. */
  scan_countries: string[] | null;
}

export interface ScrapeResult {
  runId: string;
  records: NormalizedAd[];
  costCu: number;
  startUrl: string;
  /** Countries we explicitly asked Apify for, in upper-case ISO-2.
   *  Empty when the legacy country=ALL path ran (no per-country signal
   *  available, so callers must NOT use this for reconcile logic). */
  scannedCountries: string[];
  /** Surfaces which Apify account paid for the run + its
   *  mait_provider_keys.id when it was a workspace BYO key. The
   *  scan-job route reads this to populate the audit columns
   *  (key_used, billing_mode_at_run) on mait_scrape_jobs. */
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
  debug?: Record<string, unknown>;
}

export interface ScrapeOptions {
  pageId?: string;
  pageName?: string;
  pageUrl?: string;
  country?: string;
  maxItems?: number;
  active?: boolean;
  dateFrom?: string;
  dateTo?: string;
  /** When supplied, the service resolves the Apify token via the
   *  billing helper (getApifyCredentials) so subscription-mode
   *  workspaces use their BYO key. Optional for backward compat —
   *  callers without workspace context (legacy helpers) keep the
   *  managed env behaviour. */
  workspaceId?: string;
}

/**
 * Scrape Meta ads for a competitor. When `opts.country` is a single
 * ISO-2 code OR a CSV list, the function issues ONE Apify call per
 * country. This is mandatory so every stored ad carries a specific
 * country (in `scan_countries`) and downstream filters can answer
 * "give me Marina Rinaldi's FR ads" accurately.
 *
 * Multi-country flow:
 *   - split CSV into `[IT, DE, FR, ...]`
 *   - fire one `scrapeMetaAdsSingleCountry` per entry, sequentially
 *   - dedup the returned ads by `ad_archive_id`: if the same ad shows
 *     up in multiple country scans, keep ONE row whose `scan_countries`
 *     is the union of every country where we saw it
 *
 * `country=ALL` is no longer used — if `opts.country` is empty we fall
 * back to a single ALL scan and emit ads with `scan_countries = null`.
 * That path is reserved for brands not yet configured with a country.
 */
export async function scrapeMetaAds(
  opts: ScrapeOptions
): Promise<ScrapeResult> {
  // Resolve credentials ONCE per scrape so all the per-country
  // fan-outs hit the same Apify account. Subscription-mode
  // workspaces with no BYO key throw BillingError("MISSING_KEY")
  // here, propagated to the route handler which translates to a
  // user-facing "configure your Apify key in Settings" message.
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const rawCountry = opts.country?.trim() ?? "";
  const countryList = rawCountry
    ? rawCountry
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    : [];

  // No country configured — legacy behavior (ALL), scan_countries = null.
  if (countryList.length === 0) {
    const r = await scrapeMetaAdsSingleCountry(
      { ...opts, country: undefined },
      null,
      token,
    );
    return { ...r, scannedCountries: [], credentials: creds };
  }

  // Single country — one scan, scan_countries = [country].
  if (countryList.length === 1) {
    const r = await scrapeMetaAdsSingleCountry(
      { ...opts, country: countryList[0] },
      [countryList[0]],
      token,
    );
    return { ...r, scannedCountries: countryList, credentials: creds };
  }

  // Multi-country — N scans run IN PARALLEL via Promise.allSettled
  // so the wall-clock time is the SLOWEST country, not the sum. The
  // previous sequential loop hit Vercel's 300s maxDuration the moment
  // any country had a hiccup with retries, leaving the job stuck in
  // "running" forever (the Lambda died before the catch block could
  // mark it failed). With parallel execution + tighter retries, even
  // a 5-country brand normally completes in 60–90s wall time.
  //
  // Partial-results tolerance is preserved: a single country failing
  // (after retries) must NOT discard what the others collected. Only
  // when EVERY country fails do we re-throw so the route flips the
  // job to failed.
  const settled = await Promise.allSettled(
    countryList.map((country) =>
      scrapeMetaAdsSingleCountry({ ...opts, country }, [country], token).then(
        (result) => ({ country, result }),
      ),
    ),
  );

  const byArchiveId = new Map<string, NormalizedAd>();
  const startUrls: string[] = [];
  const runIds: string[] = [];
  const successfulCountries: string[] = [];
  const failedCountries: { country: string; error: string }[] = [];
  let totalCostCu = 0;
  settled.forEach((outcome, idx) => {
    const country = countryList[idx];
    if (outcome.status === "rejected") {
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      failedCountries.push({ country, error: message });
      console.warn(
        `[scrapeMetaAds] ${country} scan failed after retries: ${message}`,
      );
      return;
    }
    const { result: partial } = outcome.value;
    successfulCountries.push(country);
    totalCostCu += partial.costCu;
    startUrls.push(partial.startUrl);
    runIds.push(partial.runId);
    for (const ad of partial.records) {
      const existing = byArchiveId.get(ad.ad_archive_id);
      if (existing) {
        const merged = new Set<string>(existing.scan_countries ?? []);
        for (const c of ad.scan_countries ?? []) merged.add(c);
        existing.scan_countries = [...merged];
      } else {
        byArchiveId.set(ad.ad_archive_id, ad);
      }
    }
  });

  if (successfulCountries.length === 0) {
    // Every country failed — propagate so the route marks the job
    // failed and refunds credits. The error string lists each country
    // so the diagnostic surfaces the underlying failure mode.
    throw new Error(
      `All ${countryList.length} country scans failed: ${failedCountries
        .map((f) => `${f.country} → ${f.error}`)
        .join(" | ")}`,
    );
  }

  // scannedCountries is the SUBSET that actually succeeded — the
  // reconcile downstream uses it to scope which existing ads to
  // consider. If we passed the full requested list and ES failed,
  // reconcile would inactivate existing ES-scoped ads on the basis
  // of "they did not come back" — but they never had a chance to.
  return {
    runId: runIds.join(","),
    records: [...byArchiveId.values()],
    costCu: totalCostCu,
    startUrl: startUrls[0] ?? "",
    scannedCountries: successfulCountries,
    credentials: creds,
    debug: {
      countriesScanned: successfulCountries,
      countriesFailed: failedCountries,
      runIds,
      startUrls,
    },
  };
}

/** Single-country scrape path. Every ad it returns has its
 *  `scan_countries` set to the supplied `scanCountries` argument (or
 *  null for the legacy ALL path). The `token` is resolved once in
 *  the entry function (scrapeMetaAds) and passed down so every
 *  apifyFetch in the chain hits the right Apify account. */
async function scrapeMetaAdsSingleCountry(
  opts: ScrapeOptions,
  scanCountries: string[] | null,
  token?: string,
): Promise<ScrapeResult> {
  const startUrl =
    opts.pageUrl?.includes("ads/library")
      ? opts.pageUrl
      : buildAdLibraryUrl({
          pageId: opts.pageId,
          searchQuery: opts.pageId ? undefined : opts.pageName,
          country: opts.country,
          active: opts.active,
          dateFrom: opts.dateFrom,
          dateTo: opts.dateTo,
        });

  // Default 500 per country call: 200 was the MVP placeholder and capped
  // active heavy advertisers (e.g. Axel Arigato hit 200 exactly). 500 is
  // the sweet spot — covers virtually every fashion brand we have, fits
  // inside Vercel maxDuration=300 with margin, and the per-country loop
  // multiplies it by N for multi-market brands. The route validation
  // still allows up to 1000 if a caller passes a higher max_items.
  const maxItems = opts.maxItems ?? 500;
  const input: Record<string, unknown> = {
    startUrls: [{ url: startUrl }],
    maxItems,
  };
  if (opts.dateFrom) input.startDate = opts.dateFrom;
  if (opts.dateTo) input.endDate = opts.dateTo;

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxItems}`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Per-country poll budget. Was 5 min, but with parallel country
  // execution the slowest country bounds the whole scrapeMetaAds
  // wall-clock — and that has to fit inside Vercel maxDuration=300s
  // shared with image storage + DB upserts + reconcile. 2 min is
  // enough for any healthy actor run we have seen; a country that
  // takes longer is probably hung and should fail open so the rest
  // of the brand is not held hostage.
  let status = run.data?.status ?? run.status ?? "RUNNING";
  const startTime = Date.now();
  const maxWait = 2 * 60 * 1000;
  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - startTime < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
  }
  if (status !== "SUCCEEDED") {
    throw new Error(`Apify run ended with status: ${status}`);
  }

  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=1000`,
    undefined,
    token,
  );
  const items: RawAd[] = Array.isArray(dataset) ? dataset : dataset.items ?? [];

  const records = items
    .map(normalize)
    .filter((a): a is NormalizedAd => !!a.ad_archive_id)
    .map((a) => ({ ...a, scan_countries: scanCountries }));

  let costCu = 0;
  try {
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    costCu = runInfo.data?.usageTotalUsd ?? 0;
  } catch {
    /* ignore */
  }

  return {
    runId,
    records,
    costCu,
    startUrl,
    // Mirror the scanCountries arg so the type stays satisfied; the
    // orchestrator overwrites this when it wraps the result.
    scannedCountries: scanCountries ?? [],
  };
}

// ------- Raw ad shape from apify/facebook-ads-scraper -------

interface SnapshotCard {
  body?: string;
  title?: string;
  caption?: string;
  ctaText?: string;
  ctaType?: string;
  linkUrl?: string;
  linkDescription?: string;
  originalImageUrl?: string;
  resizedImageUrl?: string;
  videoHdUrl?: string;
  videoSdUrl?: string;
  videoPreviewImageUrl?: string;
  watermarkedVideoHdUrl?: string;
  watermarkedVideoSdUrl?: string;
}

interface SnapshotImage {
  originalImageUrl?: string;
  resizedImageUrl?: string;
  imageCrops?: unknown[];
}

interface SnapshotVideo {
  videoHdUrl?: string;
  videoSdUrl?: string;
  videoPreviewImageUrl?: string;
}

interface Snapshot {
  pageName?: string;
  pageId?: string;
  pageProfileUri?: string;
  pageProfilePictureUrl?: string;
  caption?: string;
  ctaText?: string;
  ctaType?: string;
  linkUrl?: string;
  body?: string;
  title?: string;
  displayFormat?: string;
  pageLikeCount?: number;
  pageCategories?: string[];
  isReshared?: boolean;
  cards?: SnapshotCard[];
  images?: SnapshotImage[];
  videos?: SnapshotVideo[];
  extraImages?: SnapshotImage[];
  extraVideos?: SnapshotVideo[];
  event?: unknown;
}

interface RelatedPage {
  pageId?: string;
  pageName?: string;
  country?: string;
}

interface PageInfo {
  adLibraryPageInfo?: {
    relatedPages?: RelatedPage[];
  };
}

interface RawAd {
  adArchiveID?: string;
  adArchiveId?: string;
  pageID?: string;
  pageId?: string;
  pageName?: string;
  isActive?: boolean;
  startDate?: number;
  endDate?: number | null;
  startDateFormatted?: string;
  endDateFormatted?: string;
  publisherPlatform?: string[];
  snapshot?: Snapshot;
  categories?: string[];
  containsDigitalCreatedMedia?: boolean;
  isAaaEligible?: boolean;
  collationCount?: number;
  targetedOrReachedCountries?: string[];
  pageInfo?: PageInfo;
  // Fallback fields from other actors
  adText?: string;
  adStatus?: string;
  [k: string]: unknown;
}

function toIso(v: string | number | undefined | null): string | null {
  if (v == null) return null;
  if (typeof v === "number") {
    // Unix timestamp in seconds
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalize(ad: RawAd): NormalizedAd {
  const snap = ad.snapshot;
  const card = snap?.cards?.[0];
  const firstImage = snap?.images?.[0];
  const firstVideo = snap?.videos?.[0];

  // Extract image: cards > snapshot.images > snapshot.videos[].preview
  // > extraImages. The firstVideo.videoPreviewImageUrl fallback covers
  // VIDEO-only ads (cardCount=0, imageCount=0, videoCount>=1) which
  // would otherwise land with image_url=null and render as an empty
  // placeholder. Meta always ships a preview JPG with each video.
  const imageUrl =
    card?.originalImageUrl ??
    card?.resizedImageUrl ??
    card?.videoPreviewImageUrl ??
    firstImage?.originalImageUrl ??
    firstImage?.resizedImageUrl ??
    firstVideo?.videoPreviewImageUrl ??
    snap?.extraImages?.[0]?.originalImageUrl ??
    snap?.extraImages?.[0]?.resizedImageUrl ??
    null;

  // Extract video: cards > snapshot.videos
  // displayFormat is stored in raw_data and read by the UI for badge display
  const videoUrl =
    card?.videoHdUrl ??
    card?.videoSdUrl ??
    firstVideo?.videoHdUrl ??
    firstVideo?.videoSdUrl ??
    null;

  // Extract text: cards > snapshot body > top-level
  const adText = card?.body ?? snap?.body ?? ad.adText ?? null;
  const headline = card?.title ?? snap?.title ?? null;
  const description = card?.linkDescription ?? null;
  const cta = card?.ctaText ?? snap?.ctaText ?? null;
  const landingUrl = card?.linkUrl ?? snap?.linkUrl ?? null;

  // Platforms from the official actor use uppercase
  const platforms = (ad.publisherPlatform ?? []).map((p) =>
    p.toLowerCase()
  );

  return {
    ad_archive_id: String(
      ad.adArchiveID ?? ad.adArchiveId ?? ""
    ),
    ad_text: adText,
    headline,
    description,
    cta,
    image_url: imageUrl,
    video_url: videoUrl,
    landing_url: landingUrl,
    platforms,
    languages: [],
    start_date:
      toIso(ad.startDateFormatted ?? ad.startDate),
    // Apify reports an `endDate` even for ads that are still running
    // (it appears to be the snapshot/last-seen date, not the actual
    // campaign end). For active ads we drop it so downstream code
    // (Brand-detail duration, End-date display, exports) can rely on
    // `end_date == null` meaning "no end yet" instead of carrying a
    // bogus 1-day-after-start value.
    end_date: ad.isActive
      ? null
      : toIso(ad.endDateFormatted ?? ad.endDate),
    status: ad.isActive ? "ACTIVE" : ad.adStatus ?? "INACTIVE",
    raw_data: ad as unknown as Record<string, unknown>,
    // Caller (scrapeMetaAdsSingleCountry) overrides this with the actual
    // scanned-country list; normalize() does not know which country this
    // run was targeting.
    scan_countries: null,
  };
}
