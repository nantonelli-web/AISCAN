import * as Sentry from "@sentry/nextjs";

/**
 * Next.js 15 instrumentation hook. Loads the per-runtime Sentry init
 * (Node vs edge) and wires `onRequestError` — the only way to capture
 * errors thrown while rendering RSC / route handlers / server actions,
 * which never reach the client `global-error.tsx` boundary.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
