import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getScanCoverage,
  CHANNEL_TO_SCAN_SOURCE,
} from "@/lib/analytics/scan-coverage";

/**
 * GET /api/competitors/scan-coverage?ids=a,b,c&channel=instagram
 *
 * Returns the latest successful scan per brand for the channel, so the
 * Compare view can warn when the selected brands have mis-aligned scan
 * coverage (one fresh, one stale → unfair comparison). Read-only; uses
 * the user client so RLS scopes everything to the caller's workspace.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    // bound the input — Compare never selects more than 3 brands
    .slice(0, 10);
  const channel = url.searchParams.get("channel") ?? "";
  const source = CHANNEL_TO_SCAN_SOURCE[channel];

  // Channels without a per-channel scan job ("all") → no coverage check.
  if (ids.length === 0 || !source) {
    return NextResponse.json({ coverage: [] });
  }

  const coverage = await getScanCoverage(supabase, ids, source);
  return NextResponse.json({ coverage });
}
