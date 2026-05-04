import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildLibraryQuery, type LibraryQueryArgs } from "@/lib/library/build-query";

export const dynamic = "force-dynamic";

/**
 * Library items — paginated. Used by the LibraryItemsView client
 * island for the "Carica altri" button. The query logic is
 * intentionally identical to /library/page.tsx (same buildLibraryQuery
 * helper), so the rows returned are a continuation of the server-
 * rendered initial page when the same filter set is passed.
 *
 * Querying:
 *   GET /api/library/items?channel=meta&brand=...&offset=120&limit=60
 *   Response: { items: T[], hasMore: boolean }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") ?? undefined;
  const brand = url.searchParams.get("brand") ?? undefined;
  const client = url.searchParams.get("client") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const format = url.searchParams.get("format") ?? undefined;
  const platform = url.searchParams.get("platform") ?? undefined;
  const cta = url.searchParams.get("cta") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0") || 0);
  // Cap limit at 240 to bound a single request payload — caller
  // can chain multiple requests for unbounded scroll.
  const limit = Math.min(
    240,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "60") || 60),
  );

  const { profile } = await getSessionUser();
  const workspaceId = profile.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  // Resolve the project (client) → competitor_ids list. We fetch
  // the competitors once per request; for typical workspaces this
  // is <100 rows and the lookup costs nothing. unstable_cache
  // could shave the round-trip but adds invalidation surface area
  // we don't need for this volume.
  const admin = createAdminClient();
  let projectBrandIds: string[] | null = null;
  if (client) {
    const { data: comps } = await admin
      .from("mait_competitors")
      .select("id, client_id")
      .eq("workspace_id", workspaceId);
    const filtered = (comps ?? []).filter((c) =>
      client === "unassigned" ? c.client_id === null : c.client_id === client,
    );
    projectBrandIds = filtered.map((c) => c.id);
  }

  const supabase = await createClient();
  const args: LibraryQueryArgs = {
    workspaceId,
    channel,
    brand,
    projectBrandIds,
    q,
    format,
    platform,
    cta,
    status,
    offset,
    limit,
  };
  const { data, error } = await buildLibraryQuery(supabase, args);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Query failed" },
      { status: 500 },
    );
  }
  const items = data ?? [];
  // hasMore approximation: if we got back exactly `limit` rows,
  // there's likely a next page. Off-by-one false positives are
  // acceptable — the next request will simply return [].
  const hasMore = items.length === limit;
  return NextResponse.json({ items, hasMore });
}
