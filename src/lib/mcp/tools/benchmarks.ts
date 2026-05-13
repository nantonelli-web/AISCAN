import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeBenchmarks,
  computeOrganicBenchmarks,
  computeTiktokBenchmarks,
} from "@/lib/analytics/benchmarks";
import type { McpTool } from "../types";

/**
 * get_benchmarks — aggregati cross-brand. Channel obbligatorio:
 *   - paid_meta:           computeBenchmarks(source=meta)
 *   - paid_google:         computeBenchmarks(source=google)
 *   - organic_instagram:   computeOrganicBenchmarks (solo IG, fb non
 *                           ancora aggregato lato benchmark)
 *   - organic_tiktok:      computeTiktokBenchmarks
 *
 * Quando aggiungiamo un canale (es. snapchat organic), basta
 * estenderne lenum + uno switch.
 */

type ChannelKey =
  | "paid_meta"
  | "paid_google"
  | "organic_instagram"
  | "organic_tiktok";

const ALL_CHANNELS: ChannelKey[] = [
  "paid_meta",
  "paid_google",
  "organic_instagram",
  "organic_tiktok",
];

export const getBenchmarksTool: McpTool = {
  definition: {
    name: "get_benchmarks",
    description:
      "Aggregato statistico cross-brand per UN canale. Channel obbligatorio: se l'utente fa una domanda generica sul workspace, CHIEDIGLI prima quale canale gli interessa fra paid_meta (Meta Ads Library), paid_google (Google Ads Transparency), organic_instagram, organic_tiktok. Ritorna volume per brand, format mix, top elementi (CTA per paid / hashtag per organic), durata, refresh rate, paesi, ecc. Stessi dati della pagina /benchmarks.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ALL_CHANNELS,
          description:
            "Obbligatorio. paid_meta/paid_google = ads. organic_instagram/organic_tiktok = post organic.",
        },
        brand_ids: {
          type: "array",
          items: { type: "string", format: "uuid" },
          description:
            "Subset di brand. Default: tutti i brand del workspace.",
        },
        date_from: {
          type: "string",
          description: "ISO date YYYY-MM-DD.",
        },
        date_to: { type: "string" },
        countries: {
          type: "array",
          items: { type: "string" },
          description:
            "Solo paid_meta/paid_google. ISO alpha-2 codes (es. ['IT','FR']).",
        },
        status: {
          type: "string",
          enum: ["active", "inactive"],
          description: "Solo paid_meta/paid_google.",
        },
      },
      required: ["channel"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const channel = args.channel as ChannelKey;
    if (!ALL_CHANNELS.includes(channel)) {
      return {
        content: [
          {
            type: "text",
            text: `channel obbligatorio. Valori validi: ${ALL_CHANNELS.join(", ")}`,
          },
        ],
        isError: true,
      };
    }
    const admin = createAdminClient();
    const brandIds = Array.isArray(args.brand_ids)
      ? (args.brand_ids as string[]).filter(Boolean)
      : undefined;
    const dateFrom = typeof args.date_from === "string" ? args.date_from : undefined;
    const dateTo = typeof args.date_to === "string" ? args.date_to : undefined;

    if (channel === "paid_meta" || channel === "paid_google") {
      const source = channel === "paid_meta" ? "meta" : "google";
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
      const summary = {
        channel,
        totals: data.totals,
        volumeByBrand: data.volumeByCompetitor,
        formatMix: data.formatMix,
        topCtas: data.topCtas,
        topTargetedCountries: data.topTargetedCountries,
        avgDurationByBrand: data.avgDurationByCompetitor,
        refreshRate: data.refreshRate,
        platformDistribution: data.platformDistribution,
        avgVariantsByBrand: data.avgVariantsByCompetitor,
        // Google-only fields (vuoti su meta)
        avgServedDaysByBrand: data.avgServedDaysByCompetitor,
        regionFootprintByBrand: data.regionFootprintByCompetitor,
        surfaceMixByBrand: data.surfaceMixByCompetitor,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    }

    if (channel === "organic_instagram") {
      const data = await computeOrganicBenchmarks(
        admin,
        ctx.workspaceId,
        brandIds,
        dateFrom,
        dateTo,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ channel, ...data }, null, 2),
          },
        ],
      };
    }

    if (channel === "organic_tiktok") {
      const data = await computeTiktokBenchmarks(
        admin,
        ctx.workspaceId,
        brandIds,
        dateFrom,
        dateTo,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ channel, ...data }, null, 2),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `Channel '${channel}' non supportato` }],
      isError: true,
    };
  },
};
