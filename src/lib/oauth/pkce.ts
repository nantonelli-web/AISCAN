import { createHash } from "node:crypto";

/**
 * PKCE — Proof Key for Code Exchange (RFC 7636).
 *
 * Flow:
 *  1. Client genera un `code_verifier` random (43-128 char) e ne
 *     calcola `code_challenge = BASE64URL(SHA256(code_verifier))`.
 *  2. Client chiama /authorize con `code_challenge` + method=S256.
 *  3. Noi memorizziamo (code, code_challenge, method) nel DB.
 *  4. Client chiama /token con `code_verifier`. Noi ricalcoliamo
 *     l'hash e lo confrontiamo con il code_challenge memorizzato.
 *
 * Senza PKCE un intercettore del redirect URI potrebbe scambiare il
 * code per un token. PKCE rende il code inutile senza il verifier
 * (che il client tiene in memoria, non passa mai via rete in chiaro).
 *
 * Per i public client (Claude Desktop = nessun secret) PKCE e'
 * OBBLIGATORIO. Per i confidential client e' raccomandato.
 */

/**
 * Verifica che il `code_verifier` inviato a /token corrisponda al
 * `code_challenge` memorizzato a /authorize.
 *
 * Per metodo S256: ricalcola SHA-256(verifier) urlsafe-base64, no padding.
 * Per metodo plain: confronto diretto (sconsigliato, supportato per
 * compat ma non usato sui client public).
 */
export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): boolean {
  if (!verifier || !challenge) return false;
  if (method === "S256") {
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    return expected === challenge;
  }
  if (method === "plain") {
    return verifier === challenge;
  }
  return false;
}

/**
 * Valida che il code_verifier rispetti i requisiti RFC: 43-128 char,
 * solo URL-safe charset.
 */
export function isValidVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) return false;
  return /^[A-Za-z0-9\-._~]+$/.test(verifier);
}
