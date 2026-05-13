/**
 * Classificazione campagna Google inferita dai dati silva95gustavo.
 *
 * Google Transparency Center NON espone esplicitamente il tipo di
 * campagna (PMax / Demand Gen / Search standalone / ecc.). Lo
 * inferiamo dalla combinazione di:
 *   1. `regionStats[].surfaceServingStats[].surfaceCode` quando
 *      pubblicato — solo per ads sopra soglia impressioni Google
 *   2. `format` (IMAGE | VIDEO | TEXT) come fallback "likely" per le
 *      ads sotto soglia, con confidence=low
 *
 * Heuristica validata 2026-05-13 su sample 500 ads workspace user:
 *   - 35% high confidence (con surfaceServingStats)
 *   - 65% low confidence (solo format)
 *
 * Aggiornare l'helper qui se la spec Google cambia. Tutti i consumer
 * (benchmarks, MCP tool query_posts, eventuale badge UI) chiamano
 * questa funzione.
 */

export type GoogleCampaignStrategy =
  /** Performance Max — >=2 surfaces che includono SEARCH o SHOPPING. */
  | "pmax"
  /** Demand Gen — >=2 surfaces YouTube/Display senza Search/Shopping. */
  | "demand_gen"
  /** Single-surface campaigns (high confidence). */
  | "search"
  | "youtube"
  | "shopping"
  | "display"
  | "maps"
  | "play"
  /** Multi-surface pattern non standard (raro). */
  | "multi_other"
  /** Low-confidence: ad senza surfaceServingStats, classificata solo dal format. */
  | "search_likely"
  | "youtube_likely"
  | "display_likely"
  /** Niente surface stats, niente format riconoscibile. */
  | "unknown";

export type StrategyConfidence = "high" | "low";

export interface GoogleStrategyResult {
  strategy: GoogleCampaignStrategy;
  confidence: StrategyConfidence;
  surfaces: string[];
}

/**
 * Estrae le surface distinte (SEARCH/YOUTUBE/SHOPPING/MAPS/PLAY/...)
 * da `raw_data.regionStats[].surfaceServingStats[].surfaceCode`.
 * Maiuscolizzato + deduplicato. Vuoto se Google non pubblica.
 */
export function extractGoogleSurfaces(rawData: unknown): string[] {
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
  return [...surfaces].sort();
}

/**
 * Classifica una Google ad dato il suo raw_data + format.
 *
 * Regole (in ordine di precedenza):
 *   - 0 surfaces, format=TEXT  → search_likely (low confidence)
 *   - 0 surfaces, format=VIDEO → youtube_likely
 *   - 0 surfaces, format=IMAGE → display_likely
 *   - 1 surface = SEARCH/YOUTUBE/SHOPPING/DISPLAY/MAPS/PLAY → single-channel
 *   - >=2 surfaces && contiene SEARCH o SHOPPING → PMax
 *     (Demand Gen NON distribuisce su Search/Shopping)
 *   - >=2 surfaces && contiene YouTube o Display senza Search/Shopping → Demand Gen
 *   - altro → multi_other
 */
export function classifyGoogleStrategy(
  rawData: unknown,
  format: string | null | undefined,
): GoogleStrategyResult {
  const surfaces = extractGoogleSurfaces(rawData);
  const fmt = String(format ?? "").toUpperCase();

  if (surfaces.length === 0) {
    if (fmt === "TEXT")
      return { strategy: "search_likely", confidence: "low", surfaces };
    if (fmt === "VIDEO")
      return { strategy: "youtube_likely", confidence: "low", surfaces };
    if (fmt === "IMAGE")
      return { strategy: "display_likely", confidence: "low", surfaces };
    return { strategy: "unknown", confidence: "low", surfaces };
  }

  if (surfaces.length === 1) {
    const single = surfaces[0];
    switch (single) {
      case "SEARCH":
        return { strategy: "search", confidence: "high", surfaces };
      case "YOUTUBE":
        return { strategy: "youtube", confidence: "high", surfaces };
      case "SHOPPING":
        return { strategy: "shopping", confidence: "high", surfaces };
      case "DISPLAY":
        return { strategy: "display", confidence: "high", surfaces };
      case "MAPS":
        return { strategy: "maps", confidence: "high", surfaces };
      case "PLAY":
        return { strategy: "play", confidence: "high", surfaces };
      default:
        return { strategy: "multi_other", confidence: "high", surfaces };
    }
  }

  // >=2 surfaces
  if (surfaces.includes("SEARCH") || surfaces.includes("SHOPPING")) {
    return { strategy: "pmax", confidence: "high", surfaces };
  }
  if (surfaces.some((s) => s === "YOUTUBE" || s === "DISPLAY")) {
    return { strategy: "demand_gen", confidence: "high", surfaces };
  }
  return { strategy: "multi_other", confidence: "high", surfaces };
}

/** Label umane per UI / API output. */
export const STRATEGY_LABELS: Record<GoogleCampaignStrategy, string> = {
  pmax: "Performance Max",
  demand_gen: "Demand Gen",
  search: "Search",
  youtube: "YouTube",
  shopping: "Shopping",
  display: "Display",
  maps: "Maps",
  play: "Play Store",
  multi_other: "Multi-canale (altro)",
  search_likely: "Search (probabile)",
  youtube_likely: "YouTube (probabile)",
  display_likely: "Display (probabile)",
  unknown: "Non classificabile",
};
