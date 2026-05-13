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
  if (!authorization?.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  const hash = hashToken(token);
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
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.access_token_expires_at).getTime() < Date.now()) return null;

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
