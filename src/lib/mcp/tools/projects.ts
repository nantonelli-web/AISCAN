import { createAdminClient } from "@/lib/supabase/admin";
import type { McpTool } from "../types";

/**
 * Project/Client = `mait_clients` table. Raggruppa i brand per
 * agenzia/cliente (es. "Intarget", "NIMA"). Schema:
 *   mait_clients(id, workspace_id, name, color, created_at)
 *   mait_competitors.client_id -> mait_clients.id (nullable)
 *
 * Per parlare con Claude usiamo "project" come termine user-facing
 * cosi' e' coerente con il pattern URL /adv-performance/[clientId]/[brandId].
 */

interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string | null;
}

export const listProjectsTool: McpTool = {
  definition: {
    name: "list_projects",
    description:
      "Lista i progetti (cliente/agenzia) del workspace. Ogni brand puo' essere assegnato a un progetto. Usalo quando l'utente menziona un progetto per nome (es. 'progetto Intarget') e ti serve l'id per filtrare i brand via list_brands(project_id).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  handler: async (_args, ctx) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("mait_clients")
      .select("id, name, color, created_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("name", { ascending: true });
    const rows = (data as ProjectRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "Nessun progetto in questo workspace. I brand sono tutti unassigned.",
          },
        ],
      };
    }
    // Conta brand per progetto cosi' Claude vede subito quali sono
    // popolati e quali vuoti.
    const { data: brandCounts } = await admin
      .from("mait_competitors")
      .select("client_id")
      .eq("workspace_id", ctx.workspaceId);
    const countMap = new Map<string, number>();
    let unassigned = 0;
    for (const b of (brandCounts as { client_id: string | null }[] | null) ??
      []) {
      if (b.client_id) {
        countMap.set(b.client_id, (countMap.get(b.client_id) ?? 0) + 1);
      } else {
        unassigned++;
      }
    }
    const enriched = rows.map((r) => ({
      ...r,
      brand_count: countMap.get(r.id) ?? 0,
    }));
    const payload = {
      projects: enriched,
      brands_without_project: unassigned,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  },
};
