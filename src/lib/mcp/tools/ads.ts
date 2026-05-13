import { createAdminClient } from "@/lib/supabase/admin";
import type { McpTool } from "../types";

interface AdRow {
  id: string;
  ad_archive_id: string;
  headline: string | null;
  ad_text: string | null;
  cta: string | null;
  platforms: string[] | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  landing_url: string | null;
  image_url: string | null;
  video_url: string | null;
}

function summarizeAd(a: AdRow): string {
  const platforms =
    a.platforms && a.platforms.length > 0 ? a.platforms.join(", ") : "—";
  const period = [
    a.start_date ? `from ${a.start_date.slice(0, 10)}` : null,
    a.end_date ? `to ${a.end_date.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const cta = a.cta ? `CTA: ${a.cta}` : null;
  const headline = a.headline ? `HEADLINE: ${a.headline}` : null;
  const body =
    a.ad_text && a.ad_text.length > 0
      ? `TEXT: ${a.ad_text.slice(0, 280)}${a.ad_text.length > 280 ? "…" : ""}`
      : null;
  return [
    `# ${a.ad_archive_id}`,
    `Status: ${a.status ?? "—"} · Platforms: ${platforms}${period ? " · " + period : ""}`,
    headline,
    cta,
    body,
    a.landing_url ? `URL: ${a.landing_url}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const listAdsTool: McpTool = {
  definition: {
    name: "list_ads",
    description:
      "Lista le ads salvate in DB per un brand specifico, con filtri opzionali. NB: ritorna i metadati testuali (headline, copy, CTA, periodo, status, piattaforme). Per il volume aggregato + breakdown statistico usa get_benchmarks.",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: {
          type: "string",
          format: "uuid",
          description: "UUID del brand (da list_brands).",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "INACTIVE"],
          description:
            "Filtra per stato dell'ad. Lasciare vuoto per entrambi.",
        },
        platform: {
          type: "string",
          description:
            "Filtra ads che includono almeno questa platform (es. 'facebook', 'instagram', 'youtube', 'google_search', 'display').",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Massimo ads ritornate. Default 20.",
        },
      },
      required: ["brand_id"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const brandId = String(args.brand_id ?? "").trim();
    const limit = typeof args.limit === "number" ? args.limit : 20;
    if (!brandId) {
      return {
        content: [{ type: "text", text: "brand_id obbligatorio" }],
        isError: true,
      };
    }
    const admin = createAdminClient();
    let q = admin
      .from("mait_ads_external")
      .select(
        "id, ad_archive_id, headline, ad_text, cta, platforms, status, start_date, end_date, landing_url, image_url, video_url",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("competitor_id", brandId)
      .order("start_date", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (typeof args.status === "string") q = q.eq("status", args.status);
    if (typeof args.platform === "string") {
      q = q.contains("platforms", [args.platform]);
    }
    const { data, error } = await q;
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data as AdRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Nessuna ad in DB per questo brand con i filtri specificati.",
          },
        ],
      };
    }
    const text = [
      `${rows.length} ads (ordinate per start_date DESC):`,
      "",
      ...rows.map(summarizeAd),
    ].join("\n\n");
    return { content: [{ type: "text", text }] };
  },
};
