import crypto from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for storing third-party provider
 * API keys (BYO Apify / OpenRouter) in the database. Pure Node
 * crypto so the master key never crosses the SQL boundary —
 * pgcrypto is enabled for other reasons but not used here.
 *
 * Master key: 32 bytes (256 bits) supplied as a 64-char hex string
 * via process.env.PROVIDER_KEYS_MASTER. Generate ONCE per
 * environment with `crypto.randomBytes(32).toString('hex')` and
 * store in Vercel as a secret. Rotating it invalidates every
 * previously-stored ciphertext, so plan a re-encrypt migration if
 * you ever need to rotate.
 *
 * Wire format: "iv:tag:ciphertext" with each segment base64. The
 * GCM auth tag protects against silent tamper of the stored bytes
 * — decryption fails loudly if the ciphertext was modified.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const KEY_HEX_LENGTH = 64; // 32 bytes encoded as hex

let cachedKey: Buffer | null = null;

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.PROVIDER_KEYS_MASTER;
  if (!hex) {
    throw new Error(
      "PROVIDER_KEYS_MASTER missing. Generate with `node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))'` and set it in Vercel.",
    );
  }
  if (hex.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      `PROVIDER_KEYS_MASTER must be exactly ${KEY_HEX_LENGTH} hex characters (32 random bytes).`,
    );
  }
  cachedKey = Buffer.from(hex, "hex");
  return cachedKey;
}

/**
 * Encrypt a plaintext secret. Returns a packed string ready to
 * persist as TEXT in mait_provider_keys.encrypted_key.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error("encryptSecret: plaintext is empty");
  }
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypt a packed ciphertext written by encryptSecret. Throws on
 * malformed input or auth-tag mismatch (tampered/wrong key).
 */
export function decryptSecret(packed: string): string {
  if (!packed) {
    throw new Error("decryptSecret: packed value is empty");
  }
  const parts = packed.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "decryptSecret: malformed packed value (expected iv:tag:ciphertext)",
    );
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error(
      `decryptSecret: IV must be ${IV_BYTES} bytes, got ${iv.length}`,
    );
  }
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Last 4 visible chars for masked UI display ("…AbCd"). Kept in
 * the DB alongside the ciphertext so the Settings card can show
 * which key is active without ever decrypting.
 */
export function maskedTail(plaintext: string): string {
  if (!plaintext) return "";
  return plaintext.slice(-4);
}
