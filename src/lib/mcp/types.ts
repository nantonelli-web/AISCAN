import type { VerifiedToken } from "@/lib/oauth/verify";

/**
 * Tipi condivisi del server MCP. Il protocollo MCP usa JSON-RPC 2.0
 * sopra HTTP "Streamable HTTP": ogni richiesta e' un POST JSON con
 * jsonrpc/id/method/params, la response e' un JSON con id/result o
 * id/error.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: string | number | null;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

/**
 * Tool definition esposta a tools/list. Lo schema input segue
 * JSON Schema (Draft 7) — il client MCP lo usa per validare i
 * parametri prima di inviarli e per offrire autocomplete.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Tool handler: riceve gli argomenti gia' validati e il contesto di
 * autenticazione (workspaceId, userId, scope). Ritorna il risultato
 * structured che diventera' il `content` della response MCP.
 */
export type McpToolHandler = (
  args: Record<string, unknown>,
  ctx: VerifiedToken,
) => Promise<{
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: Record<string, unknown> }
  >;
  isError?: boolean;
}>;

export interface McpTool {
  definition: McpToolDefinition;
  handler: McpToolHandler;
}

/** Codici JSON-RPC + estensioni MCP. */
export const RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP-specific
  UNAUTHORIZED: -32001,
  TOOL_NOT_FOUND: -32002,
} as const;

/** Versione del protocollo MCP che supportiamo. */
export const MCP_PROTOCOL_VERSION = "2025-03-26";

export interface InitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: { listChanged?: boolean };
  };
  serverInfo: {
    name: string;
    version: string;
  };
}
