import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tenant-isolation helpers for API routes that use the service-role
 * admin client (which BYPASSES RLS). Whenever a route fetches/mutates a
 * resource by a request-supplied id via the admin client, it MUST first
 * scope to the caller's workspace — otherwise it's a cross-tenant IDOR.
 *
 * Pattern:
 *   const admin = createAdminClient();
 *   const workspaceId = await resolveWorkspaceId(admin, user.id);
 *   if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 403 });
 *   // then add .eq("workspace_id", workspaceId) to every admin query keyed on a request id,
 *   // or use assertOwnedIds()/assertResourceInWorkspace() below.
 */

/** Resolve the caller's workspace_id from their auth user id. */
export async function resolveWorkspaceId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", userId)
    .single();
  return (data?.workspace_id as string | null) ?? null;
}

/**
 * Returns the subset of `ids` that actually belong to `workspaceId` in
 * `table` (default mait_competitors). Use to reject cross-tenant ids
 * before doing any work: if `result.length !== ids.length`, the caller
 * referenced a resource it doesn't own.
 */
export async function filterOwnedIds(
  admin: SupabaseClient,
  table: string,
  ids: string[],
  workspaceId: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await admin
    .from(table)
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("id", ids);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * True when ALL `ids` belong to `workspaceId`. Convenience wrapper
 * around filterOwnedIds for the "reject if any foreign id" gate.
 */
export async function assertOwnedIds(
  admin: SupabaseClient,
  table: string,
  ids: string[],
  workspaceId: string,
): Promise<boolean> {
  const owned = await filterOwnedIds(admin, table, ids, workspaceId);
  return owned.length === ids.length;
}

/**
 * Verify a single resource row belongs to the caller's workspace.
 * Returns true only if the row exists AND its workspace_id matches.
 */
export async function assertResourceInWorkspace(
  admin: SupabaseClient,
  table: string,
  id: string,
  workspaceId: string,
): Promise<boolean> {
  const { data } = await admin
    .from(table)
    .select("workspace_id")
    .eq("id", id)
    .maybeSingle();
  return !!data && data.workspace_id === workspaceId;
}
