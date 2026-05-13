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

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
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
