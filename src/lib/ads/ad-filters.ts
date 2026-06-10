/**
 * Deterministic ad filters used by the Compare surface to keep the
 * displayed creatives faithful to the user's country selection.
 *
 * Two distinct problems are solved here, with two distinct mechanisms:
 *
 *  1. GEO — "an ad shown only in Germany must not appear under the IT
 *     chip". For Meta this is enforced at the DB level via the
 *     `scan_countries` overlap (the scraper is per-country). Google Ads
 *     Transparency is NOT scraped per-country, so `scan_countries` is
 *     frequently NULL — instead the real geo lives inside `raw_data`
 *     (`regionStats[].regionCode` ISO-2, and `creativeRegions[]` full
 *     country names). `extractRegionCodes` unifies all three sources so
 *     the country chip can become a real filter for Google too.
 *
 *  2. LANGUAGE — "an ad served in IT but written in German must not be
 *     surfaced as a latest creative under the IT chip". Geo cannot catch
 *     this (the ad really was served in IT). We detect the copy language
 *     from headline + body and drop creatives whose language is clearly
 *     not one of the expected languages for the selected countries.
 *
 * Both filters are CONSERVATIVE by design (real-data principle): when we
 * cannot determine the region/language we KEEP the ad. We only ever drop
 * an ad when we have positive evidence it belongs elsewhere — never on a
 * "couldn't tell" verdict.
 */

// ---------------------------------------------------------------------------
// GEO
// ---------------------------------------------------------------------------

/**
 * Full country names (as returned by silva `creativeRegions[]`) → ISO-2.
 * Lower-cased keys; we normalise the input before lookup. Only the
 * markets we actually scrape are listed — an unknown name simply yields
 * no code and is ignored (the ad keeps whatever other region evidence it
 * has, or is treated as "region unknown").
 */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  italy: "IT",
  italia: "IT",
  germany: "DE",
  deutschland: "DE",
  austria: "AT",
  switzerland: "CH",
  france: "FR",
  spain: "ES",
  españa: "ES",
  espana: "ES",
  portugal: "PT",
  "united kingdom": "GB",
  "great britain": "GB",
  "united states": "US",
  "united states of america": "US",
  netherlands: "NL",
  belgium: "BE",
  ireland: "IE",
  poland: "PL",
  romania: "RO",
  greece: "GR",
  sweden: "SE",
  denmark: "DK",
  finland: "FI",
  norway: "NO",
  "czech republic": "CZ",
  czechia: "CZ",
  hungary: "HU",
  slovakia: "SK",
  slovenia: "SI",
  croatia: "HR",
  bulgaria: "BG",
  luxembourg: "LU",
  malta: "MT",
  cyprus: "CY",
  estonia: "EE",
  latvia: "LV",
  lithuania: "LT",
};

/**
 * Collect every ISO-2 region code an ad has evidence for, from all three
 * possible sources. Returns an empty array when there is NO geo evidence
 * at all — callers treat that as "region unknown" and keep the ad.
 */
export function extractRegionCodes(
  rawData: Record<string, unknown> | null | undefined,
  scanCountries?: string[] | null,
): string[] {
  const out = new Set<string>();

  // 1. scan_countries column (Meta always, silva multi-country scans).
  if (Array.isArray(scanCountries)) {
    for (const c of scanCountries) {
      if (typeof c === "string" && c) out.add(c.toUpperCase());
    }
  }

  if (rawData) {
    // 2. silva regionStats[].regionCode — ISO-2, per-region serving rows.
    const regionStats = rawData.regionStats;
    if (Array.isArray(regionStats)) {
      for (const r of regionStats) {
        const code = (r as Record<string, unknown>)?.regionCode;
        if (typeof code === "string" && code) out.add(code.toUpperCase());
      }
    }
    // 3. silva creativeRegions[] — full country names.
    const creativeRegions = rawData.creativeRegions;
    if (Array.isArray(creativeRegions)) {
      for (const name of creativeRegions) {
        if (typeof name !== "string") continue;
        const iso = COUNTRY_NAME_TO_ISO2[name.trim().toLowerCase()];
        if (iso) out.add(iso);
      }
    }
  }

  return [...out];
}

/**
 * True if the ad should be KEPT under the given country selection.
 *
 * - No country filter active → keep everything.
 * - Ad has no geo evidence → keep (we can't prove it's off-geo).
 * - Ad has geo evidence → keep only if it overlaps the selection.
 */
export function adMatchesCountries(
  regionCodes: string[],
  countriesUpper: string[] | undefined,
): boolean {
  if (!countriesUpper || countriesUpper.length === 0) return true;
  if (regionCodes.length === 0) return true; // region unknown → keep
  const wanted = new Set(countriesUpper);
  return regionCodes.some((c) => wanted.has(c));
}

// ---------------------------------------------------------------------------
// LANGUAGE
// ---------------------------------------------------------------------------

/**
 * Country → expected copy languages (ISO 639-1). A creative written in a
 * language outside this set, for the selected countries, is treated as
 * off-target. Multilingual countries list every official language so we
 * never drop a legitimate local-language ad (e.g. de/fr/it for CH).
 */
const COUNTRY_TO_LANGUAGES: Record<string, string[]> = {
  IT: ["it"],
  DE: ["de"],
  AT: ["de"],
  CH: ["de", "fr", "it"],
  FR: ["fr"],
  ES: ["es"],
  PT: ["pt"],
  GB: ["en"],
  IE: ["en"],
  US: ["en"],
  NL: ["nl"],
  BE: ["nl", "fr"],
  LU: ["fr", "de"],
};

/**
 * Union of expected languages for the selected countries. Returns null
 * when no filter is active or none of the selected countries map to a
 * known language set — in both cases the language filter is a no-op.
 */
export function expectedLanguages(
  countriesUpper: string[] | undefined,
): Set<string> | null {
  if (!countriesUpper || countriesUpper.length === 0) return null;
  const langs = new Set<string>();
  for (const c of countriesUpper) {
    for (const l of COUNTRY_TO_LANGUAGES[c] ?? []) langs.add(l);
  }
  return langs.size > 0 ? langs : null;
}

/**
 * Distinctive function words per language. Super-common cross-language
 * tokens (e.g. "in", "a", "de") are deliberately under-weighted by
 * appearing in several sets; the scorer relies on the MARGIN between the
 * winner and the runner-up, so a clear winner needs language-specific
 * words to pull ahead.
 */
const STOPWORDS: Record<string, Set<string>> = {
  it: new Set([
    "di", "e", "il", "la", "le", "lo", "gli", "un", "una", "uno", "per",
    "con", "su", "da", "che", "non", "è", "sono", "anche", "più", "della",
    "dei", "delle", "del", "al", "alla", "allo", "ai", "dal", "nel", "come",
    "ma", "tuo", "tua", "scopri", "nuovo", "nuova", "nuovi", "offerta",
    "sconto", "spedizione", "gratuita", "acquista", "ora", "moda", "donna",
    "abbigliamento", "taglie", "comode", "saldi", "collezione",
  ]),
  de: new Set([
    "der", "die", "das", "und", "für", "mit", "ist", "im", "ein", "eine",
    "einen", "den", "dem", "des", "auf", "aus", "bei", "nicht", "auch",
    "oder", "von", "zu", "zum", "zur", "sie", "wir", "ihr", "groß",
    "großen", "größen", "damen", "herren", "mode", "jetzt", "neu",
    "neuheiten", "kostenlos", "versand", "entdecken", "kaufen", "sich",
    "werden", "unsere", "bis",
  ]),
  fr: new Set([
    "le", "la", "les", "des", "un", "une", "et", "est", "pour", "avec",
    "sur", "dans", "vous", "nous", "votre", "notre", "plus", "pas", "ne",
    "que", "qui", "au", "aux", "du", "ce", "cette", "nouveau", "nouvelle",
    "mode", "femme", "livraison", "gratuite", "découvrez", "achetez",
    "maintenant", "grandes", "tailles", "soldes",
  ]),
  es: new Set([
    "el", "la", "los", "las", "un", "una", "y", "es", "para", "con", "su",
    "no", "más", "que", "del", "al", "por", "como", "también", "nuevo",
    "nueva", "moda", "mujer", "envío", "gratis", "descubre", "compra",
    "ahora", "tallas", "grandes", "rebajas", "ropa",
  ]),
  en: new Set([
    "the", "and", "for", "with", "you", "your", "our", "are", "this",
    "that", "to", "on", "new", "shop", "now", "free", "shipping",
    "discover", "buy", "women", "fashion", "off", "sizes", "plus", "sale",
    "clothing",
  ]),
  pt: new Set([
    "o", "a", "os", "as", "um", "uma", "e", "é", "para", "com", "em",
    "não", "mais", "que", "do", "da", "dos", "das", "por", "como", "novo",
    "nova", "moda", "mulher", "frete", "grátis", "descubra", "compre",
    "agora", "tamanhos", "grandes", "roupas",
  ]),
  nl: new Set([
    "de", "het", "een", "en", "voor", "met", "is", "op", "niet", "ook",
    "of", "van", "te", "zijn", "ze", "we", "jouw", "onze", "nieuw", "mode",
    "dames", "gratis", "verzending", "ontdek", "koop", "nu", "maten",
    "grote", "kleding",
  ]),
};

const SUPPORTED_LANGS = Object.keys(STOPWORDS);

/**
 * Best-effort language detection for short ad copy. Returns an ISO 639-1
 * code only when there is a CLEAR winner, otherwise null ("don't know").
 *
 * Rules tuned to never over-claim on short headlines:
 *  - need at least `MIN_TOKENS` word tokens to even try
 *  - the winning language needs at least `MIN_HITS` stopword matches
 *  - the winner must beat the runner-up by at least `MIN_MARGIN` hits
 *  - a hard German signal (ß / ü-ö-ä clusters) breaks near-ties for de
 */
export function detectLanguage(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const tokens = lower
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const MIN_TOKENS = 4;
  const MIN_HITS = 3;
  const MIN_MARGIN = 2;
  if (tokens.length < MIN_TOKENS) return null;

  const scores: Record<string, number> = {};
  for (const lang of SUPPORTED_LANGS) {
    const set = STOPWORDS[lang];
    let hits = 0;
    for (const tok of tokens) if (set.has(tok)) hits++;
    scores[lang] = hits;
  }

  // Hard orthographic signal: ß is exclusively German; give it weight so
  // a German ad with few function words still resolves to `de`.
  if (/ß/.test(lower)) scores.de += 3;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topHits] = ranked[0];
  const runnerHits = ranked[1]?.[1] ?? 0;

  if (topHits < MIN_HITS) return null;
  if (topHits - runnerHits < MIN_MARGIN) return null;
  return topLang;
}

/**
 * True if the ad's copy language is acceptable for the selected
 * countries. Conservative: keeps the ad when no language filter is
 * active OR the language can't be confidently detected.
 */
export function adMatchesLanguages(
  text: string | null | undefined,
  expected: Set<string> | null,
): boolean {
  if (!expected || expected.size === 0) return true;
  const lang = detectLanguage(text);
  if (!lang) return true; // undetectable → keep
  return expected.has(lang);
}
