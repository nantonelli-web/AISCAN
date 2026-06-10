/**
 * /api/brands/[id] — alias of /api/competitors/[id] (PATCH scan
 * frequency / fields, DELETE brand). See ../route.ts for why these are
 * real re-export shims and not a next.config rewrite.
 */
export { PATCH, DELETE } from "@/app/api/competitors/[id]/route";
