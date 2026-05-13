import { randomBytes, createHash } from "node:crypto";

/**
 * Helper unico per generazione, hashing e cleanup di token OAuth.
 *
 * Regole non negoziabili:
 *  - I valori in chiaro escono SOLO al momento della consegna al
 *    client. Tutto cio' che persiste nel DB e' hashato SHA-256 (hex).
 *  - Lunghezza access_token / refresh_token / authorization_code:
 *    32 byte random urlsafe-base64 (~43 char) — sufficiente entropy
 *    e leggibilita' nei log per debug.
 *  - Constant-time comparison sull'hash via Buffer.compare.
 */

/** Lunghezza standard dei token in byte. 32 byte = 256 bit. */
const TOKEN_BYTES = 32;

/** Genera un token random urlsafe-base64. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hash SHA-256 hex di una stringa (token o code). */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time comparison di due hash. */
export function compareHashes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  // Buffer.compare e' constant-time per buffer di stessa lunghezza.
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

/** TTL standard del progetto. */
export const TOKEN_TTL = {
  /** Authorization code: 10 minuti. Standard OAuth 2.1. */
  authorizationCodeSecs: 10 * 60,
  /** Access token: 1 ora. Il client refresha. */
  accessTokenSecs: 60 * 60,
  /** Refresh token: 90 giorni. Dopo scade e l'utente riautorizza. */
  refreshTokenSecs: 90 * 24 * 60 * 60,
} as const;

/** Calcola la scadenza in ISO string. */
export function expiresAt(secsFromNow: number): string {
  return new Date(Date.now() + secsFromNow * 1000).toISOString();
}
