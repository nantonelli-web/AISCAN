import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeBenchmarks,
  computeOrganicBenchmarks,
} from "@/lib/analytics/benchmarks";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ids = sp.get("ids")?.split(",").filter(Boolean) ?? [];
  const sourceParam = sp.get("source");
  // Forward the same date range Compare uses on its other API calls so
  // the refresh rate (and every windowed KPI in BenchmarkData) reflects
  // the user-selected range instead of the legacy 90d default — the
  // visible bug was a "(30gg)" label still showing 90d-divisor numbers.
  const dateFromParam = sp.get("date_from") ?? sp.get("dateFrom") ?? undefined;
  const dateToParam = sp.get("date_to") ?? sp.get("dateTo") ?? undefined;
  const isoDate = (s: string | undefined) =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  const dateFrom = isoDate(dateFromParam);
  const dateTo = isoDate(dateToParam);

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }

  if (sourceParam === "instagram") {
    const data = await computeOrganicBenchmarks(supabase, workspaceId, ids);
    return NextResponse.json({ kind: "organic", ...data });
  }

  const validSource =
    sourceParam === "meta" || sourceParam === "google" ? sourceParam : undefined;
  const data = await computeBenchmarks(
    supabase,
    workspaceId,
    validSource,
    ids,
    dateFrom,
    dateTo,
  );

  return NextResponse.json({ kind: "ads", ...data });
}
