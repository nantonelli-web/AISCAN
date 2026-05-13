import { createAdminClient } from "@/lib/supabase/admin";
import type { McpTool } from "../types";

/**
 * Tool sui brand (mait_competitors). Tutti scoped al workspace
 * dell'utente OAuth, mai cross-workspace.
 *
 * Include il `project` (= mait_clients.name) cosi' Claude puo'
 * rispondere a domande tipo "quali brand sono nel progetto Intarget".
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
  client_id: string | null;
  // joined
  client?: { id: string; name: string | null; color: string | null } | null;
}

function summarizeBrand(b: BrandRow): Record<string, unknown> {
  return {
    id: b.id,
    name: b.page_name,
    url: b.page_url,
    category: b.category,
    countries: b.country,
    last_scraped_at: b.last_scraped_at,
    project: b.client
      ? { id: b.client.id, name: b.client.name }
      : null,
  };
}

export const listBrandsTool: McpTool = {
  definition: {
    name: "list_brands",
    description:
      "Lista i brand monitorati nel workspace. Per ogni brand include nome, URL, paesi configurati, ultimo scan, e progetto (mait_clients: cliente/agenzia di appartenenza, es. 'Intarget'/'NIMA'). Filtra per progetto con project_id (ottenuto da list_projects).",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          format: "uuid",
          description:
            "Se fornito, ritorna solo i brand assegnati a questo progetto. Per scoprire i progetti disponibili usa list_projects.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Default 50.",
        },
      },
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const projectId =
      typeof args.project_id === "string" ? args.project_id : null;
    const admin = createAdminClient();
    let q = admin
      .from("mait_competitors")
      .select(
        "id, page_name, page_url, category, country, page_id, last_scraped_at, monitor_config, client_id, client:mait_clients(id, name, color)",
      )
      .eq("workspace_id", ctx.workspaceId)
      .order("page_name", { ascending: true })
      .limit(limit);
    if (projectId) q = q.eq("client_id", projectId);
    const { data, error } = await q;
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = ((data as unknown) as BrandRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: projectId
              ? "Nessun brand nel progetto specificato."
              : "Nessun brand nel workspace.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { count: rows.length, brands: rows.map(summarizeBrand) },
            null,
            2,
          ),
        },
      ],
    };
  },
};

export const searchBrandTool: McpTool = {
  definition: {
    name: "search_brand",
    description:
      "Cerca brand per nome parziale (case-insensitive). Utile quando l'utente menziona un brand per nome ma serve l'id per altre chiamate. Ritorna anche il progetto di appartenenza.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Default 10.",
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
        "id, page_name, page_url, category, country, page_id, last_scraped_at, monitor_config, client_id, client:mait_clients(id, name, color)",
      )
      .eq("workspace_id", ctx.workspaceId)
      .ilike("page_name", `%${q}%`)
      .order("page_name", { ascending: true })
      .limit(limit);
    const rows = ((data as unknown) as BrandRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: `Nessun brand corrisponde a "${q}".` }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query: q,
              count: rows.length,
              brands: rows.map(summarizeBrand),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
