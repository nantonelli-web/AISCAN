/**
 * Campaign type decoder — euristica che estrae la tipologia di
 * campagna dal nome (es. "UAE_2026_VC" → "VC" → View Content).
 *
 * I brand/agenzie usano convenzioni di naming molto diffuse:
 * `<MARKET>_<YEAR>_<TYPE>[-suffix]` o `<TYPE>_<MARKET>_<YEAR>`
 * o varianti. Il TYPE e' tipicamente una sigla 2-5 lettere alla
 * fine o all'inizio, separata da `_` o `-`.
 *
 * Output: code (sigla normalizzata), label (human readable),
 * eventField (la column del raw_data o riga normalizzata da cui
 * leggere il count del risultato), invece di usare il generico
 * "Results" che cambia per-row a seconda dell'obiettivo Meta.
 *
 * Le mappature sono case-insensitive e supportano italiano +
 * inglese.
 */

export interface CampaignType {
  /** Sigla normalizzata (UPPERCASE). Stable identifier. */
  code: string;
  /** Human label per UI. */
  label: string;
  /** Quale campo della MetaPerfRow leggere come "result count":
   *  - "purchases" / "purchase_value" / "results" / "raw:Adds to cart" /
   *    "raw:Content views" / "raw:Landing page views" / "raw:Post engagements" /
   *    "raw:Instagram follows" / "raw:Instagram profile visits" / null
   *  Quando "raw:X", l'aggregator legge da row.raw_data[X]. */
  eventField:
    | "purchases"
    | "purchase_value"
    | "results"
    | "link_clicks"
    | "reach"
    | string; // raw:* fallback
}

/** Dictionary of recognized campaign-type tokens.
 *  Keys are uppercase, no separators. The decoder normalises a
 *  token from the campaign name and looks it up here. */
const TYPE_DICTIONARY: Record<string, Omit<CampaignType, "code">> = {
  // Conversion-funnel events (Meta Pixel + standard Meta objectives)
  PURCHASE: { label: "Purchase", eventField: "purchases" },
  PUR: { label: "Purchase", eventField: "purchases" },
  PURCH: { label: "Purchase", eventField: "purchases" },
  ATC: { label: "Add to Cart", eventField: "raw:Adds to cart" },
  ADDTOCART: { label: "Add to Cart", eventField: "raw:Adds to cart" },
  IC: { label: "Initiate Checkout", eventField: "raw:Initiate checkout" },
  INITIATECHECKOUT: { label: "Initiate Checkout", eventField: "raw:Initiate checkout" },
  VC: { label: "View Content", eventField: "raw:Content views" },
  VIEWCONTENT: { label: "View Content", eventField: "raw:Content views" },
  LPV: { label: "Landing Page View", eventField: "raw:Landing page views" },
  LANDINGPAGE: { label: "Landing Page View", eventField: "raw:Landing page views" },
  LANDING: { label: "Landing Page View", eventField: "raw:Landing page views" },

  LEAD: { label: "Lead", eventField: "results" },
  LEADS: { label: "Lead", eventField: "results" },
  COMPLETEREGISTRATION: { label: "Complete Registration", eventField: "results" },
  REG: { label: "Complete Registration", eventField: "results" },
  CONTACT: { label: "Contact", eventField: "results" },

  // Top-of-funnel
  AWARENESS: { label: "Brand Awareness", eventField: "reach" },
  AWAR: { label: "Brand Awareness", eventField: "reach" },
  BRAND: { label: "Brand Awareness", eventField: "reach" },
  REACH: { label: "Reach", eventField: "reach" },
  TRAFFIC: { label: "Traffic", eventField: "link_clicks" },
  TRAF: { label: "Traffic", eventField: "link_clicks" },

  // Engagement
  ENG: { label: "Engagement", eventField: "raw:Post engagements" },
  ENGAGEMENT: { label: "Engagement", eventField: "raw:Post engagements" },
  POSTENG: { label: "Post Engagement", eventField: "raw:Post engagements" },

  // Social presence
  IGFOLLOW: { label: "Instagram Follow", eventField: "raw:Instagram follows" },
  IGFOLLOWS: { label: "Instagram Follow", eventField: "raw:Instagram follows" },
  IGVISIT: { label: "Instagram Profile Visit", eventField: "raw:Instagram profile visits" },
  IGVISITS: { label: "Instagram Profile Visit", eventField: "raw:Instagram profile visits" },

  // Video
  VIDEOVIEW: { label: "Video View", eventField: "raw:Video plays" },
  VV: { label: "Video View", eventField: "raw:Video plays" },
  THRUPLAY: { label: "ThruPlay", eventField: "raw:ThruPlays" },

  // App
  APPINSTALL: { label: "App Install", eventField: "results" },
  INSTALL: { label: "App Install", eventField: "results" },
};

/** Tokenize the campaign name on `_` and `-`, then normalise:
 *  uppercase + strip non-letters. */
function tokenize(name: string): string[] {
  return name
    .split(/[_\-/.]+/)
    .map((t) => t.replace(/[^A-Za-z]/g, "").toUpperCase())
    .filter((t) => t.length >= 2);
}

/**
 * Decode a campaign name into a CampaignType, or null if no
 * recognised token. Strategy: scan tokens, prefer the LAST
 * recognised token (suffix convention more common than prefix).
 */
export function decodeCampaignType(name: string | null): CampaignType | null {
  if (!name) return null;
  const tokens = tokenize(name);
  // Scan from end backwards
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (TYPE_DICTIONARY[t]) {
      return { code: t, ...TYPE_DICTIONARY[t] };
    }
  }
  // Fallback: scan from start
  for (const t of tokens) {
    if (TYPE_DICTIONARY[t]) {
      return { code: t, ...TYPE_DICTIONARY[t] };
    }
  }
  return null;
}

/**
 * Returns ALL known campaign types (per le dropdown di override
 * sull'UI: l'utente puo' scegliere fra questi se la
 * decodifica automatica e' sbagliata o assente).
 */
export function listKnownCampaignTypes(): CampaignType[] {
  // Dedup per label (es. PURCHASE+PUR+PURCH have same label).
  const seen = new Set<string>();
  const out: CampaignType[] = [];
  for (const [code, payload] of Object.entries(TYPE_DICTIONARY)) {
    if (seen.has(payload.label)) continue;
    seen.add(payload.label);
    out.push({ code, ...payload });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Apply an override map (campaign_name → type code) on top of
 *  the auto-decoded result. Override wins. */
export function resolveCampaignType(
  campaignName: string | null,
  overrides: Record<string, string> = {},
): CampaignType | null {
  if (!campaignName) return null;
  const ovr = overrides[campaignName];
  if (ovr && TYPE_DICTIONARY[ovr]) {
    return { code: ovr, ...TYPE_DICTIONARY[ovr] };
  }
  return decodeCampaignType(campaignName);
}
