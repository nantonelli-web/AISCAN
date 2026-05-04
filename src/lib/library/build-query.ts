import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Library content query builders. Single source of truth for the
 * server-rendered initial page (`/library/page.tsx`) AND the
 * incremental "Load more" API (`/api/library/items`). Two helpers:
 *
 *   • buildLibraryQuery     — paginated rows
 *   • buildLibraryCountQuery — total matching rows for the current
 *                              filter set (head:true + count:'exact')
 *
 * Both share the same filter pipeline (channel/brand/project/q/format/
 * platform/cta/status) so any drift between the count badge and the
 * actual list is impossible. Sort order is also centralised here:
 *
 *   • paid ads, no channel filter → source DESC + created_at DESC
 *     (puts every Meta row before every Google row, sorted newest
 *     first inside each source — user explicitly asked for this
 *     2026-05-04: "le creatività si caricano in ordine di canale,
 *     non un mescolone").
 *   • paid ads, channel filtered  → created_at DESC
 *   • organic surfaces            → posted_at / scraped_at DESC
 *     (each surface has its own table — no cross-source mixing).
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

/** Detect which channel branch the args target. Drives both the
 *  table choice and the sort directive. */
function resolveSurface(channel: string | undefined):
  | "ads"
  | "instagram"
  | "tiktok"
  | "snapchat"
  | "youtube" {
  if (channel === "instagram") return "instagram";
  if (channel === "tiktok") return "tiktok";
  if (channel === "snapchat") return "snapchat";
  if (channel === "youtube") return "youtube";
  return "ads";
}

/**
 * Internal — apply per-channel filters to an in-progress query
 * builder. Used by both the data and count helpers so the filter
 * surface stays in lockstep.
 */
function applyAdsFilters<
  T extends {
    eq: (col: string, val: string) => T;
    or: (filterStr: string) => T;
    contains: (col: string, val: string[]) => T;
    not: (col: string, op: string, val: unknown) => T;
    is: (col: string, val: unknown) => T;
    in: (col: string, vals: string[]) => T;
  },
>(query: T, args: LibraryQueryArgs): T {
  const { q, channel } = args;
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

function applyOrganicTextSearch<
  T extends { ilike: (col: string, val: string) => T },
>(q: T, args: LibraryQueryArgs, col: string): T {
  if (args.q && args.q.trim().length > 0) {
    return q.ilike(col, `%${args.q.trim()}%`);
  }
  return q;
}

/** Build the channel-specific data query. */
export function buildLibraryQuery(
  supabase: SupabaseClient,
  args: LibraryQueryArgs,
) {
  const { offset, limit, workspaceId, channel } = args;
  const surface = resolveSurface(channel);

  if (surface === "instagram") {
    let igQuery = supabase
      .from("mait_organic_posts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("posted_at", { ascending: false })
      .range(offset, offset + limit - 1);
    igQuery = applyProjectScope(igQuery, args);
    igQuery = applyOrganicTextSearch(igQuery, args, "caption");
    return igQuery;
  }

  if (surface === "tiktok") {
    let ttQuery = supabase
      .from("mait_tiktok_posts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    ttQuery = applyProjectScope(ttQuery, args);
    ttQuery = applyOrganicTextSearch(ttQuery, args, "caption");
    return ttQuery;
  }

  if (surface === "snapchat") {
    let scQuery = supabase
      .from("mait_snapchat_profiles")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("scraped_at", { ascending: false })
      .range(offset, offset + limit - 1);
    scQuery = applyProjectScope(scQuery, args);
    return scQuery;
  }

  if (surface === "youtube") {
    let ytQuery = supabase
      .from("mait_youtube_videos")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    ytQuery = applyProjectScope(ytQuery, args);
    if (args.q && args.q.trim().length > 0) {
      ytQuery = ytQuery.or(
        `title.ilike.%${args.q.trim()}%,description.ilike.%${args.q.trim()}%`,
      );
    }
    return ytQuery;
  }

  // Ads (Meta + Google) from mait_ads_external. Sort discipline:
  // - no channel filter → source DESC + created_at DESC. PostgREST
  //   doesn't expose a per-value priority (Meta-first is what we
  //   want), but DESC on the string `source` puts 'meta' (m=109)
  //   before 'google' (g=103) — exactly the requested ordering.
  // - channel filtered → just created_at DESC.
  let query = supabase
    .from("mait_ads_external")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (!channel) {
    query = query.order("source", { ascending: false });
  }
  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  query = applyAdsFilters(query, args);
  return query;
}

/** Build a head-only count query for the same filter set. Returns
 *  a builder that resolves to `{ count }`. */
export function buildLibraryCountQuery(
  supabase: SupabaseClient,
  args: Omit<LibraryQueryArgs, "offset" | "limit">,
) {
  const { workspaceId, channel } = args;
  const surface = resolveSurface(channel);
  // Pad missing offset/limit with zeros — applyAdsFilters/applyProjectScope
  // don't read those, but the type requires them.
  const filterArgs = { ...args, offset: 0, limit: 0 };

  if (surface === "instagram") {
    let igQuery = supabase
      .from("mait_organic_posts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    igQuery = applyProjectScope(igQuery, filterArgs);
    igQuery = applyOrganicTextSearch(igQuery, filterArgs, "caption");
    return igQuery;
  }
  if (surface === "tiktok") {
    let ttQuery = supabase
      .from("mait_tiktok_posts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    ttQuery = applyProjectScope(ttQuery, filterArgs);
    ttQuery = applyOrganicTextSearch(ttQuery, filterArgs, "caption");
    return ttQuery;
  }
  if (surface === "snapchat") {
    let scQuery = supabase
      .from("mait_snapchat_profiles")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    scQuery = applyProjectScope(scQuery, filterArgs);
    return scQuery;
  }
  if (surface === "youtube") {
    let ytQuery = supabase
      .from("mait_youtube_videos")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    ytQuery = applyProjectScope(ytQuery, filterArgs);
    if (args.q && args.q.trim().length > 0) {
      ytQuery = ytQuery.or(
        `title.ilike.%${args.q.trim()}%,description.ilike.%${args.q.trim()}%`,
      );
    }
    return ytQuery;
  }
  // Ads count.
  let query = supabase
    .from("mait_ads_external")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  query = applyAdsFilters(query, filterArgs);
  return query;
}
