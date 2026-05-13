import { NextResponse } from "next/server";

/**
 * GET /.well-known/oauth-authorization-server
 *
 * RFC 8414 OAuth Authorization Server Metadata. I client MCP (Claude
 * Desktop, Cursor) leggono questo endpoint automaticamente per
 * scoprire come autenticarsi: dove fare /authorize, dove scambiare
 * il code, quali scope e quali grant types supportiamo.
 *
 * Il path canonico e' fissato dalla RFC e DEVE stare alla root del
 * dominio, non sotto /api. Quindi vive in src/app/.well-known/...
 *
 * Public, no auth. Cache-Control corto per permettere il rollout di
 * nuove capability senza waiting periods.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // L'issuer DEVE essere l'origin esatto. I client validano che il
  // discovery sia servito dallo stesso origin a cui poi richiedono
  // /authorize e /token. Si legge da NEXT_PUBLIC_APP_URL (gia' usata
  // dal sistema webhook Apify), trim del trailing slash.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  const metadata = {
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/api/oauth/authorize`,
    token_endpoint: `${appUrl}/api/oauth/token`,
    registration_endpoint: `${appUrl}/api/oauth/register`,
    revocation_endpoint: `${appUrl}/api/oauth/revoke`,
    // V1: solo authorization_code + refresh_token. Niente
    // client_credentials, niente password grant (deprecato in 2.1).
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    // PKCE obbligatorio (no plain in produzione, ma supportato a
    // livello tecnico per debug).
    code_challenge_methods_supported: ["S256", "plain"],
    // Public clients via PKCE + confidential via Basic.
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
    scopes_supported: ["read"],
    // Diciamo esplicitamente che il server e' MCP-aware, cosi' i
    // client che leggono il discovery sanno di poter assumere il
    // resource server allo stesso origin.
    service_documentation: `${appUrl}/settings/mcp`,
  };

  return NextResponse.json(metadata, {
    headers: {
      "cache-control": "public, max-age=60, must-revalidate",
    },
  });
}
