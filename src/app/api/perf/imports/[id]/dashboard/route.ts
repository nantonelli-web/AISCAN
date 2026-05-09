import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDashboardData } from "@/lib/perf/dashboard-loader";
import type { ComparisonMode } from "@/lib/perf/comparisons";

/**
 * GET /api/perf/imports/[id]/dashboard
 * Query params:
 *  - compare: none | previous | week | yoy | custom
 *  - compare_from / compare_to: ISO date (per "custom")
 *  - week_current / week_compare: token "week 14" (per "week")
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const mode = (url.searchParams.get("compare") ?? "none") as ComparisonMode;
  const customFrom = url.searchParams.get("compare_from") ?? undefined;
  const customTo = url.searchParams.get("compare_to") ?? undefined;
  const weekCurrent = url.searchParams.get("week_current");
  const weekCompare = url.searchParams.get("week_compare");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await loadDashboardData(supabase, {
    importId: id,
    mode,
    customFrom,
    customTo,
    weekCurrent,
    weekCompare,
  });
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
