/**
 * Normalise a country column value to an ISO 3166-1 alpha-2 code.
 *
 * Legacy rows in `mait_competitors.country` occasionally contained localised
 * country NAMES ("Italy", "Italia", "Germania") instead of the alpha-2 code
 * the benchmark filters expect. That silently dropped brands out of any
 * downstream chart keyed on country. This helper coerces any accepted
 * shape — alpha-2, alpha-3, Italian name, English name, common aliases —
 * into the canonical alpha-2 value, or null when it cannot be resolved.
 *
 * The reverse map is built lazily from Intl.DisplayNames so adding new
 * countries is automatic; CANONICAL_ALIASES handles the handful of common
 * shorthand values (UK → GB, USA → US, UAE → AE) that don't come out of
 * Intl.
 */

// Manual aliases — shorthand or colloquial names users frequently type.
const CANONICAL_ALIASES: Record<string, string> = {
  // ISO exceptional reservations + common colloquial shorthands.
  UK: "GB",
  "GREAT BRITAIN": "GB",
  "UNITED KINGDOM": "GB",
  "REGNO UNITO": "GB",
  EL: "GR", // Greece — UN code is "EL" but ISO prefers "GR"
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  "STATI UNITI": "US",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  "EMIRATI ARABI": "AE",
  "EMIRATI ARABI UNITI": "AE",
  EU: "EU",
  EUROPE: "EU",
  EUROPA: "EU",
};

// Alpha-3 → alpha-2 for the most common codes. Covers the usual suspects;
// anything outside is returned as-is (still better than dropping).
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  ITA: "IT",
  FRA: "FR",
  DEU: "DE",
  ESP: "ES",
  GBR: "GB",
  USA: "US",
  CHE: "CH",
  AUT: "AT",
  BEL: "BE",
  NLD: "NL",
  PRT: "PT",
  POL: "PL",
  SWE: "SE",
  NOR: "NO",
  DNK: "DK",
  FIN: "FI",
  IRL: "IE",
  GRC: "GR",
  ROU: "RO",
  HUN: "HU",
  CZE: "CZ",
  BGR: "BG",
  HRV: "HR",
  SVK: "SK",
  SVN: "SI",
  LTU: "LT",
  LVA: "LV",
  EST: "EE",
  LUX: "LU",
  MLT: "MT",
  CYP: "CY",
  TUR: "TR",
  CAN: "CA",
  MEX: "MX",
  BRA: "BR",
  ARG: "AR",
  AUS: "AU",
  NZL: "NZ",
  JPN: "JP",
  CHN: "CN",
  IND: "IN",
  ARE: "AE",
  SAU: "SA",
  ISR: "IL",
};

let reverseMapCache: Map<string, string> | null = null;

function buildReverseMap(): Map<string, string> {
  const reverse = new Map<string, string>();

  // `Intl.supportedValuesOf("region")` gives every ISO 3166-1 alpha-2 code
  // known to the runtime. The ambient type definitions are conservative —
  // Node 18+ supports the "region" key at runtime, so cast around it.
  // Whole block wrapped in try/catch because some runtimes throw here
  // (edge, older Node) rather than returning an empty array.
  type SupportedValuesOf = (key: string) => string[];
  let regions: string[] = [];
  try {
    const supportedValuesOf =
      typeof Intl.supportedValuesOf === "function"
        ? (Intl.supportedValuesOf as unknown as SupportedValuesOf)
        : null;
    if (supportedValuesOf) regions = supportedValuesOf("region");
  } catch {
    regions = [];
  }

  for (const locale of ["it", "en"] as const) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      continue;
    }
    for (const code of regions) {
      if (!/^[A-Z]{2}$/.test(code)) continue;
      try {
        const label = names.of(code);
        if (label) reverse.set(label.toLowerCase(), code);
      } catch {
        // unknown code — skip
      }
    }
  }

  for (const [alias, code] of Object.entries(CANONICAL_ALIASES)) {
    reverse.set(alias.toLowerCase(), code);
  }

  return reverse;
}

function getReverseMap(): Map<string, string> {
  if (!reverseMapCache) reverseMapCache = buildReverseMap();
  return reverseMapCache;
}

/**
 * Return the ISO alpha-2 country code for `input`, or null when the value
 * cannot be resolved. Already-canonical alpha-2 inputs are passed through.
 */
export function toIsoCountry(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();

  // Alpha-2 input: check aliases first (UK → GB, EL → GR), otherwise
  // pass through. Previously we short-circuited alpha-2 before the alias
  // lookup, which left "UK" in the DB instead of normalising to GB and
  // broke the country filter when another brand used "GB".
  if (/^[A-Z]{2}$/.test(upper)) {
    return CANONICAL_ALIASES[upper] ?? upper;
  }

  // Alpha-3 with a known mapping.
  if (/^[A-Z]{3}$/.test(upper)) {
    return ALPHA3_TO_ALPHA2[upper] ?? upper;
  }

  // Name lookup (case-insensitive, any locale IT/EN).
  const hit = getReverseMap().get(trimmed.toLowerCase());
  return hit ?? null;
}

/**
 * Parse a country column value (single ISO code OR a comma-separated list
 * like "IT, DE, UK") into an array of alpha-2 codes. Unresolved tokens are
 * dropped. Duplicates are collapsed. Returns [] for null / empty input.
 */
export function parseCountryCodes(input: string | null | undefined): string[] {
  if (input == null) return [];
  const trimmed = String(input).trim();
  if (!trimmed) return [];
  const parts = trimmed.includes(",") ? trimmed.split(",") : [trimmed];
  const out = new Set<string>();
  for (const part of parts) {
    const iso = toIsoCountry(part);
    if (iso) out.add(iso);
  }
  return [...out];
}

/**
 * Return `input` coerced to the canonical storage format. Single-value
 * inputs become an alpha-2 code; multi-country values become a comma-joined
 * list of alpha-2 codes ("IT,DE,GB,FR,ES"). Falls back to the trimmed
 * original so we don't silently throw away user input on save.
 */
export function coerceCountryForStorage(
  input: string | null | undefined
): string | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.includes(",")) {
    const codes = parseCountryCodes(trimmed);
    return codes.length > 0 ? codes.join(",") : trimmed;
  }
  return toIsoCountry(trimmed) ?? trimmed;
}
