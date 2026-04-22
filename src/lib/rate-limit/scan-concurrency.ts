import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guard credit-burning scrape endpoints against accidental double-clicks
 * and rapid-fire abuse from a compromised session:
 *   - no concurrent scan on the same competitor
 *   - at most `maxWorkspaceRunning` concurrent scans per workspace
 *
 * Stale jobs (>10 min) are ignored by the caller via cleanup before this check.
 */
export async function checkScanConcurrency(
  admin: SupabaseClient,
  { workspaceId, competitorId, maxWorkspaceRunning = 3 }:
  { workspaceId: string; competitorId: string; maxWorkspaceRunning?: number }
): Promise<{ ok: true } | { ok: false; reason: "already_running" | "workspace_busy" }> {
  const [{ count: sameRunning }, { count: wsRunning }] = await Promise.all([
    admin
      .from("mait_scrape_jobs")
      .select("id", { count: "exact", head: true })
      .eq("competitor_id", competitorId)
      .eq("status", "running"),
    admin
      .from("mait_scrape_jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "running"),
  ]);
  if ((sameRunning ?? 0) > 0) return { ok: false, reason: "already_running" };
  if ((wsRunning ?? 0) >= maxWorkspaceRunning) return { ok: false, reason: "workspace_busy" };
  return { ok: true };
}
