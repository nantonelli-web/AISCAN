/**
 * beyondops/tiktok-ad-library-scraper — TikTok Creative Center
 * "Top Ads" scraper.
 *
 * Coverage: 50+ countries (US, GB, CA, AU, DE, FR, JP, KR, BR, IN,
 * MX, IT, ES, NL, SE, NO, DK, FI, PL, RU, TR, SA, AE, EG, NG, ID,
 * TH, VN, MY, PH, SG, TW, HK, AR, CL, CO, PE, NZ, …). Workspace-
 * level market intel: top performing ads in a given industry +
 * country + objective, NOT tied to a specific advertiser.
 *
 * Pricing: $0.00001 per result (~$0.002 per 200-ad scan).
 *
 * Decision history: see project memory `project_tiktok_ads_actors`.
 * Half of the dual-actor stack — DSA Library lives in
 * silva-service.ts.
 *
 * Schema verified live on 2026-05-04 against the public actor docs:
 *   input  : { country, industry, objective, period, adFormat,
 *              orderBy, maxResults, proxyConfiguration }
 *   output : { adId, adTitle, brandName, industry, objective,
 *              country, likes, ctr, budgetLevel, videoUrl,
 *              videoUrlHd, videoCoverUrl, videoDuration,
 *              landingPageUrl, adFormat, adText, callToAction,
 *              tags, favorited, scrapedAt }
 *
 * Limit: non-authenticated access yields ~20-40 results per filter
 * combination. For larger datasets the user must run multiple
 * passes with different filters.
 */

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "beyondops/tiktok-ad-library-scraper";

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

/** Industries the actor accepts. Mirror of the actor input schema
 *  enum so the caller cannot pass unsupported values silently.
 *  Verified 2026-05-04. */
export type CcIndustry =
  | "app_games"
  | "app_non_games"
  | "ecommerce"
  | "education"
  | "finance"
  | "food_beverage"
  | "health"
  | "home_improvement"
  | "life_services"
  | "media_entertainment"
  | "tech_electronics"
  | "travel"
  | "vehicles_transport"
  | "fashion_accessories"
  | "beauty_personal_care"
  | "sports_outdoors"
  | "pets"
  | "baby_kids_maternity"
  | "news_politics";

export type CcObjective =
  | "traffic"
  | "app_install"
  | "conversions"
  | "reach"
  | "video_views"
  | "lead_generation"
  | "catalog_sales"
  | "community_interaction";

export type CcPeriod = "7" | "30" | "180";

export type CcAdFormat = "spark_ads" | "non_spark_ads" | "collection_ads";

export type CcOrderBy = "for_you" | "like" | "ctr" | "impression";

export interface TiktokAdsCcScrapeOptions {
  /** ISO-2 country code (uppercase). When omitted the actor
   *  returns global top ads. */
  country?: string;
  industry?: CcIndustry;
  objective?: CcObjective;
  /** Time window — required by the actor. Defaults to "30" days
   *  which covers the practical "what's hot recently" use case. */
  period?: CcPeriod;
  adFormat?: CcAdFormat;
  orderBy?: CcOrderBy;
  /** 1-100, actor caps at 100. Required by the actor; defaults to
   *  20 (a typical "give me a sample" run). */
  maxResults?: number;
  workspaceId?: string;
}

export interface NormalizedTiktokCcAd {
  ad_id: string;
  source: "creative_center";
  advertiser_id: null;
  advertiser_name: string | null;
  ad_title: string | null;
  video_url: string | null;
  video_cover_url: string | null;
  ad_format: string | null;
  ad_text: string | null;
  landing_page_url: string | null;
  call_to_action: string | null;
  industry: string | null;
  campaign_objective: string | null;
  country: string | null;
  ctr: number | null;
  likes: number | null;
  budget_level: string | null;
  video_duration: number | null;
  tags: string[] | null;
  raw_data: Record<string, unknown>;
}

export interface TiktokAdsCcScrapeResult {
  runId: string;
  ads: NormalizedTiktokCcAd[];
  costCu: number;
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

/* ── Normalisation ──────────────────────────────────────────── */

interface RawBeyondopsItem {
  adId?: string;
  adTitle?: string;
  brandName?: string;
  industry?: string;
  objective?: string;
  country?: string;
  likes?: number;
  ctr?: number;
  budgetLevel?: string;
  videoUrl?: string;
  videoUrlHd?: string;
  videoCoverUrl?: string;
  videoDuration?: number;
  landingPageUrl?: string;
  adFormat?: string;
  adText?: string;
  callToAction?: string;
  tags?: string[];
  favorited?: boolean;
  scrapedAt?: string;
  [k: string]: unknown;
}

function normalizeItem(item: RawBeyondopsItem): NormalizedTiktokCcAd | null {
  if (!item.adId) return null;
  // Prefer HD video when available — same payload size on most
  // TikTok CDNs but renders sharper in the AdCard preview.
  const videoUrl = item.videoUrlHd ?? item.videoUrl ?? null;
  return {
    ad_id: String(item.adId),
    source: "creative_center",
    advertiser_id: null,
    advertiser_name: item.brandName ?? null,
    ad_title: item.adTitle ?? null,
    video_url: videoUrl,
    video_cover_url: item.videoCoverUrl ?? null,
    ad_format: item.adFormat ?? null,
    ad_text: item.adText ?? null,
    landing_page_url: item.landingPageUrl ?? null,
    call_to_action: item.callToAction ?? null,
    industry: item.industry ?? null,
    campaign_objective: item.objective ?? null,
    country: item.country ?? null,
    // CTR comes back as a number; the actor returns it as a
    // percentage (e.g. 2.34 = 2.34%) — we store it as decimal
    // (0.0234) to be consistent with Postgres NUMERIC(6,4) and
    // every other CTR field in the codebase.
    ctr: typeof item.ctr === "number" ? Number((item.ctr / 100).toFixed(4)) : null,
    likes: typeof item.likes === "number" ? item.likes : null,
    budget_level: item.budgetLevel ?? null,
    video_duration: typeof item.videoDuration === "number" ? item.videoDuration : null,
    tags: Array.isArray(item.tags) ? item.tags : null,
    raw_data: item as unknown as Record<string, unknown>,
  };
}

/* ── Scrape ─────────────────────────────────────────────────── */

export async function scrapeTiktokCreativeCenter(
  opts: TiktokAdsCcScrapeOptions,
): Promise<TiktokAdsCcScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  // The actor's input schema requires `period` and `maxResults` —
  // every other field is optional and acts as a narrowing filter.
  const input: Record<string, unknown> = {
    period: opts.period ?? "30",
    maxResults: Math.min(100, Math.max(1, opts.maxResults ?? 20)),
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
  };
  if (opts.country) input.country = opts.country;
  if (opts.industry) input.industry = opts.industry;
  if (opts.objective) input.objective = opts.objective;
  if (opts.adFormat) input.adFormat = opts.adFormat;
  if (opts.orderBy) input.orderBy = opts.orderBy;

  console.log(
    `[TikTokCC] Starting: actor=${ACTOR_ID} country=${opts.country ?? "—"} industry=${opts.industry ?? "—"} obj=${opts.objective ?? "—"} period=${input.period} max=${input.maxResults}`,
  );

  // Same Apify cost-cap pattern. beyondops is paid-per-result
  // ($0.00001) so a 100-result run costs $0.001 — the platform
  // will reject without a $0.50+ ceiling.
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
    throw new Error("Apify TikTok CC run started but no datasetId returned.");
  }

  // Creative Center scans are fast — typically 5-15 seconds since
  // the source page renders ~20-40 ads at once. 5-min cap mirrors
  // the other scrapers.
  let status = run.data?.status ?? run.status ?? "RUNNING";
  const startTime = Date.now();
  const maxWait = 5 * 60 * 1000;
  let pollCount = 0;
  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - startTime < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    pollCount++;
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
  }

  if (status !== "SUCCEEDED") {
    throw new Error(
      `TikTok CC actor ${status} after ${Math.round((Date.now() - startTime) / 1000)}s`,
    );
  }

  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&clean=true`,
    undefined,
    token,
  );
  const items: RawBeyondopsItem[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(`[TikTokCC] Run ${runId} returned ${items.length} ads`);

  const ads = items
    .map(normalizeItem)
    .filter((a): a is NormalizedTiktokCcAd => a !== null);

  // Cost: $0.00001 per result. Tiny but real — log it for
  // accounting parity with SERP / Maps.
  const costCu = ads.length * 0.00001;

  return {
    runId,
    ads,
    costCu,
    credentials: creds,
  };
}
