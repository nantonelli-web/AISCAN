import { createAdminClient } from "@/lib/supabase/admin";
import { computeBenchmarks } from "@/lib/analytics/benchmarks";
import type { McpTool } from "../types";

/**
 * Espone l'aggregato Benchmarks (lo stesso che alimenta la pagina
 * /benchmarks) come tool MCP. Il client AI lo usa per ottenere
 * statistiche cross-brand: format mix, top CTA, durata media,
 * refresh rate, paesi target, ecc.
 */

export const getBenchmarksTool: McpTool = {
  definition: {
    name: "get_benchmarks",
    description:
      "Aggregato statistico cross-brand (paid ads) per il workspace: volume, format mix, top CTA, durata campagne, refresh rate, paesi target. Stessi dati della pagina Benchmarks. Filtri opzionali per canale, brand specifici, range date, paesi, status.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["meta", "google"],
          description: "Canale ads. Default tutti.",
        },
        brand_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description: "UUID dei brand da includere. Default tutti del workspace.",
        },
        date_from: {
          type: "string",
          description: "ISO date YYYY-MM-DD inizio finestra.",
        },
        date_to: {
          type: "string",
          description: "ISO date YYYY-MM-DD fine finestra.",
        },
        countries: {
          type: "array",
          items: { type: "string" },
          description:
            "Codici ISO alpha-2 (es. ['IT','FR']). Filtra ads per scan_countries.",
        },
        status: {
          type: "string",
          enum: ["active", "inactive"],
          description: "Filtra solo ads attive o solo non attive.",
        },
      },
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const admin = createAdminClient();
    const source =
      args.channel === "meta" || args.channel === "google"
        ? (args.channel as "meta" | "google")
        : undefined;
    const brandIds = Array.isArray(args.brand_ids)
      ? (args.brand_ids as string[]).filter(Boolean)
      : undefined;
    const dateFrom = typeof args.date_from === "string" ? args.date_from : undefined;
    const dateTo = typeof args.date_to === "string" ? args.date_to : undefined;
    const countries = Array.isArray(args.countries)
      ? (args.countries as string[]).filter(Boolean)
      : undefined;
    const status =
      args.status === "active" || args.status === "inactive"
        ? (args.status as "active" | "inactive")
        : undefined;

    const data = await computeBenchmarks(
      admin,
      ctx.workspaceId,
      source,
      brandIds,
      dateFrom,
      dateTo,
      countries,
      status,
    );

    // Restituiamo il payload come JSON dentro un blocco text — i client
    // MCP gestiscono volentieri JSON dentro text/plain (Claude e Cursor
    // lo parsano automaticamente nei contesti analitici).
    const summary = {
      totals: data.totals,
      volumeByBrand: data.volumeByCompetitor,
      formatMix: data.formatMix,
      topCtas: data.topCtas,
      topTargetedCountries: data.topTargetedCountries,
      avgDurationByBrand: data.avgDurationByCompetitor,
      avgCopyLengthByBrand: data.avgCopyLengthByCompetitor,
      refreshRate: data.refreshRate,
      refreshRateWindowDays: data.refreshRateWindowDays,
      platformDistribution: data.platformDistribution,
      avgVariantsByBrand: data.avgVariantsByCompetitor,
      // Google-specific (vuoti su Meta)
      avgServedDaysByBrand: data.avgServedDaysByCompetitor,
      regionFootprintByBrand: data.regionFootprintByCompetitor,
      surfaceMixByBrand: data.surfaceMixByCompetitor,
      ctaMissingBrands: data.ctaMissingCompetitors,
      surfaceMixMissingBrands: data.surfaceMixMissingCompetitors,
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  },
};
