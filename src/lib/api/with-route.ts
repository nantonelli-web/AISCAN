import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Throw an ApiError from inside a handler to return a controlled,
 * non-500 status with a safe public message. Anything else thrown is
 * treated as an unexpected error → logged at `error` (Sentry + DB) and
 * returned as an opaque 500 so internals never leak to the client.
 */
export class ApiError extends Error {
  status: number;
  publicMessage?: string;
  constructor(status: number, message: string, publicMessage?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

function requestId(req: Request): string {
  return (
    req.headers.get("x-vercel-id") ??
    globalThis.crypto?.randomUUID?.() ??
    String(Date.now())
  );
}

/**
 * Wrap a Route Handler with standardized error handling + logging.
 *
 * Additive and opt-in: existing routes keep working untouched. Migrate
 * a route by wrapping its handler and replacing inline `console.error`
 * with `logger.error` or `throw new ApiError(...)`. Routes that already
 * return their own `{ error }` responses for control flow (e.g. 400/402
 * validation) keep doing so — the wrapper only homogenises the
 * *uncaught* path.
 */
export function withRoute<C = unknown>(
  channel: string,
  handler: RouteHandler<C>,
): RouteHandler<C> {
  return async (req, ctx) => {
    const reqId = requestId(req);
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        logger.warn(
          err.message,
          { channel, requestId: reqId, event: "api.client_error", status: err.status },
          err,
        );
        return NextResponse.json(
          { error: err.publicMessage ?? err.message },
          { status: err.status },
        );
      }
      logger.error(
        "Unhandled route error",
        { channel, requestId: reqId, event: "api.unhandled" },
        err,
      );
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}
