import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { hashToken } from "./tokens";

/**
 * Verifica un access_token Bearer presentato da un client MCP.
 * Ritorna le info utente/workspace/scope se valido, null altrimenti.
 *
 * Side effect: aggiorna last_used_at del token (no await — best
 * effort, non blocchiamo la response).
 */
export interface VerifiedToken {
  tokenId: string;
  userId: string;
  workspaceId: string;
  clientId: string;
  scopes: string[];
}

export async function verifyAccessToken(
  authorization: string | null,
): Promise<VerifiedToken | null> {
  if (!authorization) {
    logger.debug("no authorization header", {
      channel: "oauth-verify",
      event: "auth.missing_header",
    });
    return null;
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    logger.debug("not Bearer scheme", {
      channel: "oauth-verify",
      event: "auth.not_bearer",
    });
    return null;
  }
  const token = authorization.slice(7).trim();
  if (!token) {
    logger.debug("empty token after Bearer prefix", {
      channel: "oauth-verify",
      event: "auth.empty_token",
    });
    return null;
  }
  const hash = hashToken(token);
  // Non logghiamo NESSUN carattere del token (nemmeno prefix/suffix): il
  // solo hash_prefix non-reversibile basta a correlare la richiesta con
  // la riga in mait_oauth_tokens durante il debug.
  logger.debug("looking up token", {
    channel: "oauth-verify",
    event: "auth.lookup",
    tokenLength: token.length,
    hashPrefix: hash.slice(0, 8),
  });
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_oauth_tokens")
    .select(
      "id, user_id, workspace_id, client_id, scopes, access_token_expires_at, revoked_at",
    )
    .eq("access_token_hash", hash)
    .maybeSingle();
  type Row = {
    id: string;
    user_id: string;
    workspace_id: string;
    client_id: string;
    scopes: string[];
    access_token_expires_at: string;
    revoked_at: string | null;
  };
  const row = data as Row | null;
  if (!row) {
    logger.debug("no row matches access_token_hash", {
      channel: "oauth-verify",
      event: "auth.no_match",
    });
    return null;
  }
  if (row.revoked_at) {
    logger.debug("token revoked", {
      channel: "oauth-verify",
      event: "auth.revoked",
      clientId: row.client_id,
      revokedAt: row.revoked_at,
    });
    return null;
  }
  if (new Date(row.access_token_expires_at).getTime() < Date.now()) {
    logger.debug("token expired", {
      channel: "oauth-verify",
      event: "auth.expired",
      expiresAt: row.access_token_expires_at,
    });
    return null;
  }
  logger.debug("token OK", {
    channel: "oauth-verify",
    event: "auth.ok",
    clientId: row.client_id,
    userId: row.user_id,
    scopes: row.scopes.join(","),
  });

  // Best-effort touch
  admin
    .from("mait_oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => undefined, () => undefined);

  return {
    tokenId: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    clientId: row.client_id,
    scopes: row.scopes,
  };
}
