/**
 * Service layer for the apify/instagram-scraper actor.
 * Uses the Apify REST API directly (no SDK), same pattern as the ads scraper.
 *
 * Actor: apify/instagram-scraper
 * Pricing: $2.30/1000 posts (pay-per-result)
 * Uses the existing APIFY_API_TOKEN.
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apify/instagram-scraper";

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

// ------- Normalized post shape for DB insertion -------

export interface NormalizedPost {
  post_id: string;
  post_url: string | null;
  post_type: string | null;
  caption: string | null;
  display_url: string | null;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  video_views: number;
  video_play_count: number;
  hashtags: string[];
  mentions: string[];
  tagged_users: string[];
  posted_at: string | null;
  raw_data: Record<string, unknown>;
}

export interface InstagramScrapeResult {
  runId: string;
  records: NormalizedPost[];
  costCu: number;
}

export interface InstagramScrapeOptions {
  username: string;
  maxPosts?: number;
  /** ISO date (YYYY-MM-DD). Posts older than this are skipped by Apify. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD). Posts newer than this are dropped post-fetch. */
  dateTo?: string;
}

/**
 * Extract a clean Instagram handle from whatever the user typed or that was
 * scraped automatically — a bare username, an @handle, or a full profile URL.
 * Returns null if nothing valid can be recovered. Apify's directUrls regex
 * only accepts [A-Za-z0-9._-] in the handle segment.
 */
export function cleanInstagramUsername(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim();
  // Pull handle out of a URL if present
  const urlMatch = v.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._-]+)/i);
  if (urlMatch) v = urlMatch[1];
  v = v.replace(/^@/, "");
  v = v.replace(/[/?#].*$/, "");
  if (!v || !/^[A-Za-z0-9._-]+$/.test(v)) return null;
  return v;
}

/* ── Profile scrape — fetches followers, bio, posts count ─────────
   Uses the same apify/instagram-scraper actor as the posts pipeline,
   just with resultsType: "details". Running a second actor was flaky
   (empty results, no log surface) — reusing the proven one with the
   async+poll pattern lets us actually see errors. */

export interface InstagramProfile {
  username: string;
  fullName: string | null;
  biography: string | null;
  followersCount: number | null;
  followsCount: number | null;
  postsCount: number | null;
  profilePicUrl: string | null;
  verified: boolean;
  isBusinessAccount: boolean;
  businessCategoryName: string | null;
  externalUrl: string | null;
  fetchedAt: string;
}

interface RawInstagramProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  profilePicUrlHD?: string;
  profilePicUrl?: string;
  verified?: boolean;
  isBusinessAccount?: boolean;
  businessCategoryName?: string;
  externalUrl?: string;
  [k: string]: unknown;
}

export async function scrapeInstagramProfile(
  usernameInput: string
): Promise<InstagramProfile | null> {
  const handle = cleanInstagramUsername(usernameInput);
  if (!handle) {
    console.warn(`[Instagram profile] invalid handle: ${usernameInput}`);
    return null;
  }

  try {
    const input = {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      resultsLimit: 1,
    };

    console.log(`[Instagram profile] Starting: user=${handle}`);

    const run = await apifyFetch(
      `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=1`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );

    const runId: string = run.data?.id ?? run.id ?? "";
    const datasetId: string =
      run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";
    if (!datasetId) {
      throw new Error("no datasetId returned from profile run");
    }

    let status = run.data?.status ?? run.status ?? "RUNNING";
    const start = Date.now();
    const maxWait = 2 * 60 * 1000;
    while (
      (status === "RUNNING" || status === "READY") &&
      Date.now() - start < maxWait
    ) {
      await new Promise((r) => setTimeout(r, 3000));
      const info = await apifyFetch(`/actor-runs/${runId}`);
      status = info.data?.status ?? info.status ?? status;
    }

    if (status !== "SUCCEEDED") {
      throw new Error(
        `profile actor ${status} after ${Math.round((Date.now() - start) / 1000)}s (${handle})`
      );
    }

    const ds = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=5`
    );
    const list: RawInstagramProfile[] = Array.isArray(ds)
      ? ds
      : ((ds as { items?: RawInstagramProfile[] }).items ?? []);
    const p = list[0];
    console.log(
      `[Instagram profile] Fetched ${list.length} items for ${handle}. Keys: ${p ? Object.keys(p).slice(0, 12).join(",") : "none"}`
    );
    if (!p) return null;

    return {
      username: p.username ?? handle,
      fullName: p.fullName ?? null,
      biography: p.biography ?? null,
      followersCount: p.followersCount ?? null,
      followsCount: p.followsCount ?? null,
      postsCount: p.postsCount ?? null,
      profilePicUrl: p.profilePicUrlHD ?? p.profilePicUrl ?? null,
      verified: p.verified === true,
      isBusinessAccount: p.isBusinessAccount === true,
      businessCategoryName: p.businessCategoryName ?? null,
      externalUrl: p.externalUrl ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Instagram profile] scrape failed for ${handle}:`, err);
    return null;
  }
}

export async function scrapeInstagramPosts(
  opts: InstagramScrapeOptions
): Promise<InstagramScrapeResult> {
  const maxPosts = opts.maxPosts ?? 30;

  const handle = cleanInstagramUsername(opts.username);
  if (!handle) {
    throw new Error(
      `Instagram username non valido: "${opts.username}". Usa solo il nome utente (es. elenamiro), senza @ o URL.`
    );
  }

  const input: Record<string, unknown> = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: "posts",
    resultsLimit: maxPosts,
  };
  // Date filter: Apify's actor supports lower-bound filtering natively,
  // which lets it stop scraping early (saves cost). Upper bound has to be
  // filtered post-fetch since the actor fetches newest-first.
  if (opts.dateFrom) {
    input.onlyPostsNewerThan = opts.dateFrom;
  }

  console.log(
    `[Instagram] Starting: actor=${ACTOR_ID} user=${handle} max=${maxPosts} from=${opts.dateFrom ?? "-"} to=${opts.dateTo ?? "-"}`
  );

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxPosts}`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  });

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  console.log(`[Instagram] Run created: runId=${runId} datasetId=${datasetId}`);

  if (!datasetId) {
    throw new Error("Apify run started but no datasetId returned.");
  }

  // Poll until the run finishes (max ~5 min)
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
    console.log(`[Instagram] Poll #${pollCount}: status=${status} elapsed=${Math.round((Date.now() - startTime) / 1000)}s`);
  }

  if (status !== "SUCCEEDED") {
    // Fetch detailed error info
    let errorDetail = "";
    try {
      const runInfo = await apifyFetch(`/actor-runs/${runId}`);
      const stats = runInfo.data?.stats ?? runInfo.stats ?? {};
      errorDetail = ` | stats: ${JSON.stringify(stats)}`;
    } catch { /* ignore */ }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`[Instagram] FAILED: status=${status} after ${pollCount} polls, ${elapsed}s${errorDetail}`);
    throw new Error(`Instagram actor ${status} after ${elapsed}s (user: ${handle})`);
  }

  console.log(`[Instagram] Run succeeded, fetching dataset...`);

  let dataset;
  try {
    dataset = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=1000`
    );
  } catch (fetchErr) {
    console.error(`[Instagram] Dataset fetch failed:`, fetchErr);
    throw fetchErr;
  }

  const items: RawInstagramPost[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  console.log(`[Instagram] Dataset: ${items.length} items. Sample keys: ${items[0] ? Object.keys(items[0]).join(", ") : "empty"}`);

  let records: NormalizedPost[];
  try {
    records = items
      .map(normalize)
      .filter((p): p is NormalizedPost => !!p.post_id);
  } catch (normErr) {
    console.error(`[Instagram] Normalize failed:`, normErr);
    throw normErr;
  }

  // Apply upper-bound date filter (end of dateTo, inclusive).
  if (opts.dateTo) {
    const toMs = new Date(opts.dateTo).getTime() + 86_400_000 - 1;
    const before = records.length;
    records = records.filter((r) => {
      if (!r.posted_at) return true;
      return new Date(r.posted_at).getTime() <= toMs;
    });
    if (records.length !== before) {
      console.log(
        `[Instagram] Date filter (to=${opts.dateTo}): ${before} -> ${records.length}`
      );
    }
  }

  console.log(`[Instagram] Normalized: ${records.length} posts`);

  let costCu = 0;
  try {
    const runInfo = await apifyFetch(`/actor-runs/${runId}`);
    costCu = runInfo.data?.usageTotalUsd ?? 0;
  } catch {
    /* ignore */
  }

  return { runId, records, costCu };
}

// ------- Raw post shape from apify/instagram-scraper -------

interface RawInstagramPost {
  id?: string;
  type?: string;
  shortCode?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  url?: string;
  commentsCount?: number;
  displayUrl?: string;
  images?: string[];
  videoUrl?: string;
  likesCount?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  videoDuration?: number;
  timestamp?: string;
  ownerFullName?: string;
  ownerUsername?: string;
  ownerId?: string;
  productType?: string;
  taggedUsers?: Array<{ username?: string; full_name?: string } | string>;
  coauthorProducers?: unknown[];
  musicInfo?: unknown;
  [k: string]: unknown;
}

function normalize(post: RawInstagramPost): NormalizedPost {
  const postId = String(post.id ?? post.shortCode ?? "");

  // Determine post type
  let postType: string | null = post.type ?? null;
  if (post.productType === "clips" && postType === "Video") {
    postType = "Reel";
  }

  // Extract tagged users as string array
  const taggedUsers: string[] = (post.taggedUsers ?? []).map((u) =>
    typeof u === "string" ? u : u.username ?? ""
  ).filter(Boolean);

  // Build post URL
  const postUrl =
    post.url ??
    (post.shortCode
      ? `https://www.instagram.com/p/${post.shortCode}/`
      : null);

  // Parse timestamp
  let postedAt: string | null = null;
  if (post.timestamp) {
    const d = new Date(post.timestamp);
    postedAt = isNaN(d.getTime()) ? null : d.toISOString();
  }

  return {
    post_id: postId,
    post_url: postUrl,
    post_type: postType,
    caption: post.caption ?? null,
    display_url: post.displayUrl ?? null,
    video_url: post.videoUrl ?? null,
    likes_count: post.likesCount ?? 0,
    comments_count: post.commentsCount ?? 0,
    shares_count: 0,
    video_views: post.videoViewCount ?? 0,
    video_play_count: post.videoPlayCount ?? 0,
    hashtags: post.hashtags ?? [],
    mentions: post.mentions ?? [],
    tagged_users: taggedUsers,
    posted_at: postedAt,
    raw_data: post as unknown as Record<string, unknown>,
  };
}
