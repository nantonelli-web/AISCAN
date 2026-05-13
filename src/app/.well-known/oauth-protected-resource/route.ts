import { NextResponse } from "next/server";

/**
 * GET /.well-known/oauth-protected-resource
 *
 * RFC 9728 OAuth Protected Resource Metadata. I client MCP recenti
 * (spec 2025-06-18) leggono questo endpoint PRIMA di chiamare il
 * resource server (=/api/mcp). Dichiara:
 *   - resource: l'URL del resource server protetto
 *   - authorization_servers: dove andare a fare OAuth flow
 *   - scopes_supported
 *   - bearer_methods_supported: come passare il token (Authorization
 *     header e' lo standard)
 *
 * Senza questo endpoint, Claude.ai NON manda il Bearer al
 * /api/mcp anche se ha completato OAuth — perche' non sa che il
 * resource e' protetto.
 *
 * Public, no auth.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Stesso ragionamento di /.well-known/oauth-authorization-server:
  // pubblichiamo l'URL canonico finale leggendo l'host dalla request,
  // cosi' i client raggiungono /api/mcp senza dover seguire un
  // redirect (che scarterebbe il Bearer).
  const url = new URL(req.url);
  const xfwHost = req.headers.get("x-forwarded-host");
  const xfwProto = req.headers.get("x-forwarded-proto");
  const host = xfwHost ?? url.host;
  const proto = xfwProto ?? url.protocol.replace(":", "");
  const appUrl = `${proto}://${host}`;
  return NextResponse.json(
    {
      resource: `${appUrl}/api/mcp`,
      authorization_servers: [appUrl],
      scopes_supported: ["read"],
      bearer_methods_supported: ["header"],
      resource_documentation: `${appUrl}/settings/mcp`,
    },
    {
      headers: {
        "cache-control": "public, max-age=60, must-revalidate",
      },
    },
  );
}
