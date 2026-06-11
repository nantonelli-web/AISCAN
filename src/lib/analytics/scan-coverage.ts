/**
 * Scan-coverage / freshness signal, shared by Compare and Benchmarks.
 *
 * The "coverage" question both surfaces need to answer is: were the
 * selected brands all scanned up to (roughly) the same recent date? If
 * brand A was last scanned today but brand B three weeks ago, B's recent
 * data is simply missing — any side-by-side comparison over a window that
 * reaches "today" is apples-to-oranges, and silently so.
 *
 * The authoritative signal for "scan date set" is the most recent
 * SUCCEEDED (or PARTIAL) job per brand+channel in `mait_scrape_jobs`:
 * its `date_to` is the upper bound the scan was asked to cover, and
 * `completed_at` is when it actually ran. Unlike the Benchmarks
 * `earliestStart` signal (oldest ad start_date, ads-only, RPC-bound),
 * this works uniformly for every channel and captures the END of
 * coverage — which is exactly what the earliestStart check is blind to.
 *
 * `getScanCoverage` accepts any Supabase client: pass the user/anon
 * client so RLS scopes rows to the caller's workspace (tenant isolation),
 * or the admin client from a trusted server context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Compare/Benchmarks channel → `mait_scrape_jobs.source` value. Channels
 *  without a per-channel scan job (e.g. "all") are intentionally absent so
 *  callers treat them as "no coverage check". */
export const CHANNEL_TO_SCAN_SOURCE: Record<string, string> = {
  meta: "meta",
  google: "google",
  instagram: "instagram",
  tiktok: "tiktok",
  snapchat: "snapchat",
  youtube: "youtube",
};

export interface ScanCoverageEntry {
  competitorId: string;
  name: string;
  /** Upper bound the last scan was asked to cover (ISO date, may be null
   *  on legacy jobs created before the date-range columns existed). */
  lastScanTo: string | null;
  /** When the last successful scan actually ran (ISO timestamp). */
  lastScanCompletedAt: string | null;
}

/**
 * Latest successful scan per competitor for a channel. Brands with no
 * succeeded/partial job on that channel come back with both dates null
 * (callers surface them as "never scanned on this channel").
 */
export async function getScanCoverage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  competitorIds: string[],
  source: string,
): Promise<ScanCoverageEntry[]> {
  if (competitorIds.length === 0) return [];

  const [{ data: comps }, { data: jobs }] = await Promise.all([
    supabase
      .from("mait_competitors")
      .select("id, page_name")
      .in("id", competitorIds),
    supabase
      .from("mait_scrape_jobs")
      .select("competitor_id, date_to, completed_at, status")
      .in("competitor_id", competitorIds)
      .eq("source", source)
      .in("status", ["succeeded", "partial"])
      // Most-recent first so the first row we see per competitor is the
      // latest scan. completed_at can be null mid-run; started_at breaks
      // ties and keeps deterministic ordering.
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false, nullsFirst: false }),
  ]);

  const nameMap = new Map(
    (comps ?? []).map((c) => [c.id as string, (c.page_name as string) ?? "—"]),
  );

  const seen = new Set<string>();
  const out: ScanCoverageEntry[] = [];
  for (const j of jobs ?? []) {
    const id = j.competitor_id as string | null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      competitorId: id,
      name: nameMap.get(id) ?? "—",
      lastScanTo: (j.date_to as string | null) ?? null,
      lastScanCompletedAt: (j.completed_at as string | null) ?? null,
    });
  }
  // Brands with zero successful scans on this channel.
  for (const id of competitorIds) {
    if (seen.has(id)) continue;
    out.push({
      competitorId: id,
      name: nameMap.get(id) ?? "—",
      lastScanTo: null,
      lastScanCompletedAt: null,
    });
  }
  return out;
}

export interface CoverageGap {
  competitorId: string;
  name: string;
  /** Date the brand's last scan covered up to (ISO date). */
  coveredUntil: string;
  /** How many days that falls short of the window end. */
  gapDays: number;
}

export interface FreshnessResult {
  /** Brands scanned, but whose coverage ends meaningfully before the
   *  window end (stale relative to the comparison). */
  gaps: CoverageGap[];
  /** Brands never scanned on this channel. */
  neverScanned: { competitorId: string; name: string }[];
}

/**
 * Pure gap computation — usable on both server and client. A brand is
 * flagged when the date its last scan covered up to is more than
 * `toleranceDays` before the end of the selected window. Tolerance
 * absorbs normal scan cadence (a scan run yesterday is not "stale").
 */
export function computeFreshnessGaps(
  coverage: ScanCoverageEntry[],
  windowToIso: string,
  toleranceDays = 3,
): FreshnessResult {
  const toMs = new Date(`${windowToIso}T23:59:59Z`).getTime();
  const gaps: CoverageGap[] = [];
  const neverScanned: { competitorId: string; name: string }[] = [];

  for (const c of coverage) {
    const coveredIso =
      c.lastScanTo ??
      (c.lastScanCompletedAt ? c.lastScanCompletedAt.slice(0, 10) : null);
    if (!coveredIso) {
      neverScanned.push({ competitorId: c.competitorId, name: c.name });
      continue;
    }
    const coveredMs = new Date(`${coveredIso}T23:59:59Z`).getTime();
    if (!Number.isFinite(coveredMs)) continue;
    const gapDays = Math.round((toMs - coveredMs) / 86_400_000);
    if (gapDays > toleranceDays) {
      gaps.push({
        competitorId: c.competitorId,
        name: c.name,
        coveredUntil: coveredIso,
        gapDays,
      });
    }
  }
  // Largest gap first — the most-stale brand is the headline.
  gaps.sort((a, b) => b.gapDays - a.gapDays);
  return { gaps, neverScanned };
}
