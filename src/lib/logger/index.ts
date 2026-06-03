import * as Sentry from "@sentry/nextjs";
import { redactContext } from "./redact";
import { persistLog } from "./persist";

/**
 * Central application logger.
 *
 * One call fans out to three sinks:
 *   1. console — keeps the existing `[channel]` bracket-tag readability
 *      so Vercel function logs stay greppable.
 *   2. Sentry — warn/error only, with correlation tags (channel, event,
 *      workspace, request) for grouping + real-time email alerts.
 *   3. Supabase `mait_logs` — best-effort durable audit trail (see
 *      persist.ts for the persistence policy).
 *
 * All context is redacted (see redact.ts) BEFORE it touches any sink.
 * The single `import * as Sentry from "@sentry/nextjs"` is runtime
 * agnostic — the package resolves the correct SDK build per runtime, so
 * this module is safe to import from both Node and edge code.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Bracket-tag for console readability, e.g. "Google Ads". */
  channel?: string;
  /** Short stable key for grouping/filtering, e.g. "scrape.completed". */
  event?: string;
  requestId?: string;
  jobId?: string;
  workspaceId?: string | null;
  userId?: string | null;
  competitorId?: string | null;
  /** Free-form extra fields — redacted before leaving the process. */
  [k: string]: unknown;
}

function tag(ctx: LogContext): string {
  return ctx.channel ? `[${ctx.channel}]` : "";
}

function toSentryLevel(level: LogLevel): Sentry.SeverityLevel {
  return level === "error" ? "error" : "warning";
}

function emit(
  level: LogLevel,
  message: string,
  ctx: LogContext = {},
  err?: unknown,
): void {
  const safe = redactContext(ctx) as LogContext;
  const line = `${tag(ctx)} ${message}`.trim();

  // 1. Console.
  if (level === "error") console.error(line, safe, err ?? "");
  else if (level === "warn") console.warn(line, safe);
  else if (level === "info") console.info(line, safe);
  else console.debug(line, safe);

  // 2. Sentry (warn/error only).
  if (level === "warn" || level === "error") {
    Sentry.withScope((scope) => {
      scope.setLevel(toSentryLevel(level));
      if (ctx.channel) scope.setTag("channel", ctx.channel);
      if (ctx.event) scope.setTag("event", ctx.event);
      if (ctx.workspaceId) scope.setTag("workspace_id", String(ctx.workspaceId));
      if (ctx.requestId) scope.setTag("request_id", String(ctx.requestId));
      scope.setContext("log", safe as Record<string, unknown>);
      if (err instanceof Error) {
        Sentry.captureException(err);
      } else {
        Sentry.captureMessage(message, toSentryLevel(level));
      }
    });
  }

  // 3. Supabase — fire-and-forget, never awaited, never throws.
  void persistLog(level, message, safe, err);
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    emit("debug", message, context),
  info: (message: string, context?: LogContext) =>
    emit("info", message, context),
  warn: (message: string, context?: LogContext, err?: unknown) =>
    emit("warn", message, context, err),
  error: (message: string, context?: LogContext, err?: unknown) =>
    emit("error", message, context, err),
};
