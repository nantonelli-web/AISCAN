import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-key fixed-window rate limit, backed by the atomic
 * `mait_rate_limit_hit` RPC (migration 0063). Use to cap expensive paid
 * actions per workspace so a single account can't drain the company's
 * OpenRouter / Apify budget by looping requests.
 *
 * Fail-open: if the RPC errors (e.g. migration 0063 not yet applied),
 * we ALLOW the action and log — a rate limiter must not take the app
 * down. Applying the migration activates enforcement.
 */
export interface RateLimitSpec {
  /** Bucket key, e.g. `ai:<workspaceId>` or `scan:<workspaceId>`. */
  key: string;
  /** Max hits allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export async function enforceRateLimit(
  admin: SupabaseClient,
  spec: RateLimitSpec,
): Promise<{ ok: boolean }> {
  const { data, error } = await admin.rpc("mait_rate_limit_hit", {
    p_key: spec.key,
    p_limit: spec.limit,
    p_window_seconds: spec.windowSeconds,
  });
  if (error) {
    // Most likely the migration isn't applied yet. Fail open + log once.
    console.warn(
      `[rate-limit] mait_rate_limit_hit RPC failed (fail-open): ${error.message}`,
    );
    return { ok: true };
  }
  return { ok: data === true };
}

/** Default ceilings (overridable via env). Generous enough that normal
 *  interactive use never hits them — they exist to stop runaway loops. */
export const AI_CALLS_PER_HOUR = Number.parseInt(
  process.env.AI_RATE_LIMIT_PER_HOUR ?? "40",
  10,
);
export const SCANS_PER_MINUTE = Number.parseInt(
  process.env.SCAN_RATE_LIMIT_PER_MINUTE ?? "10",
  10,
);
