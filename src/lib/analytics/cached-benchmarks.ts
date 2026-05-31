import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeBenchmarks,
  computeOrganicBenchmarks,
  computeTiktokBenchmarks,
  type BenchmarkData,
  type OrganicBenchmarkData,
  type TiktokBenchmarkData,
} from "@/lib/analytics/benchmarks";

/**
 * Cached wrappers around the heavy benchmark aggregators.
 *
 * computeBenchmarks/Organic/Tiktok page the workspace's ads/posts and
 * aggregate in Node — expensive. Without caching that ran on EVERY
 * benchmarks page load by EVERY user, so cost scaled with users-online
 * rather than with how often the data actually changes. Scans are async
 * and infrequent (minutes apart at most), so a short shared cache makes
 * the aggregation run ~once per (workspace, filter-combo) per TTL and N
 * concurrent viewers reuse the same result. Same rationale as the facets
 * cache in @/lib/library/cached-data.
 *
 * The cached fns build their OWN admin client (unstable_cache memoizes a
 * self-contained thunk; the client isn't serializable). This is safe:
 * every query inside the aggregators filters .eq("workspace_id", …)
 * explicitly, so RLS bypass via the admin client changes nothing.
 */
const TTL = Number.parseInt(process.env.BENCHMARKS_CACHE_TTL_S ?? "300", 10);

/** Invalidate with revalidateTag(benchmarksTag(workspaceId)) after a scan
 *  if you want benchmarks fresh sooner than the TTL. */
export function benchmarksTag(workspaceId: string): string {
  return `benchmarks:${workspaceId}`;
}

function part(v: string | string[] | undefined): string {
  return Array.isArray(v) ? [...v].sort().join(",") : (v ?? "");
}

export function getCachedBenchmarks(
  workspaceId: string,
  source: "meta" | "google" | undefined,
  competitorIds: string[] | undefined,
  dateFrom?: string,
  dateTo?: string,
  countries?: string[],
  statusFilter?: "active" | "inactive",
): Promise<BenchmarkData> {
  return unstable_cache(
    () =>
      computeBenchmarks(
        createAdminClient(),
        workspaceId,
        source,
        competitorIds,
        dateFrom,
        dateTo,
        countries,
        statusFilter,
      ),
    [
      "benchmarks",
      "ads",
      workspaceId,
      part(source),
      part(competitorIds),
      part(dateFrom),
      part(dateTo),
      part(countries),
      part(statusFilter),
    ],
    { tags: [benchmarksTag(workspaceId)], revalidate: TTL },
  )();
}

export function getCachedOrganicBenchmarks(
  workspaceId: string,
  competitorIds: string[] | undefined,
  dateFrom?: string,
  dateTo?: string,
): Promise<OrganicBenchmarkData> {
  return unstable_cache(
    () =>
      computeOrganicBenchmarks(
        createAdminClient(),
        workspaceId,
        competitorIds,
        dateFrom,
        dateTo,
      ),
    [
      "benchmarks",
      "organic",
      workspaceId,
      part(competitorIds),
      part(dateFrom),
      part(dateTo),
    ],
    { tags: [benchmarksTag(workspaceId)], revalidate: TTL },
  )();
}

export function getCachedTiktokBenchmarks(
  workspaceId: string,
  competitorIds: string[] | undefined,
  dateFrom?: string,
  dateTo?: string,
): Promise<TiktokBenchmarkData> {
  return unstable_cache(
    () =>
      computeTiktokBenchmarks(
        createAdminClient(),
        workspaceId,
        competitorIds,
        dateFrom,
        dateTo,
      ),
    [
      "benchmarks",
      "tiktok",
      workspaceId,
      part(competitorIds),
      part(dateFrom),
      part(dateTo),
    ],
    { tags: [benchmarksTag(workspaceId)], revalidate: TTL },
  )();
}
