/**
 * Country decoder — estrae token di paese dai nomi campagna /
 * ad set. Le agenzie tipicamente nominano le campagne come
 * `<MARKET>_<YEAR>_<TYPE>` (es. "UAE_2026_VC", "KSA_2026_ATC")
 * o usano composizioni multi-paese (es. "KSA-UAE_2026_Purch",
 * "KSA+UAE_2026_VC").
 *
 * Strategia:
 * 1. tokenizza il nome su `_`/`-`/`+`/`/`/`.`/spazi
 * 2. matcha ogni token contro un dizionario di codici paese
 *    (ISO-2 + alias comuni IT/EN + GCC market codes)
 * 3. se piu' di un paese e' rilevato → restituisce un set di
 *    paesi (li elaboriamo come "MULTI" oppure split a peso 1/N)
 *
 * Output: array di codici paese trovati (vuoto se nessuno).
 */

const COUNTRY_DICTIONARY: Record<string, string> = {
  // Gulf / Middle East — molto usati nei brand UAE
  UAE: "UAE",
  AE: "UAE",
  EMIRATES: "UAE",
  EMIRATI: "UAE",
  KSA: "KSA",
  SA: "KSA",
  SAUDI: "KSA",
  SAUDIARABIA: "KSA",
  ARABIASAUDITA: "KSA",
  QAT: "QAT",
  QA: "QAT",
  QATAR: "QAT",
  KUW: "KUW",
  KW: "KUW",
  KUWAIT: "KUW",
  OMAN: "OMAN",
  OM: "OMAN",
  BAH: "BAH",
  BH: "BAH",
  BAHRAIN: "BAH",

  // Europe
  IT: "IT",
  ITA: "IT",
  ITALIA: "IT",
  ITALY: "IT",
  FR: "FR",
  FRA: "FR",
  FRANCE: "FR",
  FRANCIA: "FR",
  DE: "DE",
  DEU: "DE",
  GER: "DE",
  GERMANY: "DE",
  GERMANIA: "DE",
  ES: "ES",
  ESP: "ES",
  SPAIN: "ES",
  SPAGNA: "ES",
  PT: "PT",
  PRT: "PT",
  PORTUGAL: "PT",
  PORTOGALLO: "PT",
  UK: "UK",
  GB: "UK",
  GBR: "UK",
  UNITEDKINGDOM: "UK",
  REGNOUNITO: "UK",
  IE: "IE",
  IRL: "IE",
  IRELAND: "IE",
  IRLANDA: "IE",
  NL: "NL",
  NLD: "NL",
  NETHERLANDS: "NL",
  OLANDA: "NL",
  BE: "BE",
  BEL: "BE",
  BELGIUM: "BE",
  BELGIO: "BE",
  CH: "CH",
  CHE: "CH",
  SWITZERLAND: "CH",
  SVIZZERA: "CH",
  AT: "AT",
  AUT: "AT",
  AUSTRIA: "AT",
  PL: "PL",
  POL: "PL",
  POLAND: "PL",
  POLONIA: "PL",
  GR: "GR",
  GRC: "GR",
  GREECE: "GR",
  GRECIA: "GR",

  // Americas
  US: "US",
  USA: "US",
  UNITEDSTATES: "US",
  STATIUNITI: "US",
  CA: "CA",
  CAN: "CA",
  CANADA: "CA",
  MX: "MX",
  MEX: "MX",
  MEXICO: "MX",
  MESSICO: "MX",
  BR: "BR",
  BRA: "BR",
  BRAZIL: "BR",
  BRASILE: "BR",
  AR: "AR",
  ARG: "AR",
  ARGENTINA: "AR",

  // APAC
  AU: "AU",
  AUS: "AU",
  AUSTRALIA: "AU",
  NZ: "NZ",
  NZL: "NZ",
  NEWZEALAND: "NZ",
  JP: "JP",
  JPN: "JP",
  JAPAN: "JP",
  GIAPPONE: "JP",
  CN: "CN",
  CHN: "CN",
  CHINA: "CN",
  CINA: "CN",
  IN: "IN",
  IND: "IN",
  INDIA: "IN",
  ID: "ID",
  IDN: "ID",
  INDONESIA: "ID",
  SG: "SG",
  SGP: "SG",
  SINGAPORE: "SG",
  HK: "HK",
  HKG: "HK",
  HONGKONG: "HK",
  KR: "KR",
  KOR: "KR",
  KOREA: "KR",
  COREA: "KR",
  TH: "TH",
  THA: "TH",
  THAILAND: "TH",
  THAILANDIA: "TH",

  // Africa
  EG: "EG",
  EGY: "EG",
  EGYPT: "EG",
  EGITTO: "EG",
  ZA: "ZA",
  ZAF: "ZA",
  SOUTHAFRICA: "ZA",
  SUDAFRICA: "ZA",
  MA: "MA",
  MAR: "MA",
  MOROCCO: "MA",
  MAROCCO: "MA",

  // Macro regions (capture-all)
  GCC: "GCC",
  MENA: "MENA",
  EU: "EU",
  EUROPE: "EU",
  EUROPA: "EU",
};

/** Tokenize a name on common separators, uppercase + strip
 *  non-letter chars. */
function tokenize(name: string): string[] {
  return name
    .split(/[_\-+/.\s]+/)
    .map((t) => t.replace(/[^A-Za-z]/g, "").toUpperCase())
    .filter((t) => t.length >= 2);
}

/** Decode list of country codes from a name. Empty if none. */
export function decodeCountries(name: string | null): string[] {
  if (!name) return [];
  const tokens = tokenize(name);
  const found = new Set<string>();
  for (const t of tokens) {
    const c = COUNTRY_DICTIONARY[t];
    if (c) found.add(c);
  }
  return [...found];
}

/** Combine countries from campaign name + ad set name. If no
 *  countries → ["UNKNOWN"]. If 2+ → returns those (caller decides
 *  whether to split spend pro-rata or label MULTI). */
export function decodeCountriesFromNames(
  campaignName: string | null,
  adSetName: string | null,
): string[] {
  const a = decodeCountries(campaignName);
  const b = decodeCountries(adSetName);
  const out = new Set<string>([...a, ...b]);
  return out.size === 0 ? ["UNKNOWN"] : [...out];
}

/** Human label for a country code. */
const LABELS: Record<string, string> = {
  UAE: "Emirati Arabi Uniti",
  KSA: "Arabia Saudita",
  QAT: "Qatar",
  KUW: "Kuwait",
  OMAN: "Oman",
  BAH: "Bahrain",
  IT: "Italia",
  FR: "Francia",
  DE: "Germania",
  ES: "Spagna",
  PT: "Portogallo",
  UK: "Regno Unito",
  IE: "Irlanda",
  NL: "Paesi Bassi",
  BE: "Belgio",
  CH: "Svizzera",
  AT: "Austria",
  PL: "Polonia",
  GR: "Grecia",
  US: "Stati Uniti",
  CA: "Canada",
  MX: "Messico",
  BR: "Brasile",
  AR: "Argentina",
  AU: "Australia",
  NZ: "Nuova Zelanda",
  JP: "Giappone",
  CN: "Cina",
  IN: "India",
  ID: "Indonesia",
  SG: "Singapore",
  HK: "Hong Kong",
  KR: "Corea",
  TH: "Thailandia",
  EG: "Egitto",
  ZA: "Sudafrica",
  MA: "Marocco",
  GCC: "GCC",
  MENA: "MENA",
  EU: "Europa",
  UNKNOWN: "Non identificato",
};

export function countryLabel(code: string): string {
  return LABELS[code] ?? code;
}
