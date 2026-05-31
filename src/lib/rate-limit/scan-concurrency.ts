import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDailyCostCap } from "@/lib/apify/batch-safety";
import { enforceRateLimit, SCANS_PER_MINUTE } from "@/lib/rate-limit/enforce";

/**
 * Daily cost cap (H5) + per-workspace scan rate limit (H6), without the
 * per-competitor concurrency check. Use for search-based scans (Maps,
 * SERP) that have no competitor id. Returns the same reason union shape.
 */
export async function checkScanBudget(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; reason: "cost_cap" | "rate_limited" }> {
  const cost = await checkDailyCostCap(workspaceId, admin);
  if (!cost.ok) return { ok: false, reason: "cost_cap" };
  const rl = await enforceRateLimit(admin, {
    key: `scan:${workspaceId}`,
    limit: SCANS_PER_MINUTE,
    windowSeconds: 60,
  });
  if (!rl.ok) return { ok: false, reason: "rate_limited" };
  return { ok: true };
}

/**
 * Guard credit-burning scrape endpoints against accidental double-clicks,
 * rapid-fire abuse, and runaway provider spend:
 *   - daily Apify cost cap per workspace (security audit H5: previously
 *     only the batch routes enforced this; folding it here covers every
 *     single-scan route that calls this guard)
 *   - per-workspace scan rate limit (H6)
 *   - no concurrent scan on the same competitor
 *   - at most `maxWorkspaceRunning` concurrent scans per workspace
 *
 * Stale jobs (>10 min) are ignored by the caller via cleanup before this check.
 */
export async function checkScanConcurrency(
  admin: SupabaseClient,
  { workspaceId, competitorId, maxWorkspaceRunning = 3 }:
  { workspaceId: string; competitorId: string; maxWorkspaceRunning?: number }
): Promise<
  | { ok: true }
  | { ok: false; reason: "already_running" | "workspace_busy" | "cost_cap" | "rate_limited" }
> {
  // Daily cost cap (H5) + per-workspace rate limit (H6).
  const budget = await checkScanBudget(admin, workspaceId);
  if (!budget.ok) return budget;

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
