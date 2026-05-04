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
  | 'scan_tiktok'
  | 'scan_tiktok_ads'
  | 'scan_tiktok_cc'
  | 'scan_snapchat'
  | 'scan_youtube'
  | 'scan_serp'
  | 'scan_maps'
  | 'ai_tagging'
  | 'ai_analysis'
  // Tier-specific Compare AI variants — the comparisons API
  // bills one of these depending on the model picker the user
  // chose at run time. Costs scale with the underlying token
  // economics (see project_ai_model_options.md):
  //   cheap     ≈ $0.005 / call → 1 credit
  //   pragmatic ≈ $0.025 / call → 3 credits  (default)
  //   premium   ≈ $0.150 / call → 8 credits
  // Plain ai_analysis is kept for backwards-compat cached txns.
  | 'ai_analysis_cheap'
  | 'ai_analysis_pragmatic'
  | 'ai_analysis_premium'
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
  // TikTok actor (clockworks/tiktok-scraper) costs $1.70/1000 results
  // — ~74% of the Instagram actor cost ($2.30/1000), but priced at the
  // same 2 credits to keep the credit menu round and avoid sub-credit
  // pricing. Re-evaluate if real-world TikTok runs come in heavier per
  // result (e.g. residential proxy add-on or longer poll cycles).
  scan_tiktok: 2,
  // TikTok DSA Ads Library scrape (silva95gustavo/tiktok-ads-scraper).
  // Pricing model is "FREE" on the Apify Store — we only pay platform
  // compute + residential proxy. ~$0.02-0.05 per 200-ad scan, in line
  // with the Snapchat/YouTube tier. 2 credits matches scan_tiktok.
  scan_tiktok_ads: 2,
  // TikTok Creative Center top-ads (beyondops/tiktok-ad-library-scraper).
  // $0.00001 per result × ~20-40 results per filter combination = $0.0004
  // per scan. Charge 1 credit (cheapest tier) since the dataset shape
  // is essentially a "trending feed snapshot" — same vibe as SERP.
  scan_tiktok_cc: 1,
  // Snapchat actor (automation-lab/snapchat-scraper) costs ~$0.0017
  // per profile (one row per scan, no per-post amplification like
  // TikTok or Instagram). Charging the platform minimum of 1 credit
  // matches the AI-tagging cost and reflects the per-scan footprint
  // honestly. If we ever ingest spotlights/highlights as separate
  // entities we'll need to revisit.
  scan_snapchat: 1,
  // YouTube actor (streamers/youtube-channel-scraper) costs $0.50
  // per 1000 videos. A 30-video scan = $0.015 — about 3x cheaper
  // than TikTok at the same volume. 1 credit keeps the pricing
  // tier in line with Snapchat (which also returns lifetime channel
  // counters in the same scan), and reflects the per-scan cost
  // honestly.
  scan_youtube: 1,
  // Google SERP actor (apify/google-search-scraper) costs $1.80 per
  // 1000 result pages. We scan one page per query (10 results max,
  // Google's own cap), so each scan costs ~$0.0018 — the cheapest
  // of the lot. 1 credit aligned with the other "snapshot-style"
  // scans (Snapchat/YouTube).
  scan_serp: 1,
  // Google Maps actor (compass/crawler-google-places) costs $2.10
  // per 1000 places. A default 20-place scan with 10 bundled reviews
  // each runs ~$0.04 — slightly more than the other "1 credit" scans
  // because we get places AND reviews in one run, and the dataset
  // per item is much heavier than a SERP page. 2 credits aligned
  // with TikTok's pricing tier (~$0.05 per scan).
  scan_maps: 2,
  ai_tagging: 1,
  ai_analysis: 3,
  ai_analysis_cheap: 1,
  ai_analysis_pragmatic: 3,
  ai_analysis_premium: 8,
  report_single: 2,
  report_comparison: 3,
};

/** Map the AI tier the user picked to its CreditAction. */
export function aiAnalysisAction(
  tier: 'cheap' | 'pragmatic' | 'premium' | undefined,
): CreditAction {
  if (tier === 'cheap') return 'ai_analysis_cheap';
  if (tier === 'premium') return 'ai_analysis_premium';
  return 'ai_analysis_pragmatic';
}

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
