import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Lazy pagination endpoint for the Brand detail ads grid.
 *
 * The page-shell render already loads the first 30 ads server-side
 * via brand-channels-section.tsx. This route serves subsequent pages
 * for the "Load more" button so the client can append rows without
 * forcing a full Suspense reload (and without dragging 50-200 KB of
 * raw_data per ad through the initial RSC payload).
 *
 * GET /api/competitors/{id}/ads
 *   ?source=meta|google         (optional — narrows by source)
 *   &status=active|inactive     (optional — narrows by status)
 *   &countries=IT,FR,GB         (optional — overlap on scan_countries)
 *   &offset=30                  (default 0)
 *   &limit=30                   (default 30, max 60)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: competitorId } = await params;
  const url = new URL(req.url);

  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const countriesRaw = url.searchParams.get("countries");
  const countries = countriesRaw
    ? countriesRaw
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  // Hard cap at 60 per request so a malicious / runaway client cannot
  // drag the entire brand catalogue in one round-trip.
  const limit = Math.min(
    60,
    Math.max(1, Number(url.searchParams.get("limit") ?? 30) || 30),
  );

  const supabase = await createClient();

  // Auth + workspace scoping is enforced by RLS on mait_ads_external,
  // so we don't need an explicit getSessionUser() — an unauthenticated
  // request hits zero rows and returns an empty list.
  let q = supabase
    .from("mait_ads_external")
    .select(
      "id, workspace_id, competitor_id, ad_archive_id, headline, ad_text, cta, image_url, video_url, landing_url, platforms, status, start_date, end_date, created_at, raw_data, source, scan_countries",
    )
    .eq("competitor_id", competitorId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (source === "meta" || source === "google") q = q.eq("source", source);
  if (status === "active") q = q.eq("status", "ACTIVE");
  else if (status === "inactive") q = q.neq("status", "ACTIVE");
  // Country filter is a no-op on Google because scan_countries is
  // always NULL on Google rows (the Apify Google actor is not
  // country-scoped). Applying the predicate would silently drop
  // every Google ad off the "Load more" pagination.
  if (countries.length > 0 && source !== "google") {
    q = q.overlaps("scan_countries", countries);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ads: data ?? [] });
}
