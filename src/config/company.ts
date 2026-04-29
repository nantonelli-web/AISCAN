/**
 * Company / fiscal-data helpers.
 *
 * VAT validation is intentionally *light*: a regex per country (no
 * VIES roundtrip). Catches the obvious typos without coupling the
 * save flow to a flaky external service. Add countries to
 * VAT_PATTERNS as needed; unknown countries fall through to a
 * generic "any non-empty string" check.
 */

/**
 * Per-country VAT / Tax-ID regex.
 *
 * Patterns accept the bare number (no country prefix). The form
 * normalises the value (trim + uppercase + strip spaces/dots/dashes)
 * before testing, so we don't need to encode whitespace tolerance
 * here.
 *
 * Sources: EU VAT structure (vatstack-style), plus a few common
 * non-EU formats. Where structures are too varied to express
 * usefully (e.g. US EIN vs SSN) we accept any 1-30 char alphanumeric.
 */
export const VAT_PATTERNS: Record<string, RegExp> = {
  // EU
  AT: /^U\d{8}$/,                          // ATU + 8
  BE: /^0?\d{9}$/,                         // BE 0/1 + 9
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,                           // Greece (legacy code)
  GR: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^\d{7}[A-Z]{1,2}$|^\d[A-Z]\d{5}[A-Z]$/,
  IT: /^\d{11}$/,
  LT: /^\d{9}$|^\d{12}$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,

  // Non-EU but common
  GB: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  CH: /^E\d{9}(MWST|TVA|IVA)?$/,
  NO: /^\d{9}(MVA)?$/,
  AE: /^\d{15}$/,                          // UAE TRN
  US: /^\d{2}-?\d{7}$/,                    // EIN
  CA: /^\d{9}$/,                           // BN
  AU: /^\d{11}$/,                          // ABN
};

/**
 * Country codes where the European-style "country prefix + digits"
 * convention applies. Used to render a helper hint in the UI.
 */
export const EU_VAT_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","EL","GR","ES","FI","FR","HR","HU",
  "IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]);

/**
 * Normalise the user-typed VAT for storage and validation.
 * Strip whitespace/dots/dashes, drop a leading country prefix that
 * matches `country`, and uppercase. Idempotent.
 */
export function normaliseVat(raw: string, country: string | null | undefined): string {
  const cleaned = raw.replace(/[\s.\-]/g, "").toUpperCase();
  if (!country) return cleaned;
  const prefix = country.toUpperCase();
  if (cleaned.startsWith(prefix) && /^[A-Z]{2}/.test(cleaned)) {
    return cleaned.slice(prefix.length);
  }
  return cleaned;
}

/**
 * Light VAT/Tax-ID check. Returns true if the value looks plausible
 * for the given country, false otherwise. Empty input returns false
 * — callers decide whether the field is required.
 */
export function isValidVat(value: string, country: string | null | undefined): boolean {
  if (!value) return false;
  const normalised = normaliseVat(value, country);
  if (!normalised) return false;

  if (country && VAT_PATTERNS[country.toUpperCase()]) {
    return VAT_PATTERNS[country.toUpperCase()].test(normalised);
  }
  // Unknown country: accept any 4-30 alphanumeric to avoid false negatives.
  return /^[A-Z0-9]{4,30}$/.test(normalised);
}

/**
 * Italian Codice Destinatario (SDI) — 7 alphanumeric chars.
 * Exactly "0000000" is the placeholder used when the recipient
 * provides only PEC; we accept it as valid.
 */
export function isValidSdi(value: string): boolean {
  return /^[A-Z0-9]{7}$/.test(value.trim().toUpperCase());
}

/**
 * Italian Codice Fiscale persona giuridica/fisica — light check.
 * 11 digits (legal entity) OR 16 alphanumeric (natural person).
 */
export function isValidTaxCodeIT(value: string): boolean {
  const v = value.replace(/\s/g, "").toUpperCase();
  return /^\d{11}$/.test(v) || /^[A-Z0-9]{16}$/.test(v);
}

/**
 * Generic "looks like an email" predicate. We don't try to be
 * RFC-perfect — a server-side regex of similar shape is what
 * Supabase Auth uses for its own checks.
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * What the API expects on PUT /api/user-company — also the shape
 * stored in the table. Keep in sync with the migration.
 */
export interface UserCompany {
  legal_name: string | null;
  country: string | null;
  vat_number: string | null;
  tax_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  sdi_code: string | null;
  pec_email: string | null;
  billing_email: string | null;
  phone: string | null;
}

/**
 * Fields required for a company record to count as "complete enough"
 * to gate the credit-recharge flow on. Italian companies additionally
 * need SDI *or* PEC (the e-invoicing requirement).
 */
export function isCompanyComplete(c: Partial<UserCompany> | null | undefined): boolean {
  if (!c) return false;
  const required: (keyof UserCompany)[] = [
    "legal_name",
    "country",
    "vat_number",
    "address_line1",
    "city",
    "postal_code",
    "billing_email",
  ];
  for (const k of required) {
    const v = c[k];
    if (!v || (typeof v === "string" && v.trim() === "")) return false;
  }
  if (c.country === "IT") {
    const hasSdi = c.sdi_code && c.sdi_code.trim() !== "";
    const hasPec = c.pec_email && c.pec_email.trim() !== "";
    if (!hasSdi && !hasPec) return false;
  }
  return true;
}
