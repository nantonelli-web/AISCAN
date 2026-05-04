/**
 * Service layer for the apify/google-search-scraper actor.
 * Same REST pattern as every other AISCAN scraper — no SDK.
 *
 * Actor: apify/google-search-scraper
 * Pricing: pay-per-result, $1.80 / 1000 search result pages
 *
 * Schema verified live on 2026-04-28 against "running shoes" / IT —
 * see `project_new_actors_plan.md`. The actor returns ONE item per
 * (query, page) with `searchQuery`, `organicResults[]`, `paidResults[]`,
 * `paidProducts[]`, `peopleAlsoAsk[]`, `relatedQueries[]`,
 * `aiOverview` and a few debug/control fields. We pull a single page
 * per scan because Google caps results to 10 per page anyway and
 * later pages are far less valuable for competitive intelligence.
 */

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apify/google-search-scraper";

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

export type SerpResultType =
  | "organic"
  | "paid"
  | "paid_product"
  | "people_also_ask"
  | "ai_source";

export interface NormalizedSerpResult {
  result_type: SerpResultType;
  position: number | null;
  url: string | null;
  normalized_domain: string | null;
  displayed_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  date_text: string | null;
  emphasized_keywords: string[];
  site_links: unknown[];
  product_info: Record<string, unknown>;
  raw_data: Record<string, unknown>;
}

export interface SerpScrapeResult {
  runId: string;
  results: NormalizedSerpResult[];
  organicCount: number;
  paidCount: number;
  paidProductsCount: number;
  hasAiOverview: boolean;
  relatedQueries: { title: string | null; url: string | null }[];
  peopleAlsoAsk: unknown[];
  rawResponse: Record<string, unknown>;
  costCu: number;
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

export interface SerpScrapeOptions {
  query: string;
  /** ISO alpha-2 country code, lowercase (the actor accepts both
   *  cases but lowercases internally). */
  countryCode?: string;
  languageCode?: string;
  /** "DESKTOP" or "MOBILE" — drives the actor's `mobileResults` flag. */
  device?: "DESKTOP" | "MOBILE";
  workspaceId?: string;
}

/* ── Domain normalisation ───────────────────────────────────── */

// 2nd-level public suffix markers (the bit that comes BEFORE a
// 2-letter ccTLD in compound TLDs like .co.uk, .com.au, .com.ph).
// Source: PSL — kept short on purpose. The handful of true edge
// cases not covered (e.g. `gov.it`, `edu.au`) are tolerated: we
// would normalise `comune.gov.it` → `gov.it`, which is wrong but
// rare and harmless for SERP brand matching since no real brand
// owns one of those.
const COMPOUND_SECOND_LEVEL = new Set([
  "co",
  "com",
  "net",
  "org",
  "gov",
  "edu",
  "ac",
  "or",
  "ne",
  "mil",
]);

/**
 * Extract the registrable domain (eTLD+1) from a URL or hostname.
 * Used to match SERP results against `mait_competitors.google_domain`
 * — Option A from the project memory: strip subdomain, match
 * liberally so `shop.sezane.com`, `www.sezane.com`, and
 * `blog.sezane.com` all match `sezane.com`.
 *
 * Returns null when the input is not a valid hostname.
 */
export function normalizeDomain(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let v = String(raw).trim().toLowerCase();
  if (!v) return null;

  // Strip protocol + path/query/fragment so URLs and bare hostnames
  // both work.
  v = v.replace(/^[a-z]+:\/\//i, "");
  v = v.replace(/[/?#].*$/, "");
  v = v.replace(/:\d+$/, ""); // strip port

  // Strip leading `www.` once. Subdomains other than www are kept
  // for the eTLD+1 logic below — we don't want to drop `shop.` here
  // and then keep `sezane.com` alone twice over.
  v = v.replace(/^www\./, "");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return null;

  const parts = v.split(".");
  if (parts.length < 2) return null;

  // Compound ccTLD detection: last part 2-letter (ccTLD) AND
  // second-last is a known compound second-level → keep last 3.
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (
    last.length === 2 &&
    COMPOUND_SECOND_LEVEL.has(second) &&
    parts.length >= 3
  ) {
    return parts.slice(-3).join(".");
  }

  // Default: registrable domain = last 2 parts.
  return parts.slice(-2).join(".");
}

/* ── Query cleaning ─────────────────────────────────────────── */

/**
 * Trim + collapse whitespace. The actor accepts pretty much
 * anything — we just strip the easy junk so the unique constraint
 * on (workspace, lower(query)) does not split "abito  lino"
 * from "abito lino".
 */
export function cleanQuery(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim().replace(/\s+/g, " ");
  if (!v) return null;
  if (v.length > 200) return null;
  return v;
}

/* ── Raw shape (only typed for the fields we consume) ───────── */

interface RawSerpResultItem {
  position?: number;
  adPosition?: number;
  title?: string;
  url?: string;
  displayedUrl?: string;
  description?: string;
  date?: string;
  emphasizedKeywords?: string[];
  siteLinks?: unknown[];
  productInfo?: Record<string, unknown>;
  imageUrl?: string;
  type?: string;
  [k: string]: unknown;
}

interface RawSerpResponse {
  searchQuery?: Record<string, unknown>;
  organicResults?: RawSerpResultItem[];
  paidResults?: RawSerpResultItem[];
  paidProducts?: RawSerpResultItem[];
  peopleAlsoAsk?: unknown[];
  relatedQueries?: { title?: string; url?: string }[];
  aiOverview?: { content?: string; sources?: { url?: string; title?: string; description?: string }[] } | null;
  [k: string]: unknown;
}

/* ── Normalisation ──────────────────────────────────────────── */

function normalizeItem(
  item: RawSerpResultItem,
  type: SerpResultType,
): NormalizedSerpResult {
  const url = typeof item.url === "string" ? item.url : null;
  const position =
    typeof item.position === "number"
      ? item.position
      : typeof item.adPosition === "number"
        ? item.adPosition
        : null;
  return {
    result_type: type,
    position,
    url,
    normalized_domain: normalizeDomain(url),
    displayed_url: typeof item.displayedUrl === "string" ? item.displayedUrl : null,
    title: typeof item.title === "string" ? item.title : null,
    description: typeof item.description === "string" ? item.description : null,
    image_url: typeof item.imageUrl === "string" ? item.imageUrl : null,
    date_text: typeof item.date === "string" ? item.date : null,
    emphasized_keywords: Array.isArray(item.emphasizedKeywords)
      ? item.emphasizedKeywords.filter((s): s is string => typeof s === "string")
      : [],
    site_links: Array.isArray(item.siteLinks) ? item.siteLinks : [],
    product_info:
      typeof item.productInfo === "object" && item.productInfo !== null
        ? (item.productInfo as Record<string, unknown>)
        : {},
    raw_data: item as unknown as Record<string, unknown>,
  };
}

/* ── Scrape ─────────────────────────────────────────────────── */

export async function scrapeSerpQuery(
  opts: SerpScrapeOptions,
): Promise<SerpScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const query = cleanQuery(opts.query);
  if (!query) {
    throw new Error(`SERP query non valida: "${opts.query}"`);
  }
  const country = (opts.countryCode ?? "it").toLowerCase();
  const language = (opts.languageCode ?? "it").toLowerCase();
  const mobileResults = opts.device === "MOBILE";

  // The actor accepts either `queries` (newline-separated text) or
  // `queriesArray`. We use the array form so commas/newlines in a
  // brand query don't get split by accident.
  const input: Record<string, unknown> = {
    queries: query,
    countryCode: country,
    languageCode: language,
    maxPagesPerQuery: 1,
    mobileResults,
    saveHtml: false,
    includeUnfilteredResults: false,
  };

  console.log(
    `[SERP] Starting: actor=${ACTOR_ID} query="${query}" country=${country} lang=${language} mobile=${mobileResults}`,
  );

  // Cost cap — pay-per-result actor priced at $1.80 / 1000 pages.
  // We request a single page (maxPagesPerQuery: 1 above), so the
  // real cost is always ~$0.0018 per run. We still must declare a
  // run-level cost ceiling because Apify rejects pay-per-result
  // runs whose `maxTotalChargeUsd` falls below $0.50 (the platform
  // minimum, error: `max-total-charge-usd-below-minimum`).
  // The previous `?maxItems=10` was an implicit cap derived from
  // pricePerItem × maxItems = $0.018 which triggered the rejection.
  // We replace it with an explicit $0.50 ceiling — same safety
  // semantics, accepted by the platform.
  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxTotalChargeUsd=0.5`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[SERP] Run created: runId=${runId} datasetId=${datasetId}`);
  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // SERP runs finish in ~5-15s; same 5-min cap as the other scrapers.
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
    console.log(
      `[SERP] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
    );
  }

  if (status !== "SUCCEEDED") {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(
      `[SERP] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s`,
    );
    throw new Error(`SERP actor ${status} after ${elapsed}s (query: "${query}")`);
  }

  console.log(`[SERP] Run succeeded, fetching dataset...`);
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=10`,
    undefined,
    token,
  );
  const items: RawSerpResponse[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(
    `[SERP] Dataset: ${items.length} items. Sample keys: ${items[0] ? Object.keys(items[0]).join(", ") : "empty"}`,
  );

  // The actor returns 1 dataset item per (query, page) — we asked
  // for 1 page so we expect exactly 1 row. Be defensive: if multiple
  // come back, merge their results in order.
  const results: NormalizedSerpResult[] = [];
  let organicCount = 0;
  let paidCount = 0;
  let paidProductsCount = 0;
  let hasAiOverview = false;
  let relatedQueries: { title: string | null; url: string | null }[] = [];
  let peopleAlsoAsk: unknown[] = [];

  for (const page of items) {
    for (const r of page.organicResults ?? []) {
      results.push(normalizeItem(r, "organic"));
      organicCount++;
    }
    for (const r of page.paidResults ?? []) {
      results.push(normalizeItem(r, "paid"));
      paidCount++;
    }
    for (const r of page.paidProducts ?? []) {
      results.push(normalizeItem(r, "paid_product"));
      paidProductsCount++;
    }
    if (page.aiOverview && Array.isArray(page.aiOverview.sources)) {
      hasAiOverview = true;
      for (const s of page.aiOverview.sources) {
        results.push(
          normalizeItem(
            { url: s.url, title: s.title, description: s.description },
            "ai_source",
          ),
        );
      }
    }
    if (Array.isArray(page.relatedQueries)) {
      relatedQueries = page.relatedQueries.map((q) => ({
        title: typeof q.title === "string" ? q.title : null,
        url: typeof q.url === "string" ? q.url : null,
      }));
    }
    if (Array.isArray(page.peopleAlsoAsk)) {
      peopleAlsoAsk = page.peopleAlsoAsk;
    }
  }

  // Pay-per-result: $1.80 / 1000 pages. We always run 1 page per scan.
  const costCu = items.length * (1.8 / 1000);

  return {
    runId,
    results,
    organicCount,
    paidCount,
    paidProductsCount,
    hasAiOverview,
    relatedQueries,
    peopleAlsoAsk,
    rawResponse: (items[0] ?? {}) as Record<string, unknown>,
    costCu,
    credentials: creds,
  };
}
