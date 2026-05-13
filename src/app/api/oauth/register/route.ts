import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateClientId,
  generateClientSecret,
} from "@/lib/oauth/clients";
import { hashToken } from "@/lib/oauth/tokens";

/**
 * POST /api/oauth/register
 *
 * RFC 7591 Dynamic Client Registration. I client MCP la chiamano
 * automaticamente al primo collegamento per registrarsi:
 *   - inviano il loro `client_name`, `redirect_uris`, scope desiderati
 *   - noi rispondiamo con `client_id` (+ `client_secret` se confidential)
 *
 * Open registration: chiunque puo' registrare un client. Questo e' lo
 * standard MCP. La sicurezza si appoggia su:
 *   1. PKCE obbligatorio sui public client (token_endpoint_auth_method=none)
 *   2. Pagina di consenso utente — chi possiede un client_id non puo'
 *      fare nulla finche' un utente reale non autorizza esplicitamente
 *      via /api/oauth/authorize.
 *
 * Tutti i client DCR vengono marcati is_dynamic=true cosi' un admin
 * puo' revocarli/auditare in /settings/mcp/clients.
 */
export const maxDuration = 10;

const schema = z.object({
  client_name: z.string().min(1).max(200).optional(),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic"])
    .optional(),
  scope: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Invalid registration payload" },
      { status: 400 },
    );
  }

  // V1: limitiamo gli scope a quelli supportati (read).
  const requestedScopes = (parsed.data.scope ?? "read")
    .split(/\s+/)
    .filter(Boolean);
  const allowedScopes = ["read"];
  const grantedScopes = requestedScopes.filter((s) => allowedScopes.includes(s));
  if (grantedScopes.length === 0) grantedScopes.push("read");

  const authMethod = parsed.data.token_endpoint_auth_method ?? "none";
  const grantTypes = parsed.data.grant_types ?? [
    "authorization_code",
    "refresh_token",
  ];
  const responseTypes = parsed.data.response_types ?? ["code"];

  const clientId = generateClientId(true);
  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (authMethod === "client_secret_basic") {
    clientSecret = generateClientSecret();
    clientSecretHash = hashToken(clientSecret);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("mait_oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: parsed.data.client_name ?? "Unnamed MCP client",
    redirect_uris: parsed.data.redirect_uris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: authMethod,
    scopes: grantedScopes,
    is_dynamic: true,
  });
  if (error) {
    console.error("[oauth/register] insert failed:", error.message);
    return NextResponse.json(
      { error: "server_error", error_description: error.message },
      { status: 500 },
    );
  }
  console.log(
    `[oauth/register] new client=${clientId} name="${parsed.data.client_name ?? ""}" redirect=${parsed.data.redirect_uris.join("|")} auth_method=${authMethod} grants=${grantTypes.join(",")}`,
  );

  // Response RFC 7591: client_secret presente solo per confidential.
  // L'utente non lo rivedra' MAI: dev'essere salvato subito dal client.
  return NextResponse.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: parsed.data.client_name ?? "Unnamed MCP client",
      redirect_uris: parsed.data.redirect_uris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
      scope: grantedScopes.join(" "),
    },
    { status: 201 },
  );
}
