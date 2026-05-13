import { createAdminClient } from "@/lib/supabase/admin";
import type { McpTool } from "../types";

/**
 * Tool sui brand (mait_competitors). Tutti scoped al workspace
 * dell'utente OAuth, mai cross-workspace.
 */

interface BrandRow {
  id: string;
  page_name: string | null;
  page_url: string | null;
  category: string | null;
  country: string | null;
  page_id: string | null;
  last_scraped_at: string | null;
  monitor_config: Record<string, unknown> | null;
}

function summarizeBrand(b: BrandRow): string {
  return [
    `# ${b.page_name ?? "(senza nome)"}`,
    b.page_url ? `URL: ${b.page_url}` : null,
    b.category ? `Categoria: ${b.category}` : null,
    b.country ? `Paesi configurati: ${b.country}` : null,
    b.last_scraped_at ? `Ultimo scan: ${b.last_scraped_at}` : null,
    `ID: ${b.id}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const listBrandsTool: McpTool = {
  definition: {
    name: "list_brands",
    description:
      "Lista i brand monitorati nel workspace. Ritorna nome, URL, categoria, paesi configurati, data ultimo scan e id. Usalo per esplorare il portafoglio brand prima di chiamare get_brand_detail o list_ads.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Numero massimo di brand. Default 50.",
        },
      },
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("mait_competitors")
      .select(
        "id, page_name, page_url, category, country, page_id, last_scraped_at, monitor_config",
      )
      .eq("workspace_id", ctx.workspaceId)
      .order("page_name", { ascending: true })
      .limit(limit);
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data as BrandRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: "Nessun brand nel workspace." }],
      };
    }
    const text = [
      `${rows.length} brand nel workspace:`,
      "",
      ...rows.map(summarizeBrand),
    ].join("\n\n");
    return { content: [{ type: "text", text }] };
  },
};


export const searchBrandTool: McpTool = {
  definition: {
    name: "search_brand",
    description:
      "Cerca brand per nome parziale (LIKE case-insensitive). Utile quando l'utente menziona un brand per nome ma serve l'id per altre chiamate.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Stringa da cercare nel nome del brand.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Massimo numero risultati. Default 10.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const q = String(args.query ?? "").trim();
    const limit = typeof args.limit === "number" ? args.limit : 10;
    if (!q) {
      return {
        content: [{ type: "text", text: "query obbligatoria" }],
        isError: true,
      };
    }
    const admin = createAdminClient();
    const { data } = await admin
      .from("mait_competitors")
      .select(
        "id, page_name, page_url, category, country, page_id, last_scraped_at, monitor_config",
      )
      .eq("workspace_id", ctx.workspaceId)
      .ilike("page_name", `%${q}%`)
      .order("page_name", { ascending: true })
      .limit(limit);
    const rows = (data as BrandRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: `Nessun brand corrisponde a "${q}".` }],
      };
    }
    const text = [
      `${rows.length} match per "${q}":`,
      "",
      ...rows.map(summarizeBrand),
    ].join("\n\n");
    return { content: [{ type: "text", text }] };
  },
};
