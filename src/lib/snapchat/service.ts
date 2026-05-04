/**
 * Service layer for the automation-lab/snapchat-scraper actor.
 * Same REST pattern as the Instagram, TikTok and Meta scrapers — no
 * SDK dependency.
 *
 * Actor: automation-lab/snapchat-scraper
 * Pricing: pay-per-event, ~$1.30–$2.01 per 1000 results.
 *
 * Snapchat is fundamentally different from TikTok / Instagram: there
 * is no per-post entity (stories vanish in 24h, spotlights/highlights
 * are exposed only as counters). One scan = one profile snapshot.
 * The historical trend lives in `mait_snapchat_profiles` (one row per
 * scan) and the latest snapshot is mirrored on
 * `mait_competitors.snapchat_profile`.
 *
 * Schema verified live on 2026-04-28 against @nike — see
 * `project_new_actors_plan.md`.
 */

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "automation-lab/snapchat-scraper";

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

export interface NormalizedSnapchatProfile {
  username: string;
  display_name: string | null;
  profile_url: string | null;
  profile_type: string | null;
  business_profile_id: string | null;

  bio: string | null;
  website_url: string | null;
  category: string | null;
  subcategory: string | null;
  is_verified: boolean;
  address: string | null;

  profile_picture_url: string | null;
  snapcode_image_url: string | null;
  hero_image_url: string | null;

  subscriber_count: number;
  lens_count: number;
  highlight_count: number;
  spotlight_count: number;

  has_story: boolean;
  has_curated_highlights: boolean;
  has_spotlight_highlights: boolean;

  related_accounts: unknown[];

  account_created_at: string | null;
  profile_updated_at: string | null;
  scraped_at: string;

  raw_data: Record<string, unknown>;
}

export interface SnapchatScrapeResult {
  runId: string;
  profile: NormalizedSnapchatProfile | null;
  costCu: number;
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

export interface SnapchatScrapeOptions {
  /** Bare handle, @handle, or full snapchat.com/add/<handle> URL. */
  username: string;
  workspaceId?: string;
}

/* ── Username cleaning ──────────────────────────────────────── */

/**
 * Accept whatever the user typed — bare handle, @handle, or full
 * profile URL — and return the canonical handle. Snapchat handles
 * allow letters, digits, dot, dash and underscore (3–15 chars in
 * practice but we don't enforce length, the actor will reject bad
 * ones). Returns null when the input cannot be coerced.
 */
export function cleanSnapchatHandle(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let v = raw.trim();
  // snapchat.com/add/<handle>  OR  snapchat.com/<handle>
  const urlMatch = v.match(
    /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/(?:add\/)?([A-Za-z0-9._-]+)/i,
  );
  if (urlMatch) v = urlMatch[1];
  v = v.replace(/^@/, "");
  v = v.replace(/[/?#].*$/, "");
  if (!v || !/^[A-Za-z0-9._-]+$/.test(v)) return null;
  return v;
}

/* ── Profile scrape ─────────────────────────────────────────── */

/** Raw shape returned by automation-lab/snapchat-scraper. Only the
 *  fields we consume are typed; the rest is preserved in raw_data. */
interface RawSnapchatProfile {
  username?: string;
  displayName?: string;
  profileType?: string;
  subscriberCount?: number;
  bio?: string;
  websiteUrl?: string;
  isVerified?: boolean;
  category?: string | null;
  subcategory?: string | null;
  profilePictureUrl?: string;
  snapcodeImageUrl?: string;
  heroImageUrl?: string;
  hasStory?: boolean;
  hasCuratedHighlights?: boolean;
  hasSpotlightHighlights?: boolean;
  lensCount?: number;
  highlightCount?: number;
  spotlightCount?: number;
  relatedAccounts?: unknown[];
  createdAt?: string;
  lastUpdatedAt?: string;
  businessProfileId?: string;
  address?: string;
  url?: string;
  [k: string]: unknown;
}

function normalizeProfile(
  p: RawSnapchatProfile,
): NormalizedSnapchatProfile | null {
  const username = (p.username ?? "").trim();
  if (!username) return null;
  return {
    username,
    display_name: p.displayName ?? null,
    profile_url: p.url ?? null,
    profile_type: p.profileType ?? null,
    business_profile_id: p.businessProfileId ?? null,

    bio: p.bio ?? null,
    website_url: p.websiteUrl ?? null,
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
    is_verified: p.isVerified === true,
    address: p.address ?? null,

    profile_picture_url: p.profilePictureUrl ?? null,
    snapcode_image_url: p.snapcodeImageUrl ?? null,
    hero_image_url: p.heroImageUrl ?? null,

    subscriber_count:
      typeof p.subscriberCount === "number" ? p.subscriberCount : 0,
    lens_count: typeof p.lensCount === "number" ? p.lensCount : 0,
    highlight_count:
      typeof p.highlightCount === "number" ? p.highlightCount : 0,
    spotlight_count:
      typeof p.spotlightCount === "number" ? p.spotlightCount : 0,

    has_story: p.hasStory === true,
    has_curated_highlights: p.hasCuratedHighlights === true,
    has_spotlight_highlights: p.hasSpotlightHighlights === true,

    related_accounts: Array.isArray(p.relatedAccounts) ? p.relatedAccounts : [],

    account_created_at:
      typeof p.createdAt === "string" && p.createdAt ? p.createdAt : null,
    profile_updated_at:
      typeof p.lastUpdatedAt === "string" && p.lastUpdatedAt
        ? p.lastUpdatedAt
        : null,
    scraped_at: new Date().toISOString(),

    raw_data: p as unknown as Record<string, unknown>,
  };
}

export async function scrapeSnapchatProfile(
  opts: SnapchatScrapeOptions,
): Promise<SnapchatScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const handle = cleanSnapchatHandle(opts.username);
  if (!handle) {
    throw new Error(
      `Snapchat handle non valido: "${opts.username}". Usa solo l'handle (es. nike), senza @ o URL.`,
    );
  }

  // The actor accepts an array of usernames — we always send exactly
  // one because each AISCAN scan is bound to a single competitor.
  // Plain HTTP via CheerioCrawler, no proxy needed (the actor falls
  // back to its own datacenter pool internally if Snapchat blocks).
  const input: Record<string, unknown> = {
    usernames: [handle],
  };

  console.log(`[Snapchat] Starting: actor=${ACTOR_ID} user=${handle}`);

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[Snapchat] Run created: runId=${runId} datasetId=${datasetId}`);
  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Cheerio actor → 2-second-per-profile expected; cap at 3 min so
  // a stuck run does not block the user. Same 5-second cadence as
  // the other scrapers for log-line consistency.
  let status = run.data?.status ?? run.status ?? "RUNNING";
  const startTime = Date.now();
  const maxWait = 3 * 60 * 1000;
  let pollCount = 0;
  while (
    (status === "RUNNING" || status === "READY") &&
    Date.now() - startTime < maxWait
  ) {
    await new Promise((r) => setTimeout(r, 5000));
    pollCount++;
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    console.log(
      `[Snapchat] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
    );
  }

  if (status !== "SUCCEEDED") {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(
      `[Snapchat] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s`,
    );
    throw new Error(
      `Snapchat actor ${status} after ${elapsed}s (user: ${handle})`,
    );
  }

  console.log(`[Snapchat] Run succeeded, fetching dataset...`);
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=1`,
    undefined,
    token,
  );
  const items: RawSnapchatProfile[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(
    `[Snapchat] Dataset: ${items.length} items. Sample keys: ${items[0] ? Object.keys(items[0]).join(", ") : "empty"}`,
  );

  const profile = items[0] ? normalizeProfile(items[0]) : null;

  // 1 result = ~$0.0017 average. Keep the costCu shape in the same
  // unit as the other actors (USD) so the credit ledger doesn't need
  // a special case.
  const costCu = items.length * (1.7 / 1000);

  return {
    runId,
    profile,
    costCu,
    credentials: creds,
  };
}
