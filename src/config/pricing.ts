// ---------------------------------------------------------------------------
// AISCAN -- Pricing & Credit Configuration
// ---------------------------------------------------------------------------
//
// Pricing model (since 2026-04-28): credit packs, manual recharge.
// Mirrors the AICREA flow 1:1 — same packs, same prices, same
// "click pack → email a request to admin → admin fulfils manually"
// mechanism. NO online payment is currently surfaced; the customer
// pays offline (bonifico, etc.) and the admin grants credits after
// receiving the funds.
//
// The legacy `SubscriptionTier` type is kept ONLY because the DB
// column `mait_users.subscription_tier` still exists; new accounts
// land on "scout" and stay there. Every workspace owner gets a
// free monthly allowance (`MONTHLY_FREE_CREDITS`) regardless.
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'scout' | 'analyst' | 'strategist' | 'agency';

export type CreditAction =
  | 'scan_meta'
  | 'scan_google'
  | 'scan_instagram'
  | 'ai_tagging'
  | 'ai_analysis'
  | 'report_single'
  | 'report_comparison';

// ---------------------------------------------------------------------------
// Free monthly allowance
// ---------------------------------------------------------------------------

/** Credits granted automatically every month to every workspace owner.
 *  Same as the legacy "Scout" plan baseline so existing accounts feel
 *  the change as a no-op until they buy their first pack. */
export const MONTHLY_FREE_CREDITS = 10;

// ---------------------------------------------------------------------------
// Credit packs (manual recharge, AICREA-style)
// ---------------------------------------------------------------------------
// Same packs and prices as AICREA so the two products share a pricing
// surface and customers can move between them without rethinking the
// economics. Recharge happens offline — the user picks a pack, the
// app emails the request to the AISCAN admin and persists it on
// `mait_credit_requests`; the admin then fulfils manually via the
// existing `mait_add_credits` RPC.

export interface CreditPack {
  /** Credits added to the workspace balance once the admin fulfils. */
  credits: number;
  /** Gross EUR price the customer is invoiced. */
  priceEur: number;
  /** Discount badge value vs the smallest pack (0 = no badge). */
  savingsPercent: number;
}

/** Effective €/credit for a pack — used by the UI for the per-credit
 *  unit price under each card. */
export function pricePerCredit(pack: CreditPack): number {
  return pack.priceEur / pack.credits;
}

/** Pack catalogue — copied from AICREA. The largest pack (1000) is
 *  rendered as "best value" rather than the middle one. */
export const creditPacks: CreditPack[] = [
  { credits: 50,   priceEur: 15,  savingsPercent: 0 },
  { credits: 100,  priceEur: 25,  savingsPercent: 17 },
  { credits: 250,  priceEur: 55,  savingsPercent: 27 },
  { credits: 500,  priceEur: 99,  savingsPercent: 34 },
  { credits: 1000, priceEur: 179, savingsPercent: 40 },
];

/** Lookup by credits — when a request payload arrives, we trust only
 *  numeric credits (not arbitrary metadata) and look up the canonical
 *  price server-side. Throws on unknown packs so a forged payload
 *  cannot fabricate a 999999-credit request. */
export function getCreditPack(credits: number): CreditPack {
  const pack = creditPacks.find((p) => p.credits === credits);
  if (!pack) {
    throw new Error(`Unknown credit pack: ${credits} credits`);
  }
  return pack;
}

// ---------------------------------------------------------------------------
// Credit costs per action
// ---------------------------------------------------------------------------

export const creditCosts: Record<CreditAction, number> = {
  scan_meta: 5,
  scan_google: 2,
  scan_instagram: 2,
  ai_tagging: 1,
  ai_analysis: 3,
  report_single: 2,
  report_comparison: 3,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the credit cost for a given action. */
export function getCreditCost(action: CreditAction): number {
  return creditCosts[action];
}
