/**
 * /api/brands — thin alias of /api/competitors.
 *
 * The page directory was renamed /competitors → /brands (70b7673,
 * 2026-05-04) and the client now fetches /api/brands/*, but the API
 * handlers stayed under /api/competitors/* and a next.config rewrite did
 * NOT take effect in this Next fork (POST /api/brands rendered the
 * not-found page → "An error occurred during piping" → client JSON parse
 * error). Re-exporting the handlers as REAL route files is fork-proof:
 * Next resolves them as genuine route handlers regardless of rewrite
 * support. Single source of truth stays in /api/competitors.
 */
export { POST, DELETE } from "@/app/api/competitors/route";
