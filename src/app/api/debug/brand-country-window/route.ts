import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/brand-country-window?brand=Marina&country=DE&days=30
 *
 * Diagnostic per capire perche' un brand mostra X ads su benchmarks
 * filtrato per paese + ultimi N giorni, quando la ground truth
 * (Google Ads Transparency Center) e' diversa.
 *
 * Filtra:
 *   - workspace dell'utente
 *   - mait_ads_external.source = 'google'
 *   - competitor.page_name ILIKE %brand%
 *   - scan_countries OVERLAPS [country]
 *   - start_date <= today AND (end_date >= dateFrom OR null OR ACTIVE)
 *
 * Per ogni ad ritorna:
 *   - dates root-level
 *   - regionStats[code=country] firstShown/lastShown/impressions
 *   - numServedDays / surfaces / format
 *   - status (ACTIVE / INACTIVE secondo il nostro normalize)
 *   - 4 verdetti:
 *     v1_query_passed       (passa scan_countries + date filter query)
 *     v2_region_dates_pass  (passa il fix regionStats[code].firstShown/lastShown)
 *     v3_likely_active      (regionStats[code].lastShown nei N giorni)
 *     v4_ground_truth       (best guess di cosa Google mostrerebbe)
 *
 * Output: counts + sample ads + breakdown per verdetto.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RegionStatsEntry {
  regionCode?: string;
  regionName?: string;
  firstShown?: string;
  lastShown?: string;
  impressions?: { lowerBound?: number; upperBound?: number | null };
  surfaceServingStats?: Array<{ surfaceCode?: string }>;
}

interface AdRow {
  id: string;
  ad_archive_id: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  scan_countries: string[] | null;
  raw_data: Record<string, unknown> | null;
  competitor_id: string | null;
}

function extractRegionEntry(
  rawData: Record<string, unknown> | null,
  country: string,
): RegionStatsEntry | null {
  if (!rawData) return null;
  const regionStats = rawData.regionStats;
  if (!Array.isArray(regionStats)) return null;
  for (const r of regionStats) {
    if (!r || typeof r !== "object") continue;
    const entry = r as RegionStatsEntry;
    if (typeof entry.regionCode === "string" && entry.regionCode.toUpperCase() === country) {
      return entry;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: userRow } = await supabase
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 403 });
  }
  const workspaceId = userRow.workspace_id as string;

  const url = new URL(req.url);
  const brandLike = (url.searchParams.get("brand") ?? "Marina").trim();
  const country = (url.searchParams.get("country") ?? "DE").trim().toUpperCase();
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") ?? "30")));

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  const dateFrom = fromDate.toISOString().slice(0, 10);
  const dateTo = today.toISOString().slice(0, 10);
  const fromMs = fromDate.getTime();
  const toMs = new Date(dateTo + "T23:59:59Z").getTime();

  const admin = createAdminClient();

  // Find matching brands by name (case-insensitive). Limit to workspace.
  const { data: brands } = await admin
    .from("mait_competitors")
    .select("id, page_name, parent_brand_id")
    .eq("workspace_id", workspaceId)
    .ilike("page_name", `%${brandLike}%`);
  const brandsList = (brands ?? []) as { id: string; page_name: string; parent_brand_id: string | null }[];
  if (brandsList.length === 0) {
    return NextResponse.json({
      error: `Nessun brand trovato con name ILIKE %${brandLike}%`,
    });
  }
  const brandIds = brandsList.map((b) => b.id);

  // Pull all google ads for those brand(s) — no date / country filter
  // at DB level, so we can apply each progressively and report deltas.
  // Cap at 5000 to avoid pathological responses.
  const { data: rows } = await admin
    .from("mait_ads_external")
    .select(
      "id, ad_archive_id, status, start_date, end_date, scan_countries, raw_data, competitor_id",
    )
    .in("competitor_id", brandIds)
    .eq("source", "google")
    .limit(5000);
  const ads = (rows ?? []) as AdRow[];

  const total = ads.length;
  const brandNamesById = new Map(brandsList.map((b) => [b.id, b.page_name]));

  // Verdetti progressivi.
  const v1QueryPassed: AdRow[] = []; // passa scan_countries+date come fa benchmarks query
  const v2RegionDatesPass: AdRow[] = []; // dopo il fix region-level
  const v3LikelyActive: AdRow[] = []; // regionStats[code].lastShown nei N giorni

  for (const ad of ads) {
    // V1: query-level filter (scan_countries OVERLAPS + date overlap su root).
    const hasCountry =
      Array.isArray(ad.scan_countries) && ad.scan_countries.map((c) => c.toUpperCase()).includes(country);
    if (!hasCountry) continue;
    const startMs = ad.start_date ? new Date(ad.start_date).getTime() : Number.NaN;
    const endMs = ad.end_date ? new Date(ad.end_date).getTime() : Number.NaN;
    const stillRunning = ad.status === "ACTIVE" || !ad.end_date;
    const startInWin = Number.isFinite(startMs) ? startMs <= toMs : true;
    const endInWin = stillRunning || (Number.isFinite(endMs) ? endMs >= fromMs : true);
    if (!startInWin || !endInWin) continue;
    v1QueryPassed.push(ad);

    // V2: regionStats per-region intersection (il nostro fix).
    const region = extractRegionEntry(ad.raw_data, country);
    if (!region) {
      // niente regionStats DE → il fix lascia passare. Resta in v2.
      v2RegionDatesPass.push(ad);
    } else {
      const rFirst = region.firstShown ? new Date(region.firstShown).getTime() : Number.NaN;
      const rLast = region.lastShown ? new Date(region.lastShown).getTime() : Number.NaN;
      const passV2Start = Number.isFinite(rFirst) ? rFirst <= toMs : true;
      const passV2End =
        Number.isFinite(rLast) ? rLast >= fromMs : true; /* missing lastShown = ancora attivo */
      if (passV2Start && passV2End) v2RegionDatesPass.push(ad);
      else continue;
    }

    // V3: stricter — regionStats[code].lastShown DEVE essere entro N giorni.
    if (region?.lastShown) {
      const rLast = new Date(region.lastShown).getTime();
      if (Number.isFinite(rLast) && rLast >= fromMs) v3LikelyActive.push(ad);
    } else if (!region) {
      // niente region entry: ambiguo. Non lo contiamo come "active".
    } else {
      // region presente, ma niente lastShown → considera attivo.
      v3LikelyActive.push(ad);
    }
  }

  // Sample 12 ads with full context to visually inspect.
  const sample = v1QueryPassed.slice(0, 12).map((ad) => {
    const region = extractRegionEntry(ad.raw_data, country);
    const raw = ad.raw_data ?? {};
    const r = raw as Record<string, unknown>;
    const surfaces = new Set<string>();
    const rs = r.regionStats;
    if (Array.isArray(rs)) {
      for (const x of rs) {
        const stats = (x as { surfaceServingStats?: unknown[] })?.surfaceServingStats;
        if (Array.isArray(stats)) {
          for (const s of stats) {
            const code = (s as { surfaceCode?: string })?.surfaceCode;
            if (typeof code === "string") surfaces.add(code);
          }
        }
      }
    }
    return {
      ad_archive_id: ad.ad_archive_id,
      brand: brandNamesById.get(ad.competitor_id ?? "") ?? null,
      status: ad.status,
      root_start: ad.start_date,
      root_end: ad.end_date,
      scan_countries: ad.scan_countries,
      [`region_${country}`]: region
        ? {
            firstShown: region.firstShown ?? null,
            lastShown: region.lastShown ?? null,
            impressions_max: region.impressions?.upperBound ?? null,
            surfaces: (region.surfaceServingStats ?? [])
              .map((s) => s?.surfaceCode)
              .filter(Boolean),
          }
        : null,
      raw_firstShown: typeof r.firstShown === "string" ? r.firstShown : null,
      raw_lastShown: typeof r.lastShown === "string" ? r.lastShown : null,
      numServedDays: typeof r.numServedDays === "number" ? r.numServedDays : null,
      format: typeof r.format === "string" ? r.format : null,
      surfaces_all_regions: [...surfaces],
    };
  });

  return NextResponse.json({
    query: {
      brand_like: brandLike,
      country,
      days,
      date_from: dateFrom,
      date_to: dateTo,
    },
    brands_matched: brandsList,
    counts: {
      total_google_ads_for_brands: total,
      v1_passes_query_filter: v1QueryPassed.length,
      v2_passes_region_dates_fix: v2RegionDatesPass.length,
      v3_likely_active_in_country: v3LikelyActive.length,
      v1_minus_v2_dropped_by_fix: v1QueryPassed.length - v2RegionDatesPass.length,
      v2_minus_v3_dropped_by_strict: v2RegionDatesPass.length - v3LikelyActive.length,
    },
    sample,
  });
}
