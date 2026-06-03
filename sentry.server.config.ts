import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/logger/redact";

/**
 * Sentry init for the Node server runtime (route handlers, server
 * actions, cron). Loaded by instrumentation.ts when NEXT_RUNTIME=nodejs.
 *
 * `enabled` is gated so local dev does not spam the project unless
 * SENTRY_DEBUG=1. `beforeSend`/`beforeSendTransaction` run the shared
 * redaction scrubber as defence-in-depth (logger context is already
 * redacted, but raw request data attached by the SDK is not).
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  enabled:
    process.env.NODE_ENV === "production" || process.env.SENTRY_DEBUG === "1",
});
