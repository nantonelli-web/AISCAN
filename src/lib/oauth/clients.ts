import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";
import { hashToken, compareHashes } from "./tokens";

/**
 * Lookup + registrazione dei client OAuth (Claude Desktop, Cursor, ecc.)
 *
 * Due tipi:
 *  - Public client (token_endpoint_auth_method='none'): senza secret,
 *    autenticazione via PKCE. Usato dai client MCP standard.
 *  - Confidential client (token_endpoint_auth_method='client_secret_basic'):
 *    con secret, autenticazione HTTP Basic. Per integrazioni
 *    backend-to-backend (es. webhook custom).
 */

export interface OAuthClient {
  id: string;
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: "none" | "client_secret_basic";
  scopes: string[];
  is_dynamic: boolean;
  created_by: string | null;
}

/** Genera un client_id univoco con prefisso che indica l'origine. */
export function generateClientId(isDynamic: boolean): string {
  const prefix = isDynamic ? "dyn" : "app";
  const rand = randomBytes(12).toString("base64url");
  return `${prefix}_${rand}`;
}

/** Genera un client_secret in chiaro (solo per i confidential clients). */
export function generateClientSecret(): string {
  return randomBytes(24).toString("base64url");
}

export async function getClientById(
  clientId: string,
): Promise<OAuthClient | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mait_oauth_clients")
    .select(
      "id, client_id, client_secret_hash, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scopes, is_dynamic, created_by",
    )
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as OAuthClient | null) ?? null;
}

/** Verifica le credenziali client_id + client_secret (per confidential). */
export async function verifyClientSecret(
  client: OAuthClient,
  presentedSecret: string,
): Promise<boolean> {
  if (!client.client_secret_hash) return false;
  const presentedHash = hashToken(presentedSecret);
  // Constant-time compare (consistent with the project's stated policy)
  // instead of ===, which short-circuits on the first differing char.
  return compareHashes(client.client_secret_hash, presentedHash);
}

/**
 * Valida che la redirect_uri presentata dal client a /authorize sia
 * esattamente una di quelle registrate. Exact match (no path/query
 * matching) come da RFC 6749 §3.1.2.
 */
export function isRedirectUriAllowed(
  client: OAuthClient,
  presented: string,
): boolean {
  return client.redirect_uris.includes(presented);
}

/**
 * Filtra gli scope richiesti contro quelli registrati dal client.
 * Default 'read' se il client non chiede nulla.
 */
export function intersectScopes(
  client: OAuthClient,
  requested: string[] | undefined,
): string[] {
  const allowed = new Set(client.scopes);
  if (!requested || requested.length === 0) {
    return client.scopes.includes("read") ? ["read"] : client.scopes.slice(0, 1);
  }
  return requested.filter((s) => allowed.has(s));
}
