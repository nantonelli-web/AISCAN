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
 * 2. `silva95gustavo/google-ads-scraper` (current production choice)
 *    - Pay-per-event since 2026-06-12: Ad $1.60/1000, Video download
 *      $4.00/1000, Actor Start $0.00005, platform usage FREE. We do
 *      NOT request video downloads, so in practice we only pay the
 *      Ad event (~$0.0016/ad). Cost is read pay-per-event aware via
 *      computeRunCostUsd() so the daily cap stays accurate.
 *    - Returns the same identifiers PLUS variations[] with headline,
 *      description/body, cta, imageUrl, videoUrl, clickUrl, and
 *      per-region regionStats[]. Resolves the copy/CTA/video gaps
 *      without touching downstream consumers — we map both shapes
 *      onto the same NormalizedAd.
 *
 * Switching: set APIFY_GOOGLE_ACTOR_ID env var on Vercel to the
 * desired actor id. New scans use it; old rows in the DB stay as-is
 * until re-scanned.
 *
 * REMOVED 2026-06-03: `memo23/google-ad-transparency-scraper-cheerio`.
 * It was a $19/mo Rental actor (a model Apify is sunsetting — total
 * sunset 2026-10-01) kept only as a backup; silva superseded it.
 * Setting APIFY_GOOGLE_ACTOR_ID to a memo23/* id now throws on first
 * use so a stale env var can't silently fall back to automation-lab.
 */

import type { NormalizedAd, ScrapeResult } from "./service";
import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const GOOGLE_ACTOR_ID =
  process.env.APIFY_GOOGLE_ACTOR_ID ||
  "automation-lab/google-ads-scraper";
const isSilvaActor = GOOGLE_ACTOR_ID.startsWith("silva95gustavo/");

// memo23 was dismissed 2026-06-03 (see file header). Fail loud instead
// of silently falling back to automation-lab if a stale env var still
// points at it — automation-lab returns no copy/CTA/video and would
// quietly degrade the data.
if (GOOGLE_ACTOR_ID.startsWith("memo23/")) {
  throw new Error(
    `APIFY_GOOGLE_ACTOR_ID="${GOOGLE_ACTOR_ID}" — the memo23 Google actor was dismissed. ` +
      `Use silva95gustavo/google-ads-scraper (or leave unset for automation-lab).`,
  );
}

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

// ─── Run cost, pay-per-event aware ───
/**
 * Total USD charged by an Apify run, correct under BOTH the legacy
 * pay-per-usage model and the new pay-per-event model.
 *
 * Why this is not just `usageTotalUsd`:
 *   silva95gustavo/google-ads-scraper switched to pay-per-event on
 *   2026-06-12 ("Ad $1.60/1000, Video download $4.00/1000,
 *   Actor Start $0.00005, platform usage FREE"). Under that model the
 *   money lives in `chargedEventCounts`, while `usageTotalUsd` (platform
 *   compute/proxy) drops to ≈0. Reading only `usageTotalUsd` would make
 *   the daily cost cap and credit accounting silently UNDER-count the
 *   real spend → runaway-spending risk under the radar of the cap.
 *
 * Apify's docs and field semantics are ambiguous on whether
 * `usageTotalUsd` already folds in event charges. We sidestep the
 * ambiguity with `max(usageTotalUsd, eventsCost)`:
 *   - platform-free PPE actor (silva): usageTotalUsd≈0 → eventsCost wins ✓
 *   - pure pay-per-usage actor (automation-lab): eventsCost=0 → usage wins ✓
 *   - hypothetical actor where usageTotalUsd already includes events:
 *     usageTotalUsd ≥ eventsCost → no double-count ✓
 * The cap can over-estimate slightly but never under-counts, which is
 * the safe direction for a spend guard.
 */
function computeRunCostUsd(runData: unknown): number {
  const data = (runData ?? {}) as Record<string, unknown>;
  const usageTotalUsd =
    typeof data.usageTotalUsd === "number" ? data.usageTotalUsd : 0;

  // Per-event prices published by the actor, keyed by event name.
  const prices: Record<string, number> = {};
  const pricingInfo = data.pricingInfo as Record<string, unknown> | undefined;
  const perEvent = (pricingInfo?.pricingPerEvent as
    | Record<string, unknown>
    | undefined)?.actorChargeEvents as Record<string, unknown> | undefined;
  if (perEvent) {
    for (const [event, cfg] of Object.entries(perEvent)) {
      const price = (cfg as Record<string, unknown>)?.eventPriceUsd;
      if (typeof price === "number") prices[event] = price;
    }
  }

  // Actual counts charged on this run, keyed by event name.
  const counts = data.chargedEventCounts as
    | Record<string, number>
    | undefined;
  let eventsCost = 0;
  if (counts) {
    for (const [event, count] of Object.entries(counts)) {
      if (typeof count !== "number") continue;
      eventsCost += count * (prices[event] ?? 0);
    }
  }

  return Math.max(usageTotalUsd, eventsCost);
}

/** Fetch a run and return its total USD cost (pay-per-event aware). */
async function fetchRunCostUsd(
  runId: string,
  token?: string,
): Promise<number> {
  try {
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    return computeRunCostUsd(runInfo.data);
  } catch {
    return 0;
  }
}

// ─── Persistent webhook registration (replaces ad-hoc) ───
//
// Empirically gli ad-hoc webhooks (passati come query param ?webhooks=
// alla POST /acts/.../runs) venivano scartati silenziosamente da Apify
// nonostante il payload fosse formalmente corretto: Apify non
// registrava NESSUN tentativo di dispatch e i job restavano in
// 'running' indefinitamente. La fix: registrare un webhook PERSISTENTE
// a livello account con `condition.actorId = GOOGLE_ACTOR_ID`. Apify
// invocera' il callback per ogni run dell'actor senza bisogno di
// passare config ad ogni run. Una sola registrazione idempotente al
// primo lancio della function.
//
// Cache module-level: se in questo container abbiamo gia' confermato
// che il webhook esiste, skippiamo le 2 API call (list + check) per
// non rallentare ogni scan. La cache si resetta al cold-start della
// function — best case 1 ms, worst case +200ms ogni cold start.

const webhookEnsuredFor = new Map<string, string>(); // actorId → webhookId

interface WebhookEnsureResult {
  ok: boolean;
  webhookId?: string;
  created?: boolean;
  resolvedActorId?: string;
  requestUrl?: string;
  error?: string;
}

async function resolveActorId(
  actorRef: string,
  token: string,
): Promise<string | null> {
  // Se actorRef e' gia' un id Apify (no slash), passa diretto.
  if (!actorRef.includes("/")) return actorRef;
  // L'API Apify accetta `username~actor-name` come alias del path
  // `username/actor-name` per la URL.
  const slug = actorRef.replace("/", "~");
  const res = await fetch(
    `${APIFY_BASE}/acts/${encodeURIComponent(slug)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { id?: string } };
  return body.data?.id ?? null;
}

/**
 * Idempotent: registra un webhook persistente per `condition.actorId =
 * GOOGLE_ACTOR_ID` che chiama il nostro `/api/apify/webhooks/google-ads`.
 * Se ne esiste gia' uno con stesso (actorId, requestUrl), lo riusa.
 * Restituisce un summary del risultato (no throw — fallisce soft cosi'
 * il caller puo' loggare/continuare e l'utente puo' usare "Recupera
 * dati" come fallback manuale).
 */
async function ensureGoogleAdsWebhookRegistered(
  token: string,
): Promise<WebhookEnsureResult> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET ?? "";
  if (!appUrl || !webhookSecret) {
    return {
      ok: false,
      error: `env vars mancanti: ${[!appUrl && "NEXT_PUBLIC_APP_URL", !webhookSecret && "APIFY_WEBHOOK_SECRET"].filter(Boolean).join(", ")}`,
    };
  }
  const requestUrl = `${appUrl}/api/apify/webhooks/google-ads`;

  const resolvedActorId = await resolveActorId(GOOGLE_ACTOR_ID, token);
  if (!resolvedActorId) {
    return { ok: false, error: `actorId non risolto per ${GOOGLE_ACTOR_ID}` };
  }

  // Cache hit: webhook gia' confermato per questo actor in questo
  // container. Salta list+check.
  const cached = webhookEnsuredFor.get(resolvedActorId);
  if (cached) {
    return {
      ok: true,
      webhookId: cached,
      created: false,
      resolvedActorId,
      requestUrl,
    };
  }

  // List user-level webhooks e cerca quello matching.
  const listRes = await fetch(`${APIFY_BASE}/webhooks?limit=200&desc=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    const t = await listRes.text().catch(() => "");
    return {
      ok: false,
      error: `list webhooks ${listRes.status}: ${t.slice(0, 200)}`,
      resolvedActorId,
      requestUrl,
    };
  }
  const listBody = (await listRes.json()) as {
    data?: {
      items?: Array<{
        id?: string;
        requestUrl?: string;
        isAdHoc?: boolean;
        condition?: { actorId?: string };
      }>;
    };
  };
  // Body usato sia per POST (create) che per PUT (update). NESSUN
  // payloadTemplate: ci affidiamo al default Apify (eventType +
  // eventData{actorRunId, actorId} + resource{id, actId, status,
  // defaultDatasetId, ...}). Il template custom precedente con
  // {{resource.id}} dava problemi sui webhook persistenti — Apify
  // non risolveva le variabili e ci arrivava la stringa letterale
  // come runId, quindi il job lookup falliva e il job DB restava
  // in 'running' (Apify riceveva 200 "ignored" e segnava SUCCEEDED).
  const webhookBody = {
    isAdHoc: false,
    eventTypes: [
      "ACTOR.RUN.SUCCEEDED",
      "ACTOR.RUN.FAILED",
      "ACTOR.RUN.ABORTED",
      "ACTOR.RUN.TIMED_OUT",
    ],
    condition: { actorId: resolvedActorId },
    requestUrl,
    headersTemplate: JSON.stringify({
      "x-aiscan-secret": webhookSecret,
    }),
    // payloadTemplate omesso intenzionalmente → default Apify.
    description: `AISCAN auto-registered: Google Ads finalize callback for ${GOOGLE_ACTOR_ID}`,
  };

  const existing = (listBody.data?.items ?? []).find(
    (w) =>
      w.requestUrl === requestUrl &&
      w.condition?.actorId === resolvedActorId &&
      !w.isAdHoc,
  );
  if (existing?.id) {
    // Riconcilia il webhook esistente con la config nuova: se aveva
    // payloadTemplate (registrato dal codice precedente al fix), un
    // PUT lo riporta a default. Idempotente: se gia' a default,
    // il PUT non cambia niente.
    try {
      await fetch(`${APIFY_BASE}/webhooks/${existing.id}`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(webhookBody),
      });
    } catch {
      /* best-effort: se il PUT fallisce, riusiamo comunque l'esistente */
    }
    webhookEnsuredFor.set(resolvedActorId, existing.id);
    return {
      ok: true,
      webhookId: existing.id,
      created: false,
      resolvedActorId,
      requestUrl,
    };
  }

  // Crea il webhook.
  const createRes = await fetch(`${APIFY_BASE}/webhooks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(webhookBody),
  });
  if (!createRes.ok) {
    const t = await createRes.text().catch(() => "");
    return {
      ok: false,
      error: `create webhook ${createRes.status}: ${t.slice(0, 200)}`,
      resolvedActorId,
      requestUrl,
    };
  }
  const createBody = (await createRes.json()) as { data?: { id?: string } };
  const newId = createBody.data?.id ?? "";
  if (newId) webhookEnsuredFor.set(resolvedActorId, newId);
  return {
    ok: true,
    webhookId: newId,
    created: true,
    resolvedActorId,
    requestUrl,
  };
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

// ─── Raw shape from silva95gustavo/google-ads-scraper ───
//
// Schema confirmed from the actor's public output docs. The
// variations[] array is where the per-creative copy + CTA + media
// land — silva exposes `cta` as an explicit field AND populates
// `headline` / `description` consistently. Video URLs land in
// `variations[].videoUrl`.
//
// Region info: silva returns regionStats[] per region
// (firstShown/lastShown/impressions/surfaceServingStats).

interface SilvaGoogleAdVariation {
  headline?: string | null;
  // The actor returns the description text under `body`, not
  // `description` (verified on a 45-record live dataset
  // 2026-04-30). The public docs were ambiguous on this. Keep
  // `description` as a defensive fallback in case a future
  // version renames it back.
  body?: string | null;
  description?: string | null;
  cta?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  clickUrl?: string | null;
  // base64-encoded brand logo on text ads — not used for now.
  logoUri?: string | null;
  [k: string]: unknown;
}

interface SilvaRegionStats {
  regionCode?: string;
  regionName?: string;
  firstShown?: string;
  lastShown?: string;
  impressions?: { lowerBound?: number; upperBound?: number | null };
  surfaceServingStats?: unknown[];
}

interface SilvaRawGoogleAd {
  adLibraryUrl?: string;
  advertiserId?: string;
  advertiserName?: string;
  creativeId?: string;
  format?: string; // IMAGE | VIDEO | TEXT (uppercase)
  firstShown?: string;
  lastShown?: string;
  numServedDays?: number;
  previewUrl?: string;
  startUrl?: string;
  targeting?: Record<string, unknown>;
  regionStats?: SilvaRegionStats[];
  variations?: SilvaGoogleAdVariation[];
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
   *  Honoured ONLY by the silva actor — its Transparency-Center URL
   *  takes one `region=XX` per call so we expand to N startUrls.
   *  The legacy automation-lab actor has no region knob and ignores
   *  this; its API returns ALL regions regardless. Empty / undefined
   *  falls back to the global "anywhere" sweep (expensive — pass real
   *  countries to keep cost sane). */
  country?: string;
  /** When supplied, the service resolves the Apify token via the
   *  billing helper (getApifyCredentials) so subscription-mode
   *  workspaces use their BYO key. */
  workspaceId?: string;
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

// ─── Normalize: silva95gustavo ───

/**
 * Convert a silva95gustavo row into the shared NormalizedAd shape.
 *
 * Schema is well-documented and consistent — minimal defensive code
 * needed. Critical mapping:
 *
 *   - `format` is UPPERCASE ("IMAGE"|"VIDEO"|"TEXT") — different from
 *     automation-lab ("Image"/"Video"/"Text").
 *   - `firstShown` / `lastShown` exist at root (good) AND inside
 *     regionStats — root is the cross-region span.
 *   - `variations[]` carries per-creative copy + cta + media:
 *     `headline`, `description`, `cta`, `imageUrl`, `videoUrl`,
 *     `clickUrl`.
 *   - `scan_countries` derived from `regionStats[].regionCode` —
 *     same Meta-style semantics so the Benchmarks country filter
 *     works on Google rows for the first time.
 */
function normalizeSilva(
  ad: SilvaRawGoogleAd,
  fallbackRegions: string[] = [],
): NormalizedAd {
  const adId = ad.creativeId ?? "";
  const variant = ad.variations?.[0] ?? {};

  // Active heuristic — same 1-day polling tolerance as the other
  // actors. silva returns lastShown at root in ISO-8601 datetime.
  const todayMs = Date.now();
  const lastShownMs = ad.lastShown
    ? new Date(ad.lastShown).getTime()
    : Number.NaN;
  const ageDays = Number.isFinite(lastShownMs)
    ? (todayMs - lastShownMs) / 86_400_000
    : Number.POSITIVE_INFINITY;
  const isLikelyActive = ad.lastShown == null || ageDays <= 1;
  const status = isLikelyActive ? "ACTIVE" : "INACTIVE";

  // Format → platforms hint (lowercase the bucket so downstream
  // surfaces stay actor-agnostic).
  const fmt = (ad.format ?? "").toLowerCase();
  const platforms: string[] = [];
  if (fmt.includes("video")) platforms.push("youtube");
  if (fmt.includes("text")) platforms.push("google_search");
  if (fmt.includes("image")) platforms.push("display");

  // scan_countries from regionStats — silva returns one entry per
  // region the creative ran in. Fall back to the regions we asked
  // for if the row didn't carry them (defensive — should be rare).
  const regionCodes = (ad.regionStats ?? [])
    .map((r) => r.regionCode)
    .filter((c): c is string => !!c)
    .map((c) => c.toUpperCase());
  const scanCountries =
    regionCodes.length > 0
      ? regionCodes
      : fallbackRegions.length > 0
        ? fallbackRegions.map((r) => r.toUpperCase())
        : null;

  // Description text is in `body` on silva (live-verified
  // 2026-04-30). `description` kept as fallback for forward-compat.
  const bodyText = variant.body ?? variant.description ?? null;

  // Root-level `previewUrl` is silva's "always-on" thumbnail —
  // surfaced by Google Transparency without opening the detail
  // page. We fall back to it when the per-variant URLs are missing
  // (silva sometimes returns `variations: []` on perfectly real
  // ads when the detail-page fetch times out or the ad is in a
  // restricted category). For text ads the previewUrl is the
  // simgad screenshot; for video ads it is the YouTube ytimg
  // thumbnail; for image/shopping it is the product thumb. All
  // three are renderable, so without this fallback those rows show
  // an empty preview tile in the brand list and the ad-detail page.
  const rootPreviewUrl =
    typeof ad.previewUrl === "string" && ad.previewUrl ? ad.previewUrl : null;

  // When variations is empty but previewUrl is a YouTube ytimg
  // thumbnail (i.ytimg.com/vi/{ID}/hqdefault.jpg), reconstruct the
  // YouTube watch URL so the rest of the app can show the play
  // overlay and click-out — the ID is right there in the path.
  let videoUrl = variant.videoUrl ?? null;
  if (!videoUrl && rootPreviewUrl) {
    const ytIdMatch = rootPreviewUrl.match(/i\.ytimg\.com\/vi\/([\w-]{11})\//);
    if (ytIdMatch) {
      videoUrl = `https://www.youtube.com/watch?v=${ytIdMatch[1]}`;
    }
  }

  return {
    ad_archive_id: adId,
    // mirror Meta semantics: map description → ad_text so
    // avg_copy_length and AI Copy analysis pick it up.
    ad_text: bodyText,
    headline: variant.headline ?? null,
    description: bodyText,
    cta: variant.cta ?? null,
    image_url: variant.imageUrl ?? rootPreviewUrl,
    video_url: videoUrl,
    landing_url: variant.clickUrl ?? null,
    platforms: platforms.length > 0 ? platforms : ["google"],
    languages: [],
    start_date: ad.firstShown ? new Date(ad.firstShown).toISOString() : null,
    end_date: isLikelyActive
      ? null
      : ad.lastShown
        ? new Date(ad.lastShown).toISOString()
        : null,
    status,
    raw_data: ad as unknown as Record<string, unknown>,
    scan_countries: scanCountries,
  };
}

/**
 * Dedupe silva records by creativeId. Multi-region scans return
 * one row per (creative × region), which would (a) blow up the DB
 * row count, and (b) collapse to the LAST occurrence on upsert
 * because the unique key is (workspace_id, ad_archive_id, source).
 * We merge `scan_countries` across all duplicates so each surviving
 * row knows every region it was observed in — matches the Meta
 * scrape semantics in service.ts.
 */
function dedupeNormalizedByCreative(records: NormalizedAd[]): NormalizedAd[] {
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
  // Resolve credentials up front. Subscription-mode workspaces with
  // no BYO Apify key throw BillingError("MISSING_KEY","apify") here
  // — caught in the route handler to return a 400 with a clear
  // "configure your Apify key" message.
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const maxAds = opts.maxResults ?? 200;
  const t0 = Date.now();

  // Compute the URL-driven region list FIRST so we can both size
  // resultsLimit per startUrl AND seed scan_countries during
  // normalisation.
  const urlRegionList: string[] = (() => {
    if (!isSilvaActor) return [];
    const regions = (opts.country ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    return regions.length > 0 ? regions : ["anywhere"];
  })();

  // Build actor input. The two actors expect very different shapes:
  //  - automation-lab: { advertiserIds | domains | searchTerms, maxAds }
  //  - silva:          { startUrls: [<Transparency URL>], resultsLimit }
  // We dispatch on isSilvaActor so the rest of the pipeline (poll,
  // fetch, normalize, return) is shared.
  //
  // silva95gustavo enforces resultsLimit PER startUrl, not globally —
  // divide the caller budget by region count and floor at 50 per
  // region so a 5-country scan stays bounded.
  // Niente cap secondario: per brand grossi il partial-save sotto
  // recupera comunque tutto cio' che silva ha scrapato prima dei
  // 280s, quindi tagliare il budget a priori farebbe perdere ads
  // utili (es. Elena Mirò: 200 → ~150-180 salvati partial vs 100
  // → 100 saved clean ma -50/80 ads in meno).
  const silvaResultsLimit = Math.max(
    50,
    Math.floor(maxAds / Math.max(1, urlRegionList.length)),
  );
  const input: Record<string, unknown> = isSilvaActor
    ? {
        resultsLimit: silvaResultsLimit,
        // skipDetails=false (default) means the actor opens each
        // ad's detail page to extract headline / description / cta /
        // clickUrl. Slower than skipDetails=true (which would only
        // walk the listing) but it's the entire reason we picked
        // silva — flipping this to true defeats the purpose. Keep
        // explicit so future code reviewers see the intent.
        skipDetails: false,
        // OCR is opt-in. Useful for Search/Text ads where the copy
        // is rendered as an image asset; significantly slows the
        // scrape (Apify warns) so we stay off until we see whether
        // skipDetails=false alone gives us enough.
        ocr: false,
        // NOTE: pay-per-event since 2026-06-12 — we intentionally do
        // NOT enable any video-download option here. Video URLs come
        // back as strings in variations[].videoUrl; downloading them
        // would trigger silva's $4.00/1000 "Video download" event
        // (vs $1.60/1000 for the "Ad" event we already pay).
      }
    : { maxAds };

  if (isSilvaActor) {
    // silva takes Google Transparency Center URLs as input: one region
    // per URL, with either ?advertiser-id or ?domain= or ?q= as the
    // search axis. Passing region=anywhere triggers a global crawl
    // (the original disaster on Karen Millen — 870 pages, $1+, 3min+)
    // so we always expand to one URL per region from competitor.country.
    const baseUrl = "https://adstransparency.google.com";
    const regionList = urlRegionList;

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
        return `${baseUrl}/?region=${encodeURIComponent(region)}&advertiser=${encodeURIComponent(opts.advertiserName)}`;
      }
      throw new Error(
        "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName",
      );
    }

    // silva95gustavo requires the standard `{ url: "..." }` object
    // form in startUrls (it rejects bare strings with
    // `Items in input.startUrls ... do not contain valid URLs`).
    const urls = regionList.map(urlForRegion);
    input.startUrls = urls.map((url) => ({ url }));
    console.log(
      `[Google Ads] silva startUrls (${regionList.length} regions):`,
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
    `[Google Ads] Starting: actor=${GOOGLE_ACTOR_ID} (mode=${isSilvaActor ? "silva" : "automation-lab"})`,
  );
  console.log(`[Google Ads] Input:`, JSON.stringify(input));

  const actorPath = `/acts/${encodeURIComponent(GOOGLE_ACTOR_ID)}/runs`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[Google Ads] Run created: runId=${runId} datasetId=${datasetId}`);

  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Poll until the run finishes. Cap at 4m 40s per sfruttare quasi
  // tutto il budget Vercel di 5 min, lasciando ~20s per fetch
  // dataset + DB upsert + transient retry. Se l'actor sfora ancora
  // (es. brand grossi tipo Elena Mirò con 300+ pages) salviamo
  // comunque il dataset parziale invece di buttarlo via — vedi
  // ramo `partialSave` qui sotto.
  let status = run.data?.status ?? run.status ?? "RUNNING";
  let pollCount = 0;
  const maxWait = 280 * 1000;

  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - t0 < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 3000));
    pollCount++;
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    console.log(`[Google Ads] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
  }

  // Partial save: anche quando il run non e' SUCCEEDED, Apify
  // conserva nel dataset gli items gia' scritti prima dell'abort.
  // Per brand grossi (es. Elena Mirò con 377 pages × silva
  // skipDetails=false) il caso "run abortito ma ho 142 ads in
  // mano" e' frequente: e' meglio salvare i 142 che buttarli e
  // tornare zero al chiamante.
  let partialSave = false;
  if (status !== "SUCCEEDED") {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.error(`[Google Ads] Run not SUCCEEDED: status=${status} after ${pollCount} polls, ${elapsed}s`);
    // Cost containment: se siamo noi a essere scaduti (status ancora
    // RUNNING/READY), abortiamo l'actor side cosi non continua a
    // consumare crediti Apify a vuoto. Best-effort.
    if (status === "RUNNING" || status === "READY") {
      try {
        await apifyFetch(`/actor-runs/${runId}/abort`, { method: "POST" }, token);
        console.warn(`[Google Ads] Aborted run ${runId} on our side after ${elapsed}s`);
        partialSave = true;
      } catch (abortErr) {
        console.error(
          `[Google Ads] Failed to abort run ${runId}:`,
          abortErr instanceof Error ? abortErr.message : abortErr,
        );
      }
    } else if (status === "ABORTED" || status === "TIMED-OUT" || status === "FAILED") {
      // Run gia' chiuso da Apify per timeout proprio o errore: il
      // dataset puo' comunque contenere items utili.
      partialSave = true;
    }
    if (!partialSave) {
      throw new Error(`Apify run ended with status: ${status}`);
    }
    console.warn(
      `[Google Ads] Partial save: status=${status}, tentiamo di leggere il dataset parziale`,
    );
  }

  // Fetch dataset with pagination. The previous limit=1000 silently
  // dropped any record beyond the first 1k -- a real risk on
  // silva multi-region scans where a brand × 5 countries can
  // easily push past that. Loop until we've drained the dataset
  // or hit a hard 50k safety cap (any brand needing more than 50k
  // ad rows is signalling a bug, not a real volume).
  const items: Array<RawGoogleAd | SilvaRawGoogleAd> = [];
  const pageSize = 1000;
  const safetyCap = 50_000;
  for (let offset = 0; offset < safetyCap; offset += pageSize) {
    const page = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=${pageSize}&offset=${offset}`,
      undefined,
      token,
    );
    const pageItems: Array<RawGoogleAd | SilvaRawGoogleAd> = Array.isArray(page)
      ? page
      : page.items ?? [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    if (pageItems.length < pageSize) break;
  }

  if (items.length === 0) {
    // Se il run e' andato in timeout e il dataset e' anche vuoto,
    // throwiamo: meglio dire al chiamante "scan fallita" cosi il
    // route puo' refundare i crediti.
    if (partialSave) {
      throw new Error(
        `Apify run ended with status: ${status} (no partial items to save)`,
      );
    }
    console.warn(`[Google Ads] Dataset empty after SUCCEEDED run`);
  } else {
    if (partialSave) {
      console.warn(
        `[Google Ads] Partial save: salvati ${items.length} items dal run abortito (status=${status})`,
      );
    }
    // First-run debugging: log the keys of the first item (and the
    // first variant when a Transparency-style actor is in play) so
    // we can spot a real schema and tighten the normaliser without
    // guessing.
    console.log(`[Google Ads] ${items.length} raw items. Sample keys:`, Object.keys(items[0]));
    if (isSilvaActor) {
      const first = items[0] as SilvaRawGoogleAd;
      const variant = first.variations?.[0];
      if (variant) {
        console.log(
          `[Google Ads] Sample variation keys:`,
          Object.keys(variant),
        );
      } else {
        console.warn(
          `[Google Ads] First item has NO variations array — schema may differ; check raw JSON.`,
        );
      }
    }
  }

  let records = items
    .map((it) =>
      isSilvaActor
        ? normalizeSilva(it as SilvaRawGoogleAd, urlRegionList)
        : normalize(it as RawGoogleAd),
    )
    .filter((a): a is NormalizedAd => !!a.ad_archive_id);

  // silva follows advertiser/category links and sometimes returns ads
  // from OTHER advertisers in the search hits (the Luisa Viola sample
  // included Dyson + a generic Shopping listing). When the caller
  // supplied a known `advertiserId`, hard-filter rows whose
  // `raw_data.advertiserId` does not match. Skip the filter when
  // scraping by domain or search-name only — we don't have a
  // ground-truth advertiser id to compare against.
  if (isSilvaActor && opts.advertiserId) {
    const expected = opts.advertiserId;
    const beforeFilter = records.length;
    records = records.filter((r) => {
      const adv = (r.raw_data as Record<string, unknown>)?.advertiserId;
      return typeof adv === "string" ? adv === expected : true;
    });
    if (beforeFilter !== records.length) {
      console.log(
        `[Google Ads] advertiser-id filter: ${beforeFilter} → ${records.length} (dropped ${beforeFilter - records.length} from other advertisers)`,
      );
    }
  } else if (isSilvaActor && opts.advertiserDomain) {
    // No ground-truth advertiserId but we know the domain — Google
    // Transparency drifts cross-advertiser when querying by domain
    // (Luisa Viola sample 2026-04-30 came back with 3 unrelated
    // brands: Dyson/Electrolux/esseshop). The dominant advertiserId
    // in the result set is, in practice, the domain owner; the
    // others are correlated/sponsored noise. Pick the mode and drop
    // the rest. Tie-breaks by first-seen which is fine — real ties
    // on a single-domain scrape are vanishingly rare.
    const counts = new Map<string, number>();
    for (const r of records) {
      const adv = (r.raw_data as Record<string, unknown>)?.advertiserId;
      if (typeof adv === "string" && adv) {
        counts.set(adv, (counts.get(adv) ?? 0) + 1);
      }
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) {
      const beforeFilter = records.length;
      records = records.filter(
        (r) =>
          (r.raw_data as Record<string, unknown>)?.advertiserId === dominant,
      );
      if (beforeFilter !== records.length) {
        console.log(
          `[Google Ads] dominant-advertiser filter: ${beforeFilter} → ${records.length} (kept ${dominant}, dropped ${beforeFilter - records.length} cross-advertiser rows)`,
        );
      }
    }
  }

  // silva emits one row per (creative × region) on multi-region
  // scans. Without dedup the upsert collapses on the unique key
  // `(workspace_id, ad_archive_id, source)` and we keep only the LAST
  // observation, losing scan_countries from the others.
  if (isSilvaActor) {
    const before = records.length;
    records = dedupeNormalizedByCreative(records);
    if (before !== records.length) {
      console.log(
        `[Google Ads] dedup: ${before} → ${records.length} (merged scan_countries on ${before - records.length} duplicates)`,
      );
    }
  }

  // Date filter rimosso intenzionalmente — vedi commento analogo
  // in finalizeGoogleAdsScan. Salviamo tutta la libreria pubblica
  // del brand; il range date e' un filtro di visualizzazione, non
  // di persistenza.

  const costCu = await fetchRunCostUsd(runId, token);

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
    credentials: creds,
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

// ─── Async start/finalize (webhook-driven) ───
//
// scrapeGoogleAds() sopra e' sincrono-bloccante (poll fino a 280s).
// Per brand grossi tipo Elena Mirò (377 pages × silva skipDetails=false
// = ~10min reali) sforiamo il timeout Vercel di 5min.
//
// Async pattern: il route lancia startGoogleAdsScan e ritorna subito
// con runId. Apify chiama il nostro webhook /api/apify/webhooks/
// google-ads quando il run finisce (SUCCEEDED, ABORTED, FAILED,
// TIMED-OUT). Il webhook handler chiama finalizeGoogleAdsScan per
// fetch dataset + normalize + return records → poi persiste su DB.

export interface StartScanResult {
  runId: string;
  datasetId: string;
  actorId: string;
  input: Record<string, unknown>;
  /** URL-driven region list, salvato in scan_options per essere
   *  riusato nel finalize (normalizeSilva ne ha bisogno per scan_countries). */
  urlRegionList: string[];
  /** True se al momento del lancio del run abbiamo passato ad Apify
   *  la config webhooks (cioe' sia APIFY_WEBHOOK_SECRET che
   *  NEXT_PUBLIC_APP_URL erano disponibili nella function env).
   *  Se false → il run NON chiamera' callback al termine e dovra'
   *  essere finalizzato manualmente via /api/apify/scan-google/
   *  reconcile. */
  webhooksConfigured: boolean;
  /** Esito della registrazione del webhook persistente Apify
   *  (`condition.actorId = GOOGLE_ACTOR_ID`). Persistente = una sola
   *  registrazione idempotente per tutti i run dell'actor. */
  webhookRegistration?: WebhookEnsureResult;
  /** Apify credentials usate: il webhook handler le rifetcha dal
   *  workspace_id quindi non serve passarle in giro, ma le ritorniamo
   *  per debug/audit. */
  credentialsHash?: string;
}

/**
 * Fire-and-forget: registra il run su Apify con webhook config e
 * ritorna immediatamente. Niente polling, niente fetch dataset.
 *
 * Il webhook URL deve essere pubblicamente raggiungibile (NEXT_PUBLIC_
 * APP_URL). Apify chiamera' quel URL con l'header x-aiscan-secret =
 * APIFY_WEBHOOK_SECRET cosi possiamo distinguere chiamate legittime
 * da chiamate spoofate.
 */
export async function startGoogleAdsScan(
  opts: GoogleScrapeOptions,
): Promise<StartScanResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const maxAds = opts.maxResults ?? 200;

  const urlRegionList: string[] = (() => {
    if (!isSilvaActor) return [];
    const regions = (opts.country ?? "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    return regions.length > 0 ? regions : ["anywhere"];
  })();

  // Build actor input — stessa logica di scrapeGoogleAds().
  const silvaResultsLimit = Math.max(
    50,
    Math.floor(maxAds / Math.max(1, urlRegionList.length)),
  );
  const input: Record<string, unknown> = isSilvaActor
    ? {
        resultsLimit: silvaResultsLimit,
        skipDetails: false,
        ocr: false,
        // No video-download option — see scrapeGoogleAds(): would
        // trigger silva's $4/1000 "Video download" event.
      }
    : { maxAds };

  if (isSilvaActor) {
    const baseUrl = "https://adstransparency.google.com";
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
        return `${baseUrl}/?region=${encodeURIComponent(region)}&advertiser=${encodeURIComponent(opts.advertiserName)}`;
      }
      throw new Error(
        "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName",
      );
    }
    const urls = urlRegionList.map(urlForRegion);
    input.startUrls = urls.map((url) => ({ url }));
  } else if (opts.advertiserId) {
    input.advertiserIds = [opts.advertiserId];
  } else if (opts.advertiserDomain) {
    const cleaned = cleanAdvertiserDomain(opts.advertiserDomain);
    if (!cleaned) {
      throw new Error(
        `Dominio Google Ads non valido: "${opts.advertiserDomain}". Usa solo il dominio (es. axelarigato.com).`,
      );
    }
    input.domains = [cleaned];
  } else if (opts.advertiserName) {
    input.searchTerms = [opts.advertiserName];
  } else {
    throw new Error(
      "Google Ads scrape requires advertiserId, advertiserDomain, or advertiserName",
    );
  }

  // Cap timeout lato Apify: 30 min e' largo abbastanza per brand
  // giganti (Elena Mirò ~10 min reali). Oltre i 30 min Apify abortira'
  // automaticamente e chiamera' il webhook con ACTOR.RUN.TIMED_OUT.
  const apifyTimeoutSecs = 1800;

  // Webhook config: Apify chiamera' il nostro endpoint a ogni evento
  // del run. Il header x-aiscan-secret e' il "share secret" che
  // distingue chiamate legittime da spoofing.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET ?? "";
  if (!appUrl) {
    console.warn(
      "[Google Ads] NEXT_PUBLIC_APP_URL non settata: webhook non sara' raggiungibile (Apify non potra' callbackare).",
    );
  }
  if (!webhookSecret) {
    console.warn(
      "[Google Ads] APIFY_WEBHOOK_SECRET non settata: il webhook accettera' qualunque payload (insicuro).",
    );
  }
  const webhooks =
    appUrl && webhookSecret
      ? [
          {
            eventTypes: [
              "ACTOR.RUN.SUCCEEDED",
              "ACTOR.RUN.FAILED",
              "ACTOR.RUN.ABORTED",
              "ACTOR.RUN.TIMED_OUT",
            ],
            requestUrl: `${appUrl}/api/apify/webhooks/google-ads`,
            headersTemplate: JSON.stringify({
              "x-aiscan-secret": webhookSecret,
            }),
            payloadTemplate: JSON.stringify({
              eventType: "{{eventType}}",
              runId: "{{resource.id}}",
              status: "{{resource.status}}",
              datasetId: "{{resource.defaultDatasetId}}",
              actorId: "{{resource.actId}}",
            }),
          },
        ]
      : undefined;

  // Registra (o conferma) il webhook persistente PRIMA di lanciare
  // il run. La persistenza significa che Apify chiamera' il callback
  // per ogni run dell'actor automaticamente, senza dover passare
  // ad-hoc config ogni volta. Idempotente: dopo la prima
  // registrazione la cache module-level salta list+check.
  const webhookRegistration = await ensureGoogleAdsWebhookRegistered(
    token,
  ).catch((e: unknown) => ({
    ok: false,
    error: e instanceof Error ? e.message : "ensure threw",
  })) as WebhookEnsureResult;
  if (!webhookRegistration.ok) {
    console.error(
      `[Google Ads start] webhook persistente NON registrato: ${webhookRegistration.error}`,
    );
  } else {
    console.log(
      `[Google Ads start] webhook persistente: ${webhookRegistration.created ? "CREATO" : "gia' esistente"} id=${webhookRegistration.webhookId} actorId=${webhookRegistration.resolvedActorId}`,
    );
  }

  console.log(
    `[Google Ads start] actor=${GOOGLE_ACTOR_ID} (mode=${isSilvaActor ? "silva" : "automation-lab"}) timeoutSecs=${apifyTimeoutSecs} webhook(ad-hoc)=${webhooks ? "yes" : "no"} webhook(persistent)=${webhookRegistration.ok ? "yes" : "no"}`,
  );

  // POST /acts/{actor}/runs?timeout=...&webhooks=...
  // I parametri webhooks possono andare in query (URL-encoded JSON)
  // oppure nel body. Apify accetta entrambi, ma con webhooks complessi
  // (multi-event + headers) e' piu' pulito tenerli nel body... ma
  // Apify documenta solo il query param. Andiamo via query per
  // sicurezza.
  const params = new URLSearchParams();
  params.set("timeout", String(apifyTimeoutSecs));
  if (webhooks) {
    // Apify accetta l'array webhooks come query param base64'd.
    const encoded = Buffer.from(JSON.stringify(webhooks)).toString("base64");
    params.set("webhooks", encoded);
  }
  const actorPath = `/acts/${encodeURIComponent(GOOGLE_ACTOR_ID)}/runs?${params.toString()}`;
  const run = await apifyFetch(
    actorPath,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(
    `[Google Ads start] Run created: runId=${runId} datasetId=${datasetId}`,
  );

  if (!runId || !datasetId) {
    throw new Error("Apify run started but no runId/datasetId returned.");
  }

  return {
    runId,
    datasetId,
    actorId: GOOGLE_ACTOR_ID,
    input,
    urlRegionList,
    webhooksConfigured: !!webhooks || webhookRegistration.ok,
    webhookRegistration,
  };
}

export interface FinalizeScanArgs {
  workspaceId: string;
  runId: string;
  datasetId: string;
  /** Lo stato finale del run come riportato dal webhook
   *  (SUCCEEDED / ABORTED / FAILED / TIMED-OUT). */
  apifyStatus: string;
  /** Opzioni dello scan originale (snapshot salvato in scan_options
   *  al momento della startGoogleAdsScan). Servono per dedup,
   *  advertiser filter, date filter, urlRegionList. */
  opts: GoogleScrapeOptions;
  urlRegionList: string[];
}

export interface FinalizeScanResult {
  records: NormalizedAd[];
  costCu: number;
  /** True se il run e' arrivato a SUCCEEDED; false se abbiamo
   *  recuperato solo un dataset parziale (status != SUCCEEDED ma
   *  dataset con items). */
  complete: boolean;
  rawItemCount: number;
}

/**
 * Webhook-side finalize: fetch dataset (anche parziale), normalize,
 * dedup, filtri client-side, ritorna records + costCu.
 * NON persiste su DB — quella e' responsabilita' del chiamante (il
 * webhook handler) cosi separiamo I/O da business logic.
 */
export async function finalizeGoogleAdsScan(
  args: FinalizeScanArgs,
): Promise<FinalizeScanResult> {
  const { workspaceId, runId, datasetId, apifyStatus, opts } = args;
  const urlRegionList = args.urlRegionList ?? [];

  const creds = await getApifyCredentials(workspaceId);
  const token = creds.token;

  const complete = apifyStatus === "SUCCEEDED";

  // Fetch dataset (anche se non SUCCEEDED — Apify conserva gli items
  // gia' scritti). Stessa pagination + safety cap di scrapeGoogleAds.
  const items: Array<RawGoogleAd | SilvaRawGoogleAd> = [];
  const pageSize = 1000;
  const safetyCap = 50_000;
  for (let offset = 0; offset < safetyCap; offset += pageSize) {
    const page = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=${pageSize}&offset=${offset}`,
      undefined,
      token,
    );
    const pageItems: Array<RawGoogleAd | SilvaRawGoogleAd> = Array.isArray(page)
      ? page
      : page.items ?? [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    if (pageItems.length < pageSize) break;
  }

  console.log(
    `[Google Ads finalize] runId=${runId} status=${apifyStatus} rawItems=${items.length}`,
  );

  if (items.length === 0) {
    const costCu = await fetchRunCostUsd(runId, token);
    return { records: [], costCu, complete, rawItemCount: 0 };
  }

  let records = items
    .map((it) =>
      isSilvaActor
        ? normalizeSilva(it as SilvaRawGoogleAd, urlRegionList)
        : normalize(it as RawGoogleAd),
    )
    .filter((a): a is NormalizedAd => !!a.ad_archive_id);

  // Advertiser filtering (stessa logica di scrapeGoogleAds).
  if (isSilvaActor && opts.advertiserId) {
    const expected = opts.advertiserId;
    records = records.filter((r) => {
      const adv = (r.raw_data as Record<string, unknown>)?.advertiserId;
      return typeof adv === "string" ? adv === expected : true;
    });
  } else if (isSilvaActor && opts.advertiserDomain) {
    const counts = new Map<string, number>();
    for (const r of records) {
      const adv = (r.raw_data as Record<string, unknown>)?.advertiserId;
      if (typeof adv === "string" && adv) {
        counts.set(adv, (counts.get(adv) ?? 0) + 1);
      }
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) {
      records = records.filter(
        (r) =>
          (r.raw_data as Record<string, unknown>)?.advertiserId === dominant,
      );
    }
  }

  if (isSilvaActor) {
    records = dedupeNormalizedByCreative(records);
  }

  // Date filter rimosso intenzionalmente. Strategia: la libreria
  // Google Ads pubblica di un brand viene salvata in DB nella sua
  // interezza (tutti gli ads ancora visibili, indipendentemente da
  // firstShown). Il range date passato al route resta come metadata
  // sul mait_scrape_jobs (audit "ho lanciato uno scan per gli ultimi
  // 30 giorni") ma NON taglia cosa va in mait_ads_external. Il
  // filtro per data e' applicato a runtime sulle view (benchmark,
  // library, AI analysis) lavorando su tutti i record salvati. Cosi'
  // un cambio di range non costa un nuovo scan.

  const costCu = await fetchRunCostUsd(runId, token);

  console.log(
    `[Google Ads finalize] Done: rawItems=${items.length} → normalized=${records.length}, costCu=$${costCu.toFixed(3)}, complete=${complete}`,
  );

  return { records, costCu, complete, rawItemCount: items.length };
}
