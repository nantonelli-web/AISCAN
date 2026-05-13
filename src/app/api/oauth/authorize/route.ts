import { NextResponse } from "next/server";
import {
  getClientById,
  isRedirectUriAllowed,
  intersectScopes,
} from "@/lib/oauth/clients";

/**
 * GET /api/oauth/authorize
 *
 * Entry point del flow OAuth Authorization Code. Il client MCP
 * (Claude Desktop, ecc.) reindirizza l'utente qui con i parametri
 * dello standard:
 *   - client_id           — il client registrato (DCR o seed)
 *   - redirect_uri        — uno di quelli registrati per il client
 *   - response_type=code  — V1 supportiamo solo questo
 *   - scope=read          — sottoinsieme di mait_oauth_clients.scopes
 *   - state               — opaque, viene rispedito al callback
 *   - code_challenge      — PKCE
 *   - code_challenge_method=S256
 *
 * Comportamento:
 *  1. Validiamo i parametri. Se invalidi → 400 con error standard
 *     (RFC 6749 §4.1.2.1).
 *  2. Se validi → redirect a /oauth/consent (pagina UI) con i
 *     parametri preservati. La pagina chiede all'utente "vuoi
 *     autorizzare {client_name} a leggere AISCAN?". Se ok, la
 *     pagina (server action) genera il code e fa il redirect al
 *     redirect_uri originale del client.
 *
 * Niente sessione: l'auth utente viene gestita dalla pagina di
 * consent che richiede login se mancante.
 */
export const maxDuration = 10;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const scope = url.searchParams.get("scope");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod =
    url.searchParams.get("code_challenge_method") ?? "S256";
  console.log(
    `[oauth/authorize] GET client_id=${clientId} redirect_uri=${redirectUri} scope=${scope} response_type=${responseType} pkce=${!!codeChallenge}`,
  );

  // 1) Validazioni base
  if (!clientId || !redirectUri || !responseType) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description:
          "Missing required parameter (client_id, redirect_uri, response_type)",
      },
      { status: 400 },
    );
  }
  if (responseType !== "code") {
    return NextResponse.json(
      {
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      },
      { status: 400 },
    );
  }

  const client = await getClientById(clientId);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 },
    );
  }

  // 2) Redirect URI validation — DEVE matchare exact prima di
  // qualsiasi redirect dopo questo punto, altrimenti un client
  // malevolo potrebbe usarci come open redirector.
  if (!isRedirectUriAllowed(client, redirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "redirect_uri not registered for this client",
      },
      { status: 400 },
    );
  }

  // 3) PKCE: obbligatorio per i public client (auth_method='none').
  if (
    client.token_endpoint_auth_method === "none" &&
    (!codeChallenge || codeChallenge.length < 43)
  ) {
    const errorParams = new URLSearchParams({
      error: "invalid_request",
      error_description: "PKCE code_challenge is required for public clients",
      ...(state ? { state } : {}),
    });
    return NextResponse.redirect(`${redirectUri}?${errorParams}`);
  }

  // 4) Scope filtering
  const requestedScopes = scope ? scope.split(/\s+/).filter(Boolean) : [];
  const grantedScopes = intersectScopes(client, requestedScopes);
  if (grantedScopes.length === 0) {
    const errorParams = new URLSearchParams({
      error: "invalid_scope",
      error_description: "No requested scope is supported by this client",
      ...(state ? { state } : {}),
    });
    return NextResponse.redirect(`${redirectUri}?${errorParams}`);
  }

  // 5) Tutto valido → redirect a pagina di consent. La pagina vive a
  // /oauth/consent (server component dentro (dashboard) cosi
  // l'utente deve essere loggato per arrivarci).
  const consentParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: grantedScopes.join(" "),
    ...(state ? { state } : {}),
    ...(codeChallenge ? { code_challenge: codeChallenge } : {}),
    code_challenge_method: codeChallengeMethod,
  });
  return NextResponse.redirect(
    `${new URL("/oauth/consent", req.url)}?${consentParams}`,
  );
}
