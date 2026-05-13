import { createAdminClient } from "@/lib/supabase/admin";
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
    console.log("[mcp/auth] no authorization header");
    return null;
  }
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    console.log(
      `[mcp/auth] not Bearer scheme: starts with "${authorization.slice(0, 10)}…"`,
    );
    return null;
  }
  const token = authorization.slice(7).trim();
  if (!token) {
    console.log("[mcp/auth] empty token after Bearer prefix");
    return null;
  }
  const hash = hashToken(token);
  // Non logghiamo il token in chiaro, ma il primo/ultimo 4 char +
  // lunghezza aiuta a distinguere se Claude manda quello che gli
  // abbiamo dato (43 char base64url) o qualcos'altro.
  console.log(
    `[mcp/auth] looking up token len=${token.length} prefix=${token.slice(0, 4)} suffix=${token.slice(-4)} hash_prefix=${hash.slice(0, 8)}`,
  );
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
    console.log("[mcp/auth] no row matches access_token_hash");
    return null;
  }
  if (row.revoked_at) {
    console.log(
      `[mcp/auth] token revoked at ${row.revoked_at} (client=${row.client_id})`,
    );
    return null;
  }
  if (new Date(row.access_token_expires_at).getTime() < Date.now()) {
    console.log(
      `[mcp/auth] token expired at ${row.access_token_expires_at}`,
    );
    return null;
  }
  console.log(
    `[mcp/auth] token OK client=${row.client_id} user=${row.user_id} scopes=${row.scopes.join(",")}`,
  );

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
