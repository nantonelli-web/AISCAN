/**
 * Service layer for the streamers/youtube-channel-scraper actor.
 * Same REST pattern as the Instagram, TikTok, Meta and Snapchat
 * scrapers — no SDK dependency.
 *
 * Actor: streamers/youtube-channel-scraper
 * Pricing: pay-per-result, $0.50 / 1000 videos.
 *
 * Schema verified live on 2026-04-28 against @Nike — see
 * `project_new_actors_plan.md`. The actor returns one item per video
 * with the full channel snapshot duplicated under
 * `aboutChannelInfo`. We split that into TWO normalized shapes:
 * - one channel snapshot (NormalizedYouTubeChannel) folded from the
 *   first item's aboutChannelInfo
 * - many video posts (NormalizedYouTubeVideo[]) one per item
 *
 * Two text fields need parsing:
 * - `duration` ("1:54" or "1:23:45") → seconds
 * - `date` ("1 month ago") → approximate timestamp (the actor never
 *   exposes the exact upload date, so we settle for the relative
 *   one and keep the raw string in `posted_relative` for transparency)
 */

import { getApifyCredentials } from "@/lib/billing/credentials";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "streamers/youtube-channel-scraper";

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

export interface NormalizedYouTubeChannel {
  channel_id: string | null;
  channel_username: string | null;
  channel_url: string | null;
  input_channel_url: string | null;
  channel_name: string | null;
  channel_description: string | null;
  channel_location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
  is_age_restricted: boolean;
  subscriber_count: number;
  total_videos: number;
  total_views: number;
  description_links: { text: string | null; url: string | null }[];
  channel_joined_at: string | null;
  scraped_at: string;
  raw_data: Record<string, unknown>;
}

export interface NormalizedYouTubeVideo {
  video_id: string;
  video_url: string | null;
  channel_id: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  type: string | null;
  duration_seconds: number | null;
  view_count: number;
  like_count: number | null;
  comment_count: number | null;
  posted_at: string | null;
  posted_relative: string | null;
  raw_data: Record<string, unknown>;
}

export interface YouTubeScrapeResult {
  runId: string;
  channel: NormalizedYouTubeChannel | null;
  videos: NormalizedYouTubeVideo[];
  costCu: number;
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

export interface YouTubeScrapeOptions {
  /** Bare handle, @handle, /channel/UC... URL or full youtube.com URL — accepted in any form. */
  channelUrl: string;
  /** Max videos per scan. Defaults to 30 to mirror the Instagram/TikTok defaults. */
  maxVideos?: number;
  workspaceId?: string;
}

/* ── URL normalisation ──────────────────────────────────────── */

/**
 * Accept whatever the user typed and return a canonical YouTube URL
 * the actor will accept. Returns null when the input cannot be coerced.
 *
 * Recognised shapes:
 *   - bare handle / @handle
 *   - youtube.com/@handle
 *   - youtube.com/c/<custom>
 *   - youtube.com/channel/UC...
 *   - youtube.com/user/<legacy>
 */
export function cleanYouTubeChannelUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  // Already a full URL — keep it intact (the actor accepts /@handle,
  // /c/, /channel/, /user/ paths interchangeably).
  const urlMatch = v.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[A-Za-z0-9._-]+|c\/[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|user\/[A-Za-z0-9._-]+)/i,
  );
  if (urlMatch) {
    return `https://www.youtube.com/${urlMatch[1]}`;
  }

  // Plain handle — strip leading @ if present and re-attach it.
  const cleanHandle = v.replace(/^@/, "").replace(/[/?#].*$/, "");
  if (!cleanHandle || !/^[A-Za-z0-9._-]+$/.test(cleanHandle)) return null;
  return `https://www.youtube.com/@${cleanHandle}`;
}

/* ── Parsers ────────────────────────────────────────────────── */

/**
 * Convert YouTube's "MM:SS" or "HH:MM:SS" duration string to seconds.
 * Returns null on invalid input — never invent a duration.
 */
export function parseDurationToSeconds(
  raw: string | null | undefined,
): number | null {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [m, s] = nums;
    return m * 60 + s;
  }
  const [h, m, s] = nums;
  return h * 3600 + m * 60 + s;
}

/**
 * Convert YouTube's relative date ("1 month ago", "5 days ago") to
 * an approximate ISO timestamp. The actor never exposes the exact
 * upload date, so this is a best-effort estimate — the raw string
 * is also stored in `posted_relative` for transparency. Returns null
 * when the input is unparseable.
 */
export function parseRelativeDate(
  raw: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw
    .toLowerCase()
    .trim()
    .match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n < 0) return null;

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY; // approximate
  const YEAR = 365 * DAY; // approximate

  const factor: Record<string, number> = {
    second: SECOND,
    minute: MINUTE,
    hour: HOUR,
    day: DAY,
    week: WEEK,
    month: MONTH,
    year: YEAR,
  };
  const ms = factor[unit];
  if (!ms) return null;
  return new Date(now.getTime() - n * ms).toISOString();
}

/**
 * YouTube's channel "joined" string is a US-style date ("Mar 7, 2006").
 * `new Date()` parses this in every JS engine; we wrap it just to
 * filter out NaN and surface a stable ISO string.
 */
export function parseChannelJoinedDate(
  raw: string | null | undefined,
): string | null {
  if (!raw || typeof raw !== "string") return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/* ── Raw shapes ─────────────────────────────────────────────── */

/** One item from streamers/youtube-channel-scraper. The actor
 *  duplicates the channel snapshot on every item under
 *  `aboutChannelInfo` AND repeats most fields at the top level —
 *  we read from `aboutChannelInfo` because that nesting is stable. */
interface RawYouTubeItem {
  id?: string;
  title?: string;
  duration?: string;
  channelName?: string;
  channelUsername?: string;
  channelUrl?: string;
  date?: string;
  url?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  thumbnailUrl?: string;
  fromYTUrl?: string;
  type?: string;
  description?: string;
  channelDescription?: string;
  aboutChannelInfo?: {
    channelDescription?: string;
    channelJoinedDate?: string;
    channelDescriptionLinks?: { text?: string; url?: string }[];
    channelLocation?: string | null;
    channelUsername?: string;
    channelAvatarUrl?: string;
    channelBannerUrl?: string;
    channelTotalVideos?: number;
    channelTotalViews?: number;
    numberOfSubscribers?: number;
    isChannelVerified?: boolean;
    channelName?: string;
    channelUrl?: string;
    channelId?: string;
    inputChannelUrl?: string;
    isAgeRestricted?: boolean;
  };
  [k: string]: unknown;
}

/* ── Normalisation ──────────────────────────────────────────── */

function normalizeVideo(v: RawYouTubeItem): NormalizedYouTubeVideo | null {
  const id = (v.id ?? "").trim();
  if (!id) return null;
  const channelId = v.aboutChannelInfo?.channelId ?? null;
  return {
    video_id: id,
    video_url: v.url ?? null,
    channel_id: channelId,
    title: v.title ?? null,
    description: v.description ?? null,
    thumbnail_url: v.thumbnailUrl ?? null,
    type: typeof v.type === "string" ? v.type : null,
    duration_seconds: parseDurationToSeconds(v.duration),
    view_count: typeof v.viewCount === "number" ? v.viewCount : 0,
    like_count: typeof v.likeCount === "number" ? v.likeCount : null,
    comment_count: typeof v.commentCount === "number" ? v.commentCount : null,
    posted_at: parseRelativeDate(v.date),
    posted_relative: typeof v.date === "string" ? v.date : null,
    raw_data: v as unknown as Record<string, unknown>,
  };
}

function channelFromItems(
  items: RawYouTubeItem[],
): NormalizedYouTubeChannel | null {
  for (const item of items) {
    const a = item.aboutChannelInfo;
    if (!a) continue;
    const desc = a.channelDescription ?? null;
    return {
      channel_id: a.channelId ?? null,
      channel_username: a.channelUsername ?? null,
      channel_url: a.channelUrl ?? null,
      input_channel_url: a.inputChannelUrl ?? null,
      channel_name: a.channelName ?? null,
      channel_description: desc,
      channel_location: a.channelLocation ?? null,
      avatar_url: a.channelAvatarUrl ?? null,
      banner_url: a.channelBannerUrl ?? null,
      is_verified: a.isChannelVerified === true,
      is_age_restricted: a.isAgeRestricted === true,
      subscriber_count:
        typeof a.numberOfSubscribers === "number" ? a.numberOfSubscribers : 0,
      total_videos:
        typeof a.channelTotalVideos === "number" ? a.channelTotalVideos : 0,
      total_views:
        typeof a.channelTotalViews === "number" ? a.channelTotalViews : 0,
      description_links: Array.isArray(a.channelDescriptionLinks)
        ? a.channelDescriptionLinks.map((l) => ({
            text: typeof l?.text === "string" ? l.text : null,
            url: typeof l?.url === "string" ? l.url : null,
          }))
        : [],
      channel_joined_at: parseChannelJoinedDate(a.channelJoinedDate),
      scraped_at: new Date().toISOString(),
      raw_data: a as unknown as Record<string, unknown>,
    };
  }
  return null;
}

/* ── Channel scrape ─────────────────────────────────────────── */

export async function scrapeYouTubeChannel(
  opts: YouTubeScrapeOptions,
): Promise<YouTubeScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

  const maxVideos = opts.maxVideos ?? 30;
  const channelUrl = cleanYouTubeChannelUrl(opts.channelUrl);
  if (!channelUrl) {
    throw new Error(
      `YouTube channel URL non valido: "${opts.channelUrl}". Usa l'URL canale (es. https://www.youtube.com/@nike) o l'handle.`,
    );
  }

  // The actor accepts startUrls in the {url, method} shape and pulls
  // a video listing from the channel's /videos page. We disable
  // shorts and streams here to keep the scan focused on regular
  // uploads — adding them back is a future iteration.
  const input: Record<string, unknown> = {
    startUrls: [{ url: channelUrl, method: "GET" }],
    maxResults: maxVideos,
    maxResultsShorts: 0,
    maxResultStreams: 0,
    sortVideosBy: "NEWEST",
  };

  console.log(
    `[YouTube] Starting: actor=${ACTOR_ID} url=${channelUrl} max=${maxVideos}`,
  );

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxVideos}`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[YouTube] Run created: runId=${runId} datasetId=${datasetId}`);
  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Poll until the run finishes — same 5-min cap as Instagram/TikTok.
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
      `[YouTube] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`,
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
      `[YouTube] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s${errorDetail}`,
    );
    throw new Error(
      `YouTube actor ${status} after ${elapsed}s (url: ${channelUrl})`,
    );
  }

  console.log(`[YouTube] Run succeeded, fetching dataset...`);
  const dataset = await apifyFetch(
    `/datasets/${datasetId}/items?format=json&limit=1000`,
    undefined,
    token,
  );
  const items: RawYouTubeItem[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(
    `[YouTube] Dataset: ${items.length} items. Sample keys: ${items[0] ? Object.keys(items[0]).join(", ") : "empty"}`,
  );

  const videos = items
    .map(normalizeVideo)
    .filter((v): v is NormalizedYouTubeVideo => v !== null);
  const channel = channelFromItems(items);

  // Cost estimate: pay-per-result $0.50 / 1000 videos.
  const costCu = items.length * (0.5 / 1000);

  return {
    runId,
    channel,
    videos,
    costCu,
    credentials: creds,
  };
}
