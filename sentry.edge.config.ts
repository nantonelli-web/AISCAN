import * as Sentry from "@sentry/nextjs";
import { scrubEventEdge } from "@/lib/logger/redact";

/**
 * Sentry init for the edge runtime (src/middleware.ts). Loaded by
 * instrumentation.ts when NEXT_RUNTIME=edge. Kept minimal — no
 * Node-only APIs run here.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  beforeSend: scrubEventEdge,
  enabled:
    process.env.NODE_ENV === "production" || process.env.SENTRY_DEBUG === "1",
});
