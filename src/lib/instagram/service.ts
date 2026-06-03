/**
 * Service layer for the apify/instagram-scraper actor.
 * Uses the Apify REST API directly (no SDK), same pattern as the ads scraper.
 *
 * Actor: apify/instagram-scraper
 * Pricing: $2.30/1000 posts (pay-per-result)
 * Uses the existing APIFY_API_TOKEN.
 */

import { getApifyCredentials } from "@/lib/billing/credentials";
import { logger } from "@/lib/logger";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apify/instagram-scraper";

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
  /** Diagnostic counters — populated when the user passed a
   *  date range. Helps the API surface a useful 'why 0 posts?'
   *  toast when the actor returned items but they all fell
   *  outside the window. */
  diagnostics: {
    /** Total items the actor returned before any filtering. */
    rawCount: number;
    /** Filtered out for being older than dateFrom. */
    droppedOlder: number;
    /** Filtered out for being newer than dateTo (rare). */
    droppedNewer: number;
  };
  credentials?: {
    source: "managed" | "byo";
    keyRecordId: string | null;
    billingMode: "credits" | "subscription";
  };
}

export interface InstagramScrapeOptions {
  username: string;
  maxPosts?: number;
  /** ISO date (YYYY-MM-DD). Posts older than this are skipped by Apify. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD). Posts newer than this are dropped post-fetch. */
  dateTo?: string;
  workspaceId?: string;
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

/** Mappa un raw item "details" dell'actor IG nel nostro InstagramProfile.
 *  Condiviso tra lo scrape singolo (profilo brand) e quello batch
 *  (enrichment collaboratori L3). */
function mapRawProfile(
  p: RawInstagramProfile,
  fallbackHandle: string,
): InstagramProfile {
  // Gli actor restituiscono la pic sotto nomi diversi.
  const pic =
    (p.profilePicUrlHD as string | undefined) ??
    (p.profilePicUrl as string | undefined) ??
    (p["profile_pic_url_hd"] as string | undefined) ??
    (p["profile_pic_url"] as string | undefined) ??
    (p["profilePicture"] as string | undefined) ??
    null;

  // Apify a volte ritorna "None,Brand" — togli la sottocategoria nulla.
  const rawCategory = p.businessCategoryName ?? null;
  const category = rawCategory
    ? rawCategory.replace(/^None\s*,\s*/i, "").replace(/\s*,\s*None$/i, "").trim() || null
    : null;

  return {
    username: p.username ?? fallbackHandle,
    fullName: p.fullName ?? null,
    biography: p.biography ?? null,
    followersCount: p.followersCount ?? null,
    followsCount: p.followsCount ?? null,
    postsCount: p.postsCount ?? null,
    profilePicUrl: pic,
    verified: p.verified === true,
    isBusinessAccount: p.isBusinessAccount === true,
    businessCategoryName: category,
    externalUrl: p.externalUrl ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export async function scrapeInstagramProfile(
  usernameInput: string,
  workspaceId?: string,
): Promise<InstagramProfile | null> {
  const handle = cleanInstagramUsername(usernameInput);
  if (!handle) {
    logger.warn("Profile: invalid handle", {
      channel: "instagram",
      event: "profile.invalid_handle",
      handle: usernameInput,
    });
    return null;
  }

  // BYO dispatch: subscription-mode workspaces with no Apify key
  // throw here, caller handles by returning null (profile is
  // optional metadata, not blocking).
  let token: string;
  try {
    const creds = await getApifyCredentials(workspaceId);
    token = creds.token;
  } catch (e) {
    logger.error("Profile: credentials error", {
      channel: "instagram",
      event: "profile.credentials_failed",
      workspaceId,
    }, e);
    return null;
  }

  try {
    const input = {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: "details",
      resultsLimit: 1,
    };

    logger.info("Profile: starting scrape", {
      channel: "instagram",
      event: "profile.started",
      handle,
      workspaceId,
    });

    // maxItems must yield a max charge above Apify's minimum ($0.0027 for
    // this actor). maxItems=1 → $0.0023 → rejected; use 5 as a safe cap.
    const run = await apifyFetch(
      `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=5`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      token,
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
      const info = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
      status = info.data?.status ?? info.status ?? status;
    }

    if (status !== "SUCCEEDED") {
      throw new Error(
        `profile actor ${status} after ${Math.round((Date.now() - start) / 1000)}s (${handle})`
      );
    }

    const ds = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=5`,
      undefined,
      token,
    );
    const list: RawInstagramProfile[] = Array.isArray(ds)
      ? ds
      : ((ds as { items?: RawInstagramProfile[] }).items ?? []);
    const p = list[0];
    logger.debug("Profile: fetched items", {
      channel: "instagram",
      event: "profile.fetched",
      handle,
      itemCount: list.length,
      keys: p ? Object.keys(p).slice(0, 20).join(",") : "none",
    });
    if (!p) return null;

    return mapRawProfile(p, handle);
  } catch (err) {
    logger.error("Profile: scrape failed", {
      channel: "instagram",
      event: "profile.scrape_failed",
      handle,
      workspaceId,
    }, err);
    return null;
  }
}

export interface InstagramProfilesBatchResult {
  /** Profili trovati, keyed by handle normalizzato (lowercase, no @). */
  profiles: Map<string, InstagramProfile>;
  /** Handle richiesti per cui l'actor non ha restituito alcun item
   *  (account inesistente / privato / non risolto). */
  notFound: string[];
  /** Costo Apify del run in USD (usageTotalUsd), per logging/diagnostica. */
  costCu: number;
}

/**
 * Scrape dei profili IG di PIU' handle in un solo run Apify (directUrls
 * multipli, resultsType "details"). Usato dall'enrichment collaboratori
 * L3: arricchire 20 account in un run costa ~$0.05 invece di 20 run
 * separati. Match dei risultati per username normalizzato.
 *
 * I batch grossi vengono spezzati in chunk per non far girare l'actor
 * troppo a lungo (poll a 5 min per chunk). Handle gia' normalizzati in
 * ingresso (lowercase, no @); cleanInstagramUsername fa da safety net.
 */
export async function scrapeInstagramProfiles(
  handles: string[],
  workspaceId?: string,
  chunkSize = 25,
): Promise<InstagramProfilesBatchResult> {
  const profiles = new Map<string, InstagramProfile>();
  const notFound: string[] = [];
  let costCu = 0;

  // Dedup + clean. Teniamo la mappa cleaned→original per riportare i
  // notFound con l'handle che il chiamante conosce.
  const cleanedToOriginal = new Map<string, string>();
  for (const raw of handles) {
    const cleaned = cleanInstagramUsername(raw);
    if (cleaned) cleanedToOriginal.set(cleaned.toLowerCase(), raw.toLowerCase());
  }
  const cleanedHandles = [...cleanedToOriginal.keys()];
  if (cleanedHandles.length === 0) {
    return { profiles, notFound, costCu };
  }

  let token: string;
  try {
    const creds = await getApifyCredentials(workspaceId);
    token = creds.token;
  } catch (e) {
    logger.error("Profiles batch: credentials error", {
      channel: "instagram",
      event: "profiles_batch.credentials_failed",
      workspaceId,
    }, e);
    // Nessuna credenziale → tutto notFound (il chiamante lo gestisce).
    return { profiles, notFound: [...cleanedToOriginal.values()], costCu };
  }

  for (let i = 0; i < cleanedHandles.length; i += chunkSize) {
    const chunk = cleanedHandles.slice(i, i + chunkSize);
    const seenInChunk = new Set<string>();
    try {
      const input = {
        directUrls: chunk.map((h) => `https://www.instagram.com/${h}/`),
        resultsType: "details",
        // Un item per profilo; lascia headroom.
        resultsLimit: chunk.length,
      };
      const maxItems = chunk.length * 2 + 5;

      const run = await apifyFetch(
        `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxItems}`,
        { method: "POST", body: JSON.stringify(input) },
        token,
      );

      const runId: string = run.data?.id ?? run.id ?? "";
      const datasetId: string =
        run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";
      if (!datasetId) throw new Error("no datasetId from profiles batch run");

      let status = run.data?.status ?? run.status ?? "RUNNING";
      const start = Date.now();
      const maxWait = 5 * 60 * 1000;
      while (
        (status === "RUNNING" || status === "READY") &&
        Date.now() - start < maxWait
      ) {
        await new Promise((r) => setTimeout(r, 5000));
        const info = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
        status = info.data?.status ?? info.status ?? status;
      }
      if (status !== "SUCCEEDED") {
        throw new Error(
          `profiles batch actor ${status} after ${Math.round((Date.now() - start) / 1000)}s`,
        );
      }

      const ds = await apifyFetch(
        `/datasets/${datasetId}/items?format=json&limit=${maxItems}`,
        undefined,
        token,
      );
      const list: RawInstagramProfile[] = Array.isArray(ds)
        ? ds
        : ((ds as { items?: RawInstagramProfile[] }).items ?? []);

      for (const p of list) {
        const uname = (p.username ?? "").toLowerCase();
        if (!uname) continue;
        const mapped = mapRawProfile(p, uname);
        profiles.set(uname, mapped);
        seenInChunk.add(uname);
      }

      try {
        const info = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
        costCu += info.data?.usageTotalUsd ?? 0;
      } catch {
        /* ignore cost read */
      }
    } catch (err) {
      logger.error("Profiles batch: chunk failed", {
        channel: "instagram",
        event: "profiles_batch.chunk_failed",
        chunkIndex: i / chunkSize,
        workspaceId,
      }, err);
      // Chunk fallito: lascia gli handle non visti tra i notFound sotto.
    }

    // Handle del chunk non risolti = notFound (account privato/inesistente
    // o chunk fallito). Riportiamo l'handle originale del chiamante.
    for (const h of chunk) {
      if (!seenInChunk.has(h)) {
        notFound.push(cleanedToOriginal.get(h) ?? h);
      }
    }
  }

  return { profiles, notFound, costCu };
}

export async function scrapeInstagramPosts(
  opts: InstagramScrapeOptions
): Promise<InstagramScrapeResult> {
  const creds = await getApifyCredentials(opts.workspaceId);
  const token = creds.token;

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

  logger.info("Posts: starting scrape", {
    channel: "instagram",
    event: "scan.started",
    actor: ACTOR_ID,
    handle,
    maxPosts,
    dateFrom: opts.dateFrom ?? null,
    dateTo: opts.dateTo ?? null,
    workspaceId: opts.workspaceId,
  });

  const actorPath = `/acts/${encodeURIComponent(ACTOR_ID)}/runs?maxItems=${maxPosts}`;
  const run = await apifyFetch(actorPath, {
    method: "POST",
    body: JSON.stringify(input),
  }, token);

  const runId: string = run.data?.id ?? run.id ?? "";
  const datasetId: string =
    run.data?.defaultDatasetId ?? run.defaultDatasetId ?? "";

  logger.info("Posts: run created", {
    channel: "instagram",
    event: "scan.run_created",
    runId,
    datasetId,
    workspaceId: opts.workspaceId,
  });

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
    const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
    status = runInfo.data?.status ?? runInfo.status ?? status;
    logger.debug("Posts: poll", {
      channel: "instagram",
      event: "scan.poll",
      runId,
      pollCount,
      status,
      elapsedS: Math.round((Date.now() - startTime) / 1000),
    });
  }

  if (status !== "SUCCEEDED") {
    // Fetch detailed error info
    let errorDetail = "";
    try {
      const runInfo = await apifyFetch(`/actor-runs/${runId}`, undefined, token);
      const stats = runInfo.data?.stats ?? runInfo.stats ?? {};
      errorDetail = ` | stats: ${JSON.stringify(stats)}`;
    } catch { /* ignore */ }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    logger.error("Posts: actor run failed", {
      channel: "instagram",
      event: "scan.failed",
      runId,
      status,
      pollCount,
      elapsedS: elapsed,
      detail: errorDetail,
      workspaceId: opts.workspaceId,
    });
    throw new Error(`Instagram actor ${status} after ${elapsed}s (user: ${handle})`);
  }

  logger.debug("Posts: run succeeded, fetching dataset", {
    channel: "instagram",
    event: "scan.fetching_dataset",
    runId,
  });

  let dataset;
  try {
    dataset = await apifyFetch(
      `/datasets/${datasetId}/items?format=json&limit=1000`,
      undefined,
      token,
    );
  } catch (fetchErr) {
    logger.error("Posts: dataset fetch failed", {
      channel: "instagram",
      event: "scan.dataset_fetch_failed",
      runId,
      datasetId,
    }, fetchErr);
    throw fetchErr;
  }

  const items: RawInstagramPost[] = Array.isArray(dataset)
    ? dataset
    : dataset.items ?? [];

  logger.debug("Posts: dataset received", {
    channel: "instagram",
    event: "scan.dataset_received",
    runId,
    itemCount: items.length,
    sampleKeys: items[0] ? Object.keys(items[0]).join(", ") : "empty",
  });

  let records: NormalizedPost[];
  try {
    records = items
      .map(normalize)
      .filter((p): p is NormalizedPost => !!p.post_id);
  } catch (normErr) {
    logger.error("Posts: normalize failed", {
      channel: "instagram",
      event: "scan.normalize_failed",
      runId,
    }, normErr);
    throw normErr;
  }

  // Client-side date filter — belt and braces alongside Apify's
  // onlyPostsNewerThan, which some actor versions silently ignore.
  const rawCount = records.length;
  let droppedOlder = 0;
  let droppedNewer = 0;
  const fromMs = opts.dateFrom ? new Date(opts.dateFrom).getTime() : null;
  const toMs = opts.dateTo
    ? new Date(opts.dateTo).getTime() + 86_400_000 - 1
    : null;
  if (fromMs !== null || toMs !== null) {
    records = records.filter((r) => {
      if (!r.posted_at) return true;
      const t = new Date(r.posted_at).getTime();
      if (fromMs !== null && t < fromMs) {
        droppedOlder++;
        return false;
      }
      if (toMs !== null && t > toMs) {
        droppedNewer++;
        return false;
      }
      return true;
    });
    logger.debug("Posts: date filter applied", {
      channel: "instagram",
      event: "scan.date_filter",
      dateFrom: opts.dateFrom ?? null,
      dateTo: opts.dateTo ?? null,
      rawCount,
      droppedOlder,
      droppedNewer,
      kept: records.length,
    });
  }

  logger.info("Posts: scrape completed", {
    channel: "instagram",
    event: "scan.completed",
    runId,
    postCount: records.length,
    workspaceId: opts.workspaceId,
  });

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
    diagnostics: { rawCount, droppedOlder, droppedNewer },
    credentials: creds,
  };
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
