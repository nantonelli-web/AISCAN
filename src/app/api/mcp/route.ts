import { NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/oauth/verify";
import { dispatch } from "@/lib/mcp/server";
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  RPC_ERROR,
} from "@/lib/mcp/types";

/**
 * POST /api/mcp
 *
 * Endpoint MCP "Streamable HTTP transport". Accetta una singola
 * richiesta JSON-RPC o un batch (array). Tutti i metodi richiedono
 * un access_token OAuth Bearer valido — se manca rispondiamo 401
 * con WWW-Authenticate cosi' i client MCP scoprono l'authorization
 * server da contattare (RFC 6750 §3.1 + RFC 8414 discovery).
 *
 * Niente streaming SSE per V1: i tool sono brevi (<5s) e una
 * response sincrona basta. Lo stream lo aggiungiamo quando servira'
 * per tool long-running (es. scan in background).
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function wwwAuthenticateHeader(): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  // RFC 9728 OAuth Protected Resource Metadata: indichiamo lendpoint
  // protected-resource cosi' i client MCP (spec 2025-06-18) sanno
  // che il resource e' protetto e dove sta il discovery
  // dellauthorization server. Manteniamo anche as_uri come fallback
  // per client su MCP spec 2025-03-26.
  return [
    `Bearer realm="AISCAN MCP"`,
    `resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`,
    `as_uri="${appUrl}/.well-known/oauth-authorization-server"`,
  ].join(", ");
}

function unauthorized(message = "Missing or invalid access token"): NextResponse {
  return NextResponse.json(
    { error: "unauthorized", error_description: message },
    {
      status: 401,
      headers: { "WWW-Authenticate": wwwAuthenticateHeader() },
    },
  );
}

function parseError(): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: RPC_ERROR.PARSE_ERROR, message: "Invalid JSON-RPC body" },
    } satisfies JsonRpcResponse,
    { status: 400 },
  );
}

export async function POST(req: Request) {
  // Log dettagliato dei header per debug. Non logghiamo i VALORI dei
  // header sensibili (authorization), solo la lista presente.
  const headerNames = Array.from(req.headers.keys());
  const host = req.headers.get("host");
  const xfwHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto");
  console.log(
    `[mcp] POST host=${host} xfw_host=${xfwHost} proto=${proto} headers=[${headerNames.join(",")}]`,
  );
  const ctx = await verifyAccessToken(req.headers.get("authorization"));
  if (!ctx) return unauthorized();

  const raw = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return parseError();
  }

  // Batch
  if (Array.isArray(parsed)) {
    const responses: JsonRpcResponse[] = [];
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== "object" ||
        (item as { jsonrpc?: string }).jsonrpc !== "2.0"
      ) {
        responses.push({
          jsonrpc: "2.0",
          id: null,
          error: { code: RPC_ERROR.INVALID_REQUEST, message: "Invalid request" },
        });
        continue;
      }
      const res = await dispatch(item as JsonRpcRequest, ctx);
      if (res) responses.push(res);
    }
    if (responses.length === 0) {
      // Tutti notifications: per JSON-RPC il response e' vuoto (204).
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(responses);
  }

  // Single
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { jsonrpc?: string }).jsonrpc !== "2.0"
  ) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: RPC_ERROR.INVALID_REQUEST,
          message: "Body must be JSON-RPC 2.0",
        },
      } satisfies JsonRpcResponse,
      { status: 400 },
    );
  }

  const res = await dispatch(parsed as JsonRpcRequest, ctx);
  if (!res) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(res);
}

/**
 * GET /api/mcp — alcuni client probe l'endpoint con HEAD/GET prima
 * di iniziare. Rispondiamo con un piccolo health hint che li aiuta
 * a riconoscere il server. Non e' parte dello standard MCP ma e'
 * comune.
 */
export async function GET() {
  return NextResponse.json({
    server: "aiscan-mcp",
    version: "0.1.0",
    transport: "streamable-http",
    documentation: `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/settings/mcp`,
  });
}
