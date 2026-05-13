import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getClientById,
  verifyClientSecret,
  type OAuthClient,
} from "@/lib/oauth/clients";
import {
  generateToken,
  hashToken,
  TOKEN_TTL,
  expiresAt,
} from "@/lib/oauth/tokens";
import { verifyPkce, isValidVerifier } from "@/lib/oauth/pkce";

/**
 * POST /api/oauth/token
 *
 * Due grant supportati (RFC 6749 + RFC 7636):
 *  - authorization_code  — scambia un code (da /authorize) per
 *    access_token + refresh_token
 *  - refresh_token       — rinnova un access_token usando il
 *    refresh_token corrente
 *
 * Body: application/x-www-form-urlencoded (standard OAuth) o JSON.
 * Errori: rispondiamo nello standard { error, error_description }
 * con status code corretto (400 / 401).
 */
export const maxDuration = 10;

interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

function tokenError(
  error: string,
  description: string,
  status = 400,
): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status },
  );
}

/** Parse form-urlencoded o JSON, ritorna un Record. */
async function parseBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return Object.fromEntries(
      Object.entries(j).map(([k, v]) => [k, String(v ?? "")]),
    );
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/** HTTP Basic decode per confidential clients. */
function extractBasicAuth(
  req: Request,
): { clientId: string; clientSecret: string } | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i < 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, i)),
      clientSecret: decodeURIComponent(decoded.slice(i + 1)),
    };
  } catch {
    return null;
  }
}

async function authenticateClient(
  req: Request,
  body: Record<string, string>,
): Promise<OAuthClient | { error: string; status: number }> {
  // Confidential: HTTP Basic
  const basic = extractBasicAuth(req);
  if (basic) {
    const client = await getClientById(basic.clientId);
    if (!client) {
      return { error: "invalid_client", status: 401 };
    }
    const ok = await verifyClientSecret(client, basic.clientSecret);
    if (!ok) return { error: "invalid_client", status: 401 };
    return client;
  }
  // Public: client_id in body, no secret. Verifichiamo che il client
  // sia effettivamente public.
  const clientId = body.client_id;
  if (!clientId) {
    return { error: "invalid_client", status: 401 };
  }
  const client = await getClientById(clientId);
  if (!client) return { error: "invalid_client", status: 401 };
  if (client.token_endpoint_auth_method !== "none") {
    // Confidential client deve usare HTTP Basic.
    return { error: "invalid_client", status: 401 };
  }
  return client;
}

async function issueTokensForGrant(
  client: OAuthClient,
  userId: string,
  workspaceId: string,
  scopes: string[],
): Promise<TokenResponse> {
  const accessToken = generateToken();
  const refreshToken = generateToken();
  const admin = createAdminClient();
  await admin.from("mait_oauth_tokens").insert({
    access_token_hash: hashToken(accessToken),
    refresh_token_hash: hashToken(refreshToken),
    client_id: client.client_id,
    user_id: userId,
    workspace_id: workspaceId,
    scopes,
    access_token_expires_at: expiresAt(TOKEN_TTL.accessTokenSecs),
    refresh_token_expires_at: expiresAt(TOKEN_TTL.refreshTokenSecs),
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL.accessTokenSecs,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

// ─── Grant: authorization_code ─────────────────────────────────────
async function handleAuthorizationCode(
  client: OAuthClient,
  body: Record<string, string>,
): Promise<NextResponse> {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;
  if (!code || !redirectUri) {
    return tokenError(
      "invalid_request",
      "Missing code or redirect_uri",
    );
  }

  const admin = createAdminClient();
  const codeHash = hashToken(code);
  const { data: authRow } = await admin
    .from("mait_oauth_authorizations")
    .select(
      "code_hash, client_id, user_id, workspace_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used_at",
    )
    .eq("code_hash", codeHash)
    .maybeSingle();

  type AuthRow = {
    code_hash: string;
    client_id: string;
    user_id: string;
    workspace_id: string;
    redirect_uri: string;
    scopes: string[];
    code_challenge: string;
    code_challenge_method: string;
    expires_at: string;
    used_at: string | null;
  };
  const auth = authRow as AuthRow | null;

  if (!auth) {
    return tokenError("invalid_grant", "Unknown authorization code");
  }
  if (auth.client_id !== client.client_id) {
    return tokenError("invalid_grant", "Code was issued to a different client");
  }
  if (auth.used_at) {
    // Codice gia' usato: revoca tutti i token emessi a quel cliente
    // (anti-replay aggressive per OAuth 2.1).
    await admin
      .from("mait_oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("client_id", client.client_id)
      .is("revoked_at", null);
    return tokenError("invalid_grant", "Authorization code already used");
  }
  if (new Date(auth.expires_at).getTime() < Date.now()) {
    return tokenError("invalid_grant", "Authorization code expired");
  }
  if (auth.redirect_uri !== redirectUri) {
    return tokenError(
      "invalid_grant",
      "redirect_uri does not match the one used at /authorize",
    );
  }

  // PKCE: verify (sempre se challenge presente al consent)
  if (auth.code_challenge) {
    if (!codeVerifier || !isValidVerifier(codeVerifier)) {
      return tokenError("invalid_grant", "Missing or malformed code_verifier");
    }
    const ok = verifyPkce(
      codeVerifier,
      auth.code_challenge,
      auth.code_challenge_method,
    );
    if (!ok) {
      return tokenError("invalid_grant", "PKCE verification failed");
    }
  }

  // Mark code as used (idempotente)
  await admin
    .from("mait_oauth_authorizations")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", codeHash);

  const tokens = await issueTokensForGrant(
    client,
    auth.user_id,
    auth.workspace_id,
    auth.scopes,
  );
  return NextResponse.json(tokens);
}

// ─── Grant: refresh_token ─────────────────────────────────────────
async function handleRefreshToken(
  client: OAuthClient,
  body: Record<string, string>,
): Promise<NextResponse> {
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    return tokenError("invalid_request", "Missing refresh_token");
  }
  const admin = createAdminClient();
  const refreshHash = hashToken(refreshToken);
  const { data: existing } = await admin
    .from("mait_oauth_tokens")
    .select(
      "id, client_id, user_id, workspace_id, scopes, refresh_token_expires_at, revoked_at",
    )
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();
  type T = {
    id: string;
    client_id: string;
    user_id: string;
    workspace_id: string;
    scopes: string[];
    refresh_token_expires_at: string | null;
    revoked_at: string | null;
  };
  const row = existing as T | null;
  if (!row) {
    return tokenError("invalid_grant", "Unknown refresh_token");
  }
  if (row.revoked_at) {
    return tokenError("invalid_grant", "Refresh token revoked");
  }
  if (row.client_id !== client.client_id) {
    return tokenError("invalid_grant", "Refresh token issued to another client");
  }
  if (
    row.refresh_token_expires_at &&
    new Date(row.refresh_token_expires_at).getTime() < Date.now()
  ) {
    return tokenError("invalid_grant", "Refresh token expired");
  }

  // Rotate: revoca il vecchio token e emette uno nuovo.
  await admin
    .from("mait_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", row.id);

  const tokens = await issueTokensForGrant(
    client,
    row.user_id,
    row.workspace_id,
    row.scopes,
  );
  return NextResponse.json(tokens);
}

export async function POST(req: Request) {
  const body = await parseBody(req);
  const grant = body.grant_type;
  if (!grant) {
    return tokenError("invalid_request", "Missing grant_type");
  }

  const auth = await authenticateClient(req, body);
  if ("error" in auth) {
    return NextResponse.json(
      {
        error: auth.error,
        error_description: "Client authentication failed",
      },
      { status: auth.status },
    );
  }
  const client = auth;

  if (grant === "authorization_code") {
    if (!client.grant_types.includes("authorization_code")) {
      return tokenError(
        "unauthorized_client",
        "Client not allowed for authorization_code grant",
      );
    }
    return handleAuthorizationCode(client, body);
  }
  if (grant === "refresh_token") {
    if (!client.grant_types.includes("refresh_token")) {
      return tokenError(
        "unauthorized_client",
        "Client not allowed for refresh_token grant",
      );
    }
    return handleRefreshToken(client, body);
  }
  return tokenError("unsupported_grant_type", `grant_type=${grant} not supported`);
}
