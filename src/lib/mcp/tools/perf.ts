import { createAdminClient } from "@/lib/supabase/admin";
import { loadDashboardData } from "@/lib/perf/dashboard-loader";
import type { McpTool } from "../types";

/**
 * Tool per Adv Performance: import list, dashboard KPI, analisi AI.
 * Tutto scoped al workspace OAuth.
 */

interface PerfImportRow {
  id: string;
  channel: string;
  period_from: string;
  period_to: string;
  currency: string | null;
  status: string;
  row_count: number;
  total_spend: number | string;
  total_impressions: number | string;
  file_name: string | null;
  created_at: string;
}

interface PerfAnalysisRow {
  section: string;
  content: string;
  locale: string;
  edited_by_user: boolean;
  model_id: string | null;
  updated_at: string;
}

export const listPerfImportsTool: McpTool = {
  definition: {
    name: "list_perf_imports",
    description:
      "Lista gli import Adv Performance del workspace: file caricati dall'utente con i KPI aggregati (spesa, impressioni, righe) per periodo + canale. Usalo per scegliere su quale import chiamare get_perf_dashboard o get_perf_analysis.",
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: ["meta", "snapchat", "google", "tiktok"],
          description: "Filtra per canale. Default tutti.",
        },
        status: {
          type: "string",
          enum: ["validated", "parsing", "failed"],
          description:
            "Filtra per status. Default 'validated' (gli unici utilizzabili).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Default 30.",
        },
      },
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const admin = createAdminClient();
    const limit = typeof args.limit === "number" ? args.limit : 30;
    const status =
      typeof args.status === "string" ? args.status : "validated";
    let q = admin
      .from("mait_perf_imports")
      .select(
        "id, channel, period_from, period_to, currency, status, row_count, total_spend, total_impressions, file_name, created_at",
      )
      .eq("workspace_id", ctx.workspaceId)
      .order("period_to", { ascending: false })
      .limit(limit);
    if (typeof args.channel === "string") q = q.eq("channel", args.channel);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      return {
        content: [{ type: "text", text: `Errore DB: ${error.message}` }],
        isError: true,
      };
    }
    const rows = (data as PerfImportRow[] | null) ?? [];
    if (rows.length === 0) {
      return {
        content: [
          { type: "text", text: "Nessun import Adv Performance trovato." },
        ],
      };
    }
    const text = [
      `${rows.length} import (ordinati per period_to DESC):`,
      "",
      ...rows.map((r) =>
        [
          `# ${r.channel.toUpperCase()} · ${r.period_from} → ${r.period_to}`,
          r.file_name ? `File: ${r.file_name}` : null,
          `Spesa: ${r.total_spend} ${r.currency ?? ""} · Impressioni: ${r.total_impressions} · Righe: ${r.row_count}`,
          `Status: ${r.status} · Caricato: ${r.created_at}`,
          `ID: ${r.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ].join("\n\n");
    return { content: [{ type: "text", text }] };
  },
};

export const getPerfDashboardTool: McpTool = {
  definition: {
    name: "get_perf_dashboard",
    description:
      "Dashboard completo di un import Adv Performance: KPI del periodo (spesa, impressioni, click, CTR, CPM, CPC, ROAS, acquisti), top campagne per spesa/ROAS, breakdown per tipo creativita', per paese, per obiettivo, per ad name. Restituisce JSON strutturato. Usalo dopo list_perf_imports per ottenere l'id.",
    inputSchema: {
      type: "object",
      properties: {
        import_id: {
          type: "string",
          format: "uuid",
          description: "UUID dell'import (da list_perf_imports).",
        },
        compare: {
          type: "string",
          enum: ["none", "previous", "week", "yoy", "custom"],
          description:
            "Comparison mode. 'previous' = periodo precedente uguale. 'yoy' = stesso periodo anno scorso. Default 'none'.",
        },
        compare_from: { type: "string" },
        compare_to: { type: "string" },
        week_current: { type: "string" },
        week_compare: { type: "string" },
      },
      required: ["import_id"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const importId = String(args.import_id ?? "").trim();
    if (!importId) {
      return {
        content: [{ type: "text", text: "import_id obbligatorio" }],
        isError: true,
      };
    }
    const admin = createAdminClient();
    const out = await loadDashboardData(admin, {
      importId,
      mode:
        (args.compare as
          | "none"
          | "previous"
          | "week"
          | "yoy"
          | "custom"
          | undefined) ?? "none",
      customFrom:
        typeof args.compare_from === "string" ? args.compare_from : undefined,
      customTo:
        typeof args.compare_to === "string" ? args.compare_to : undefined,
      weekCurrent:
        typeof args.week_current === "string" ? args.week_current : undefined,
      weekCompare:
        typeof args.week_compare === "string" ? args.week_compare : undefined,
    });
    if (!out) {
      return {
        content: [
          {
            type: "text",
            text:
              "Import non trovato o non in stato 'validated'. Solo Meta e Snapchat sono supportati al momento.",
          },
        ],
        isError: true,
      };
    }
    if (out.imp.workspace_id !== ctx.workspaceId) {
      return {
        content: [
          { type: "text", text: "Import non appartiene al tuo workspace." },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(out.data, null, 2),
        },
      ],
    };
  },
};

export const getPerfAnalysisTool: McpTool = {
  definition: {
    name: "get_perf_analysis",
    description:
      "Restituisce le analisi AI salvate per un import Adv Performance. Una sezione per blocco del dashboard (overview, purchases, engagement, timeSeries, topCampaigns, ecc.). Inclusi flag edited_by_user e modello LLM che le ha generate.",
    inputSchema: {
      type: "object",
      properties: {
        import_id: {
          type: "string",
          format: "uuid",
          description: "UUID dell'import.",
        },
        locale: {
          type: "string",
          enum: ["it", "en"],
          description:
            "Lingua delle analisi. Default 'it'. Se non esistono in quella lingua, fa fallback all'altra.",
        },
      },
      required: ["import_id"],
      additionalProperties: false,
    },
  },
  handler: async (args, ctx) => {
    const importId = String(args.import_id ?? "").trim();
    const locale = args.locale === "en" ? "en" : "it";
    if (!importId) {
      return {
        content: [{ type: "text", text: "import_id obbligatorio" }],
        isError: true,
      };
    }
    const admin = createAdminClient();
    // Verifica ownership
    const { data: imp } = await admin
      .from("mait_perf_imports")
      .select("workspace_id")
      .eq("id", importId)
      .maybeSingle();
    if (
      !imp ||
      (imp as { workspace_id: string }).workspace_id !== ctx.workspaceId
    ) {
      return {
        content: [
          { type: "text", text: "Import non trovato nel tuo workspace." },
        ],
        isError: true,
      };
    }
    // Primary locale, poi fallback all'altra se vuoto
    const primary = await admin
      .from("mait_perf_analyses")
      .select("section, content, locale, edited_by_user, model_id, updated_at")
      .eq("import_id", importId)
      .eq("locale", locale);
    let rows: PerfAnalysisRow[] = (primary.data as PerfAnalysisRow[] | null) ?? [];
    let usedFallback = false;
    if (rows.length === 0) {
      const fb = await admin
        .from("mait_perf_analyses")
        .select(
          "section, content, locale, edited_by_user, model_id, updated_at",
        )
        .eq("import_id", importId);
      rows = (fb.data as PerfAnalysisRow[] | null) ?? [];
      usedFallback = rows.length > 0;
    }
    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              "Nessuna analisi AI salvata per questo import. Lancia la generazione dalla pagina Adv Performance.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              import_id: importId,
              requested_locale: locale,
              used_fallback_locale: usedFallback,
              analyses: rows,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};
