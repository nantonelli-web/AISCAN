import type { VerifiedToken } from "@/lib/oauth/verify";
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpTool,
  type InitializeResult,
  RPC_ERROR,
  MCP_PROTOCOL_VERSION,
} from "./types";

import { listBrandsTool, searchBrandTool } from "./tools/brands";
import { getBrandOverviewTool } from "./tools/brand-overview";
import { queryPostsTool } from "./tools/query-posts";
import { getBenchmarksTool } from "./tools/benchmarks";
import {
  listPerfImportsTool,
  getPerfDashboardTool,
  getPerfAnalysisTool,
} from "./tools/perf";

/**
 * Registry dei tool MCP esposti da AISCAN. V1 = solo read.
 * Tutti i tool richiedono lo scope 'read'.
 *
 * Design: niente un-tool-per-canale (sarebbe una caccia al tesoro che
 * Claude perderebbe ogni volta che aggiungiamo un canale). Invece:
 *   - get_brand_overview ritorna i metadata di disponibilita' su TUTTI
 *     i canali (solo conteggi + date, no payload pesanti)
 *   - query_posts e get_benchmarks richiedono `channel` come parametro
 *     obbligatorio cosi' Claude DEVE chiedere all'utente di
 *     contestualizzare prima di chiamarli
 *   - aggiungere un canale nuovo = estendere l'enum + lo switch case
 *     dentro i due tool. Claude lo scopre automaticamente dal
 *     description aggiornato.
 */
export const TOOLS: McpTool[] = [
  listBrandsTool,
  searchBrandTool,
  getBrandOverviewTool,
  queryPostsTool,
  getBenchmarksTool,
  // Adv Performance (import file utente — flusso separato)
  listPerfImportsTool,
  getPerfDashboardTool,
  getPerfAnalysisTool,
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.definition.name, t]));

/* ─── Response helpers ─────────────────────────────────────────── */

function success<T>(
  id: string | number | null,
  result: T,
): JsonRpcResponse<T> {
  return { jsonrpc: "2.0", id, result };
}

function fail(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

/* ─── Method handlers ─────────────────────────────────────────── */

function handleInitialize(id: string | number | null): JsonRpcResponse {
  const result: InitializeResult = {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: "aiscan-mcp",
      version: "0.1.0",
    },
  };
  return success(id, result);
}

function handleToolsList(id: string | number | null): JsonRpcResponse {
  return success(id, {
    tools: TOOLS.map((t) => t.definition),
  });
}

async function handleToolsCall(
  id: string | number | null,
  params: unknown,
  ctx: VerifiedToken,
): Promise<JsonRpcResponse> {
  if (!params || typeof params !== "object") {
    return fail(id, RPC_ERROR.INVALID_PARAMS, "params object required");
  }
  const p = params as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== "string") {
    return fail(id, RPC_ERROR.INVALID_PARAMS, "params.name (string) required");
  }
  const tool = TOOLS_BY_NAME.get(p.name);
  if (!tool) {
    return fail(id, RPC_ERROR.TOOL_NOT_FOUND, `Unknown tool: ${p.name}`);
  }
  const args =
    p.arguments && typeof p.arguments === "object"
      ? (p.arguments as Record<string, unknown>)
      : {};

  // Tutti i tool V1 richiedono 'read'
  if (!ctx.scopes.includes("read")) {
    return fail(
      id,
      RPC_ERROR.UNAUTHORIZED,
      "Token lacks required 'read' scope",
    );
  }

  try {
    const result = await tool.handler(args, ctx);
    return success(id, result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "tool execution failed";
    console.error(`[mcp] tool ${p.name} threw:`, msg);
    return fail(id, RPC_ERROR.INTERNAL_ERROR, msg);
  }
}

/* ─── Dispatcher ─────────────────────────────────────────────── */

export async function dispatch(
  req: JsonRpcRequest,
  ctx: VerifiedToken,
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  // Notifications (id absent) don't get a response per JSON-RPC.
  const isNotification = req.id === undefined;

  switch (req.method) {
    case "initialize":
      return isNotification ? null : handleInitialize(id);
    case "notifications/initialized":
    case "notifications/cancelled":
    case "ping":
      // Niente da fare; per ping rispondiamo con result vuoto se non e' notification.
      if (req.method === "ping" && !isNotification) {
        return success(id, {});
      }
      return null;
    case "tools/list":
      return isNotification ? null : handleToolsList(id);
    case "tools/call":
      return isNotification ? null : handleToolsCall(id, req.params, ctx);
    default:
      if (isNotification) return null;
      return fail(
        id,
        RPC_ERROR.METHOD_NOT_FOUND,
        `Method not found: ${req.method}`,
      );
  }
}
