/**
 * EU-27 country whitelist for Snap's Ads Library DSA endpoint.
 *
 * Lives in its own module — separate from `ads-service.ts` which is
 * server-only — so the brand-detail scan dropdown (a client component)
 * can use the same set to gate the Snapchat Ads CTA without importing
 * the server fetcher.
 *
 * Codes are lowercase ISO-3166-1 alpha-2, except `el` (Greece, which
 * Snap uses instead of `gr`) — matches Snap's own documented list at
 * https://developers.snap.com/api/marketing-api/Ads-Gallery-Api.
 */
export const SNAP_ADS_EU_COUNTRIES: ReadonlySet<string> = new Set([
  "at", "be", "bg", "cy", "cz", "de", "dk", "ee", "el", "es", "fi",
  "fr", "hr", "hu", "ie", "it", "lt", "lu", "lv", "mt", "nl", "pl",
  "pt", "ro", "se", "si", "sk",
]);

/** Snap uses `el` for Greece. Brand records may have `gr` (the more
 *  common ISO code), so we accept both at gating time and rewrite to
 *  `el` only when calling the API. */
const GR_ALIASES = new Set(["gr", "el"]);

/** True when at least one of the provided ISO-2 codes (lowercase, in
 *  any case) maps to an EU country covered by the Snap DSA endpoint.
 *  Returns FALSE for an empty/null input — caller decides whether
 *  "no markets configured" should fall back to the EU-27 default
 *  (the scan API does), but the gating UX treats unknown as
 *  "show enabled and let the default kick in".
 */
export function hasSnapAdsCoverage(codes: string[] | null | undefined): boolean {
  if (!codes || codes.length === 0) return false;
  for (const raw of codes) {
    const c = raw.trim().toLowerCase();
    if (!c) continue;
    if (SNAP_ADS_EU_COUNTRIES.has(c)) return true;
    if (GR_ALIASES.has(c)) return true;
  }
  return false;
}
