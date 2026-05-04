import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Library content query builder. Single source of truth for the
 * server-rendered initial page (`/library/page.tsx`) AND the
 * incremental "Load more" API (`/api/library/items`). The previous
 * version inlined the query inside page.tsx; once the load-more
 * feature was added, copying that 80-line conditional ladder into
 * a route handler was a refactor smell — extract once, fix twice.
 *
 * Returns the configured PostgREST query builder. The caller is
 * responsible for awaiting it and unwrapping `data`. We deliberately
 * don't run the query here so the surrounding code can layer on
 * extra clauses (count: 'exact', etc.) when needed.
 */
export interface LibraryQueryArgs {
  workspaceId: string;
  channel: string | undefined;
  brand: string | undefined;
  /** Resolved server-side from `client` searchParam — list of
   *  competitor_ids in the selected project, or null when no
   *  project filter is active. Empty array = matches nothing. */
  projectBrandIds: string[] | null;
  q: string | undefined;
  format: string | undefined;
  platform: string | undefined;
  cta: string | undefined;
  status: string | undefined;
  /** Inclusive lower bound of the slice. 0 = first page. */
  offset: number;
  /** Slice size. Each page request returns at most this many
   *  rows. Defaults set by the caller; we don't hard-cap here. */
  limit: number;
}

function applyProjectScope<
  T extends {
    in: (col: string, vals: string[]) => T;
    eq: (col: string, val: string) => T;
  },
>(q: T, args: LibraryQueryArgs): T {
  if (args.brand) return q.eq("competitor_id", args.brand);
  if (args.projectBrandIds) {
    const ids =
      args.projectBrandIds.length > 0
        ? args.projectBrandIds
        : ["00000000-0000-0000-0000-000000000000"];
    return q.in("competitor_id", ids);
  }
  return q;
}

/** Build the channel-specific query. Returns the in-progress
 *  query builder; the caller awaits + unwraps. */
export function buildLibraryQuery(
  supabase: SupabaseClient,
  args: LibraryQueryArgs,
) {
  const { channel, q, offset, limit, workspaceId } = args;
  const isInstagram = channel === "instagram";
  const isTiktok = channel === "tiktok";
  const isSnapchat = channel === "snapchat";
  const isYoutube = channel === "youtube";

  if (isInstagram) {
    let igQuery = supabase
      .from("mait_organic_posts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("posted_at", { ascending: false })
      .range(offset, offset + limit - 1);
    igQuery = applyProjectScope(igQuery, args);
    if (q && q.trim().length > 0) {
      igQuery = igQuery.ilike("caption", `%${q.trim()}%`);
    }
    return igQuery;
  }

  if (isTiktok) {
    let ttQuery = supabase
      .from("mait_tiktok_posts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    ttQuery = applyProjectScope(ttQuery, args);
    if (q && q.trim().length > 0) {
      ttQuery = ttQuery.ilike("caption", `%${q.trim()}%`);
    }
    return ttQuery;
  }

  if (isSnapchat) {
    let scQuery = supabase
      .from("mait_snapchat_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("scraped_at", { ascending: false })
      .range(offset, offset + limit - 1);
    scQuery = applyProjectScope(scQuery, args);
    return scQuery;
  }

  if (isYoutube) {
    let ytQuery = supabase
      .from("mait_youtube_videos")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    ytQuery = applyProjectScope(ytQuery, args);
    if (q && q.trim().length > 0) {
      ytQuery = ytQuery.or(
        `title.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`,
      );
    }
    return ytQuery;
  }

  // Default: paid ads (Meta + Google) from mait_ads_external.
  let query = supabase
    .from("mait_ads_external")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (q && q.trim().length > 0) {
    const term = `%${q.trim()}%`;
    query = query.or(
      `ad_text.ilike.${term},headline.ilike.${term},description.ilike.${term}`,
    );
  }
  if (channel === "meta") query = query.eq("source", "meta");
  if (channel === "google") query = query.eq("source", "google");
  query = applyProjectScope(query, args);
  if (args.platform) query = query.contains("platforms", [args.platform]);
  if (args.cta) query = query.eq("cta", args.cta);
  if (args.status) query = query.eq("status", args.status);
  if (args.format === "video") query = query.not("video_url", "is", null);
  if (args.format === "image")
    query = query.is("video_url", null).not("image_url", "is", null);
  return query;
}
