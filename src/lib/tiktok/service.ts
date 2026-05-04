/**
 * Service layer for the clockworks/tiktok-scraper actor.
 * Uses the Apify REST API directly (no SDK), same pattern as the
 * Instagram and Meta scrapers.
 *
 * Actor: clockworks/tiktok-scraper
 * Pricing: $1.70 / 1000 results (pay-per-event)
 * Notes:
 *   - TikTok blocks aggressively from datacenter IPs; we always go
 *     through Apify residential proxies. The actor accepts
 *     `proxyConfiguration.proxyCountryCode` for geo-coherent results
 *     — we pick the first country from the competitor CSV.
 *   - Profile URL must be `https://www.tiktok.com/@<handle>`.
 *   - The actor surface a video's metadata + author snapshot in the
 *     same item; we extract both into `NormalizedTikTokPost` and the
 *     latest profile snapshot is exposed on the side via the dedicated
 *     scrape entrypoint.
 */

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "clockworks/tiktok-scraper";

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

export interface NormalizedTikTokPost {
  post_id: string;
  post_url: string | null;
  caption: string | null;
  text_language: string | null;
  cover_url: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  is_slideshow: boolean;
  is_pinned: boolean;
  is_ad: boolean;
  is_sponsored: boolean;
  play_count: number;
  digg_count: number;
  share_count: number;
  comment_count: number;
  collect_count: number;
  music_id: string | null;
  music_name: string | null;
  music_author: string | null;
  music_original: boolean | null;
  hashtags: string[];
  mentions: string[];
  posted_at: string | null;
  raw_data: Record<string, unknown>;
}

export interface TikTokProfile {
  username: string;
  nickName: string | null;
  bio: string | null;
  bioLink: string | null;
  avatarUrl: string | null;
  verified: boolean;
  followers: number | null;
  following: number | null;
  totalLikes: number | null;
  videoCount: number | null;
  fetchedAt: string;
}

export interface TikTokScrapeResult {
  runId: string;
  records: NormalizedTikTokPost[];
  profile: TikTokProfile | null;
  costCu: number;
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

export interface TikTokScrapeOptions {
  /** Bare handle, @handle, or full TikTok URL — accepted in any form. */
  username: string;
  /** Max posts per scan. Defaults to 30 to mirror the Instagram default. */
  maxPosts?: number;
  /** ISO alpha-2 country code (e.g. "IT", "FR") for residential proxy
   *  geo-targeting. Falls back to no country pin when omitted. */
  country?: string;
  /** BYO dispatch hook (Phase 3). */
  workspaceId?: string;
}

/* ── Username cleaning ──────────────────────────────────────── */

/**
 * Accept whatever the user typed — bare handle, @handle, or full
 * profile URL — and return the canonical handle. TikTok handles can
 * include letters, digits, underscore and dot. Returns null when the
 * input cannot be coerced into a valid handle.
 */
export function cleanTikTokUsername(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let v = raw.trim();
  const urlMatch = v.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)/i);
  if (urlMatch) v = urlMatch[1];
  v = v.replace(/^@/, "");
  v = v.replace(/[/?#].*$/, "");
  if (!v || !/^[A-Za-z0-9._]+$/.test(v)) return null;
  return v;
}

/* ── Country pin ────────────────────────────────────────────── */

/**
 * `mait_competitors.country` is a CSV ("IT,DE,FR,ES,GB"). The TikTok
 * actor accepts a single ISO code per run. We pin the residential
 * proxy to the FIRST country in the CSV — the brand's primary market —
 * to get geo-coherent rankings and recommendations.
 */
function pickPrimaryCountry(country?: string | null): string | undefined {
  if (!country) return undefined;
  const first = country
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .find((s) => /^[A-Z]{2}$/.test(s));
  return first;
}

/* ── Posts scrape ───────────────────────────────────────────── */

/** Raw shape of one item from clockworks/tiktok-scraper. Only the
 *  fields we consume are typed; the rest is preserved in raw_data. */
interface RawTikTokVideo {
  id?: string;
  text?: string;
  textLanguage?: string;
  createTime?: number;
  createTimeISO?: string;
  webVideoUrl?: string;
  isAd?: boolean;
  isPinned?: boolean;
  isSponsored?: boolean;
  isSlideshow?: boolean;
  videoMeta?: {
    height?: number;
    width?: number;
    duration?: number;
    coverUrl?: string;
    definition?: string;
    format?: string;
    downloadAddr?: string;
    playAddr?: string;
  };
  diggCount?: number;
  shareCount?: number;
  playCount?: number;
  collectCount?: number;
  commentCount?: number;
  musicMeta?: {
    musicId?: string;
    musicName?: string;
    musicAuthor?: string;
    musicOriginal?: boolean;
    playUrl?: string;
    coverMediumUrl?: string;
  };
  authorMeta?: {
    id?: string;
    name?: string;
    nickName?: string;
    profileUrl?: string;
    verified?: boolean;
    signature?: string;
    bioLink?: string;
    avatar?: string;
    avatarMedium?: string;
    avatarLarger?: string;
    fans?: number;
    following?: number;
    heart?: number;
    video?: number;
    digg?: number;
  };
  hashtags?: Array<{ id?: string; name?: string; title?: string; cover?: string }>;
  detailedMentions?: Array<{ name?: string }>;
  mentions?: string[];
  [k: string]: unknown;
}

function normalizePost(v: RawTikTokVideo): NormalizedTikTokPost {
  const id = String(v.id ?? "");
  const hashtags = Array.isArray(v.hashtags)
    ? v.hashtags
        .map((h) => (typeof h?.name === "string" ? h.name : null))
        .filter((s): s is string => !!s)
    : [];
  const mentions: string[] = [];
  if (Array.isArray(v.detailedMentions)) {
    for (const m of v.detailedMentions) {
      if (typeof m?.name === "string" && m.name) mentions.push(m.name);
    }
  } else if (Array.isArray(v.mentions)) {
    for (const m of v.mentions) {
      if (typeof m === "string" && m) mentions.push(m);
    }
  }
  const posted =
    (typeof v.createTimeISO === "string" && v.createTimeISO) ||
    (typeof v.createTime === "number" && v.createTime > 0
      ? new Date(v.createTime * 1000).toISOString()
      : null);
  // Prefer the playable URL when the actor exposes it; the canonical
  // share URL (webVideoUrl) is always populated, the direct mp4 only
  // sometimes — we store it only when present for hover-preview UX.
  const directVideo =
    v.videoMeta?.playAddr ?? v.videoMeta?.downloadAddr ?? null;

  return {
    post_id: id,
    post_url: v.webVideoUrl ?? null,
    caption: v.text ?? null,
    text_language: v.textLanguage ?? null,
    cover_url: v.videoMeta?.coverUrl ?? null,
    video_url: directVideo,
    duration_seconds:
      typeof v.videoMeta?.duration === "number" ? v.videoMeta.duration : null,
    is_slideshow: v.isSlideshow === true,
    is_pinned: v.isPinned === true,
    is_ad: v.isAd === true,
    is_sponsored: v.isSponsored === true,
    play_count: v.playCount ?? 0,
    digg_count: v.diggCount ?? 0,
    share_count: v.shareCount ?? 0,
    comment_count: v.commentCount ?? 0,
    collect_count: v.collectCount ?? 0,
    music_id: v.musicMeta?.musicId ?? null,
    music_name: v.musicMeta?.musicName ?? null,
    music_author: v.musicMeta?.musicAuthor ?? null,
    music_original:
      typeof v.musicMeta?.musicOriginal === "boolean"
        ? v.musicMeta.musicOriginal
        : null,
    hashtags,
    mentions,
    posted_at: posted,
    raw_data: v as unknown as Record<string, unknown>,
  };
}

/**
 * Fold the FIRST item's `authorMeta` into a stable `TikTokProfile`
 * snapshot — TikTok exposes the same author payload on every video,
 * so we just pick one. Returns null when the dataset is empty.
 */
function profileFromVideos(items: RawTikTokVideo[]): TikTokProfile | null {
  for (const item of items) {
    const a = item.authorMeta;
    if (!a) continue;
    const handle = a.name?.trim();
    if (!handle) continue;
    return {
      username: handle,
      nickName: a.nickName ?? null,
      bio: a.signature ?? null,
      bioLink: a.bioLink ?? null,
      avatarUrl: a.avatarLarger ?? a.avatarMedium ?? a.avatar ?? null,
      verified: a.verified === true,
      followers: typeof a.fans === "number" ? a.fans : null,
      following: typeof a.following === "number" ? a.following : null,
      totalLikes: typeof a.heart === "number" ? a.heart : null,
      videoCount: typeof a.video === "number" ? a.video : null,
      fetchedAt: new Date().toISOString(),
    };
  }
  return null;
}

export async function scrapeTikTokPosts(
  opts: TikTokScrapeOptions,
): Promise<TikTokScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const maxPosts = opts.maxPosts ?? 30;
  const handle = cleanTikTokUsername(opts.username);
  if (!handle) {
    throw new Error(
      `TikTok username non valido: "${opts.username}". Usa solo l'handle (es. sezane), senza @ o URL.`,
    );
  }

  // Residential proxy is mandatory for TikTok — datacenter IPs trip
  // their bot detection within a few requests. The actor's own input
  // schema accepts proxyConfiguration in the standard Apify shape.
  const proxyCountry = pickPrimaryCountry(opts.country);
  const input: Record<string, unknown> = {
    profiles: [handle],
    resultsPerPage: maxPosts,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      ...(proxyCountry ? { apifyProxyCountry: proxyCountry } : {}),
    },
  };

  console.log(
    `[TikTok] Starting: actor=${ACTOR_ID} user=${handle} max=${maxPosts} country=${proxyCountry ?? "-"}`,
  );

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxPosts}`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[TikTok] Run created: runId=${runId} datasetId=${datasetId}`);
  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Poll until the run finishes — same 5-min cap as Instagram.
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
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    console.log(
      `[TikTok] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
    );
  }

  if (status !== "SUCCEEDED") {
    let errorDetail = "";
    try {
      const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
      const stats = runInfo.data?.stats ?? runInfo.stats ?? {};
      errorDetail = ` | stats: ${JSON.stringify(stats)}`;
    } catch {
      /* ignore */
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(
      `[TikTok] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s${errorDetail}`,
    );
    throw new Error(
      `TikTok actor ${status} after ${elapsed}s (user: ${handle})`,
    );
  }

  console.log(`[TikTok] Run succeeded, fetching dataset...`);
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=1000`,
    undefined,
    token,
  );
  const items: RawTikTokVideo[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(
    `[TikTok] Dataset: ${items.length} items. Sample keys: ${items[0] ? Object.keys(items[0]).join(", ") : "empty"}`,
  );

  const records = items.map(normalizePost);
  const profile = profileFromVideos(items);

  // Cost estimate: pay-per-event $1.70 / 1000 results. Keep the same
  // costCu shape used by other scrapers so the credit ledger does not
  // need a special case.
  const costCu = items.length * (1.7 / 1000);

  return {
    runId,
    records,
    profile,
    costCu,
    credentials: creds,
  };
}
