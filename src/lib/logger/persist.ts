import type { LogContext, LogLevel } from "./index";

/**
 * Best-effort writer of business/audit + warn/error events to the
 * `mait_logs` Supabase table.
 *
 * Contract:
 *   - NEVER throws and NEVER blocks the caller (callers use `void`).
 *   - No-op on the edge runtime: the service-role admin client is a
 *     server-trust-only credential and must not run on edge.
 *   - Persists warn/error always; persists info only when it carries
 *     an explicit `event` key (an "audit" event), not every info log.
 *
 * The supabase admin client is imported dynamically so it stays out of
 * the edge bundle and off the hot path until the first DB log.
 */
export async function persistLog(
  level: LogLevel,
  message: string,
  ctx: LogContext, // already redacted by the caller (logger.emit)
  err?: unknown,
): Promise<void> {
  // Never run in the browser (no service-role key client-side) nor on
  // the edge runtime (admin client is a server-trust-only credential).
  if (typeof window !== "undefined") return;
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (level === "debug") return;
  if (level === "info" && !ctx.event) return;

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const e = err instanceof Error ? err : undefined;
    await admin.from("mait_logs").insert({
      level,
      event: ctx.event ?? null,
      message,
      channel: ctx.channel ?? null,
      workspace_id: ctx.workspaceId ?? null,
      user_id: ctx.userId ?? null,
      competitor_id: ctx.competitorId ?? null,
      job_id: ctx.jobId ?? null,
      request_id: ctx.requestId ?? null,
      context: ctx,
      error_name: e?.name ?? null,
      error_stack: e?.stack ?? null,
    });
  } catch {
    /* Logging must never break the request. The console + Sentry paths
       already captured this event; swallow the DB failure. */
  }
}
