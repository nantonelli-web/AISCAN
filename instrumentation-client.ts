import * as Sentry from "@sentry/nextjs";

/**
 * Sentry init for the browser (Next.js 15 / Sentry 10 convention —
 * replaces the old sentry.client.config.ts). Session Replay is left off
 * for the foundation pass (cost + PII). Events route through the
 * same-origin `/monitoring` tunnel to dodge adblockers and stay
 * CSP-safe.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  tunnel: "/monitoring",
  enabled:
    process.env.NODE_ENV === "production" || process.env.SENTRY_DEBUG === "1",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
