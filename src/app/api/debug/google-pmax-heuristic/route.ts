import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/google-pmax-heuristic?limit=500&brand_id=optional
 *
 * Diagnostic-only: applica l'heuristica di classificazione campagna
 * (PMax / Demand Gen / single-surface) su un campione di Google ads
 * gia' salvate in DB e ritorna distribuzione + samples per ogni
 * categoria. Serve a valutare la qualita' dell'heuristica PRIMA di
 * portarla in produzione.
 *
 * Heuristica:
 *   - Conta surfaces distinte da raw_data.regionStats[].surfaceServingStats[].surfaceCode
 *   - 1 surface = single-channel campaign (Search/YouTube/Shopping/...)
 *   - >=2 surfaces && contiene SHOPPING => PMax
 *   - >=2 surfaces && contiene SEARCH && format != TEXT => PMax
 *     (Search distribuisce Image/Video solo via PMax)
 *   - >=2 surfaces senza SHOPPING/SEARCH => Demand Gen
 *   - Niente surfaces (no surfaceServingStats) => UNKNOWN
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Strategy =
  | "pmax"
  | "demand_gen"
  | "search"
  | "youtube"
  | "display"
  | "shopping"
  | "maps"
  | "play"
  | "multi_other"
  | "unknown";

function extractSurfaces(rawData: unknown): string[] {
  if (!rawData || typeof rawData !== "object") return [];
  const regionStats = (rawData as Record<string, unknown>).regionStats;
  if (!Array.isArray(regionStats)) return [];
  const surfaces = new Set<string>();
  for (const r of regionStats) {
    const stats = (r as Record<string, unknown>)?.surfaceServingStats;
    if (!Array.isArray(stats)) continue;
    for (const s of stats) {
      const code = (s as Record<string, unknown>)?.surfaceCode;
      if (typeof code === "string" && code) {
        surfaces.add(code.toUpperCase());
      }
    }
  }
  return [...surfaces];
}

function classify(surfaces: string[], format: string): Strategy {
  if (surfaces.length === 0) return "unknown";
  if (surfaces.length === 1) {
    switch (surfaces[0]) {
      case "SEARCH":
        return "search";
      case "YOUTUBE":
        return "youtube";
      case "SHOPPING":
        return "shopping";
      case "DISPLAY":
        return "display";
      case "MAPS":
        return "maps";
      case "PLAY":
        return "play";
      default:
        return "multi_other";
    }
  }
  // >=2 surfaces
  if (surfaces.includes("SHOPPING")) return "pmax";
  if (surfaces.includes("SEARCH") && format.toUpperCase() !== "TEXT") {
    return "pmax";
  }
  // Multi-surface ma non Shopping ne Search-with-asset = Demand Gen
  // (YouTube + Display + Gmail tipico)
  if (
    surfaces.some((s) => ["YOUTUBE", "DISPLAY"].includes(s)) &&
    !surfaces.includes("MAPS")
  ) {
    return "demand_gen";
  }
  return "multi_other";
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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500"), 2000);
  const brandId = url.searchParams.get("brand_id");

  const admin = createAdminClient();
  let q = admin
    .from("mait_ads_external")
    .select(
      "id, ad_archive_id, raw_data, status, competitor:mait_competitors(id, page_name)",
    )
    .eq("workspace_id", workspaceId)
    .eq("source", "google")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (brandId) q = q.eq("competitor_id", brandId);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type AdRow = {
    id: string;
    ad_archive_id: string;
    raw_data: Record<string, unknown> | null;
    status: string | null;
    competitor: { id: string; page_name: string | null } | null;
  };
  const ads = ((data ?? []) as unknown) as AdRow[];

  // Distribution counts
  const distribution: Record<Strategy, number> = {
    pmax: 0,
    demand_gen: 0,
    search: 0,
    youtube: 0,
    display: 0,
    shopping: 0,
    maps: 0,
    play: 0,
    multi_other: 0,
    unknown: 0,
  };
  const samplesByStrategy: Record<
    Strategy,
    Array<{
      ad_archive_id: string;
      brand: string | null;
      format: string;
      surfaces: string[];
      status: string | null;
    }>
  > = {
    pmax: [],
    demand_gen: [],
    search: [],
    youtube: [],
    display: [],
    shopping: [],
    maps: [],
    play: [],
    multi_other: [],
    unknown: [],
  };
  // Pattern frequencies (per surface set) — utile per spotting unexpected combos
  const surfacePatternCount = new Map<string, number>();

  const formatCounts: Record<string, number> = {};

  for (const ad of ads) {
    const raw = ad.raw_data ?? {};
    const format = String(
      (raw as Record<string, unknown>).format ??
        (raw as Record<string, unknown>).adFormat ??
        "",
    );
    formatCounts[format] = (formatCounts[format] ?? 0) + 1;
    const surfaces = extractSurfaces(raw);
    const strategy = classify(surfaces, format);
    distribution[strategy]++;
    const sortedSurfaces = [...surfaces].sort();
    const patternKey =
      sortedSurfaces.length > 0 ? sortedSurfaces.join("+") : "(empty)";
    surfacePatternCount.set(
      patternKey,
      (surfacePatternCount.get(patternKey) ?? 0) + 1,
    );
    if (samplesByStrategy[strategy].length < 5) {
      samplesByStrategy[strategy].push({
        ad_archive_id: ad.ad_archive_id,
        brand: ad.competitor?.page_name ?? null,
        format,
        surfaces: sortedSurfaces,
        status: ad.status,
      });
    }
  }

  const topPatterns = [...surfacePatternCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([pattern, count]) => ({ pattern, count }));

  const total = ads.length;
  const percentage = (n: number): string =>
    total === 0 ? "0%" : `${((n / total) * 100).toFixed(1)}%`;

  return NextResponse.json({
    total_ads_analyzed: total,
    distribution: Object.fromEntries(
      Object.entries(distribution).map(([k, v]) => [
        k,
        { count: v, share: percentage(v) },
      ]),
    ),
    format_distribution: formatCounts,
    top_surface_patterns: topPatterns,
    samples: samplesByStrategy,
    heuristic_rules: {
      "1 surface = SEARCH":
        "→ search (Text Ads classico)",
      "1 surface = YOUTUBE":
        "→ youtube (Video Ads / Skippable / Bumper)",
      "1 surface = SHOPPING":
        "→ shopping (Shopping standalone)",
      "1 surface = DISPLAY / MAPS / PLAY":
        "→ display / maps / play",
      ">=2 surfaces che includono SHOPPING":
        "→ PMAX (Shopping cross-surface = PMax)",
      ">=2 surfaces con SEARCH ma format != TEXT":
        "→ PMAX (Search non distribuisce Image/Video se non via PMax)",
      ">=2 surfaces YouTube+Display senza Shopping/Search":
        "→ DEMAND_GEN",
      "0 surfaces (no surfaceServingStats)":
        "→ UNKNOWN (Google non pubblica surface per impression < soglia)",
    },
  });
}
