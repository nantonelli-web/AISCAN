// ---------------------------------------------------------------------------
// AISCAN -- Pricing & Credit Configuration
// ---------------------------------------------------------------------------
//
// Pricing model (since 2026-04-28): credit packs, one-time payment.
// The previous subscription tiers (Scout/Analyst/Strategist/Agency)
// were retired in favour of a pure pay-as-you-go pack model — same
// formula AICREA uses. Every workspace owner still gets a free
// monthly allowance (`MONTHLY_FREE_CREDITS`) so trial users can
// onboard without a card; on top of that, packs are perpetual top-ups
// purchased via Stripe Checkout.
//
// The legacy `SubscriptionTier` type is kept ONLY because the DB
// column `mait_users.subscription_tier` still exists; new accounts
// land on "scout" and stay there. Subscription endpoints are no
// longer surfaced in the UI.
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
// Credit packs (one-time top-ups)
// ---------------------------------------------------------------------------

export type CreditPackId = 'starter' | 'pro' | 'business' | 'agency';

export interface CreditPack {
  id: CreditPackId;
  name: string;
  /** Credits added to the workspace balance on successful payment. */
  credits: number;
  /** Total price the user pays in USD. */
  priceUsd: number;
  /** Display tagline rendered under the price. Free-form, locale-neutral. */
  tagline: string;
  /** When true, the UI highlights this pack as the recommended choice. */
  popular?: boolean;
  /** Stripe Price ID env var name. The actual price id lives in
   *  Vercel env vars (one per pack), so rotating Stripe products does
   *  not require a code redeploy — only an env update. */
  stripePriceEnv: string;
}

/** Effective $/credit for a pack — useful for the UI to render
 *  "$0.36 per credit" tooltips and bulk-discount badges. */
export function pricePerCredit(pack: CreditPack): number {
  return pack.priceUsd / pack.credits;
}

/** Pack catalogue — proposal B from the pricing discussion on
 *  2026-04-28. Numbers anchor on the previous subscription rate
 *  (~$0.36/credit) and gain progressive bulk discount up to ~20%
 *  on the Agency pack. */
export const creditPacks: CreditPack[] = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 25,
    priceUsd: 10,
    tagline: '$0.40 per credit · trial volume',
    stripePriceEnv: 'STRIPE_PRICE_PACK_STARTER',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 80,
    priceUsd: 29,
    tagline: '$0.363 per credit',
    popular: true,
    stripePriceEnv: 'STRIPE_PRICE_PACK_PRO',
  },
  {
    id: 'business',
    name: 'Business',
    credits: 250,
    priceUsd: 79,
    tagline: '$0.316 per credit · 13% off',
    stripePriceEnv: 'STRIPE_PRICE_PACK_BUSINESS',
  },
  {
    id: 'agency',
    name: 'Agency',
    credits: 650,
    priceUsd: 189,
    tagline: '$0.291 per credit · 20% off',
    stripePriceEnv: 'STRIPE_PRICE_PACK_AGENCY',
  },
];

/** Lookup by id with a clear error so we never silently fall
 *  through to undefined when a malformed payload reaches the
 *  checkout endpoint. */
export function getCreditPack(id: string): CreditPack {
  const pack = creditPacks.find((p) => p.id === id);
  if (!pack) {
    throw new Error(`Unknown credit pack: ${id}`);
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
