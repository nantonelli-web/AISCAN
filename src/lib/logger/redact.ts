import type { Event as SentryEvent } from "@sentry/nextjs";

/**
 * Redaction layer shared by the logger AND the Sentry beforeSend hooks.
 *
 * Two independent rules, applied to every payload BEFORE it leaves the
 * process (console, Sentry, or DB):
 *
 *   1. Value deny-list — the literal secret VALUES read from env are
 *      replaced wherever they appear in any string. Catches the case
 *      where a token was accidentally interpolated into a message/URL.
 *   2. Key-name deny-list — any object key whose NAME looks sensitive
 *      (token/secret/key/authorization/cookie/...) has its value
 *      replaced regardless of content.
 *
 * HARD RULE (enforce in review): never pass the output of
 * `decryptSecret()` (a per-row plaintext BYO key) into logger context.
 * Generic redaction cannot recognise an arbitrary plaintext by shape —
 * only the env-derived values in the deny-list below are caught.
 */

const REDACTED = "[REDACTED]";

// Env vars whose VALUES must never appear in any log.
const SECRET_ENV_KEYS = [
  "APIFY_API_TOKEN",
  "OPENROUTER_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_JWT_SECRET",
  "NEXTAUTH_SECRET",
  "CRON_SECRET",
  "PROVIDER_KEYS_MASTER",
  "META_APP_SECRET",
  "RESEND_API_KEY",
] as const;

// Object KEYS whose value should be redacted by name alone.
const SENSITIVE_KEY =
  /token|secret|key|authorization|cookie|password|passwd|credential|bearer|session|encrypted/i;

const MAX_DEPTH = 6;

/** Snapshot of the literal secret values currently in env (len-gated). */
function secretValues(): string[] {
  const out: string[] = [];
  for (const k of SECRET_ENV_KEYS) {
    const v = process.env[k];
    if (v && v.length >= 8) out.push(v);
  }
  return out;
}

/** Replace any occurrence of a known secret value inside a string. */
export function redactString(s: string): string {
  let out = s;
  for (const secret of secretValues()) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  return out;
}

/**
 * Deep-clone-and-redact arbitrary context. Returns a NEW value; never
 * mutates the input. Truncates excessively deep structures.
 */
export function redactContext(input: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[Object too deep]";
  if (input === null || input === undefined) return input;

  const t = typeof input;
  if (t === "string") return redactString(input as string);
  if (t === "number" || t === "boolean" || t === "bigint") return input;
  if (t === "function") return "[Function]";

  if (input instanceof Error) {
    return { name: input.name, message: redactString(input.message) };
  }
  if (Array.isArray(input)) {
    return input.map((v) => redactContext(v, depth + 1));
  }
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactContext(v, depth + 1);
    }
    return out;
  }
  return String(input);
}

/**
 * Sentry beforeSend / beforeSendTransaction scrubber (Node + edge).
 * Defence-in-depth: even though logger context is pre-redacted, scrub
 * the whole event (request cookies/headers/query, exception values,
 * extra) right before it is sent. Never throws — a scrubber bug must
 * not silently drop the event.
 */
export function scrubEvent<T extends SentryEvent>(event: T): T {
  try {
    if (event.request) {
      delete event.request.cookies;
      const headers = event.request.headers;
      if (headers) {
        delete headers.authorization;
        delete headers.Authorization;
        delete headers.cookie;
        delete headers.Cookie;
      }
      const qs = event.request.query_string;
      if (typeof qs === "string") {
        event.request.query_string = redactString(qs);
      }
    }
    if (event.extra) {
      event.extra = redactContext(event.extra) as Record<string, unknown>;
    }
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) ex.value = redactString(ex.value);
      }
    }
  } catch {
    /* never block sending on a scrub bug */
  }
  return event;
}

/**
 * Edge variant. The implementation uses no Node-only APIs, so it can
 * alias scrubEvent — kept as a separate export for an explicit import
 * seam in sentry.edge.config.ts.
 */
export const scrubEventEdge = scrubEvent;
