// ---------------------------------------------------------------------------
// AISCAN -- Pricing & Credit Configuration
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'scout' | 'analyst' | 'strategist' | 'agency';

export type CreditAction =
  | 'scan_meta'
  | 'scan_google'
  | 'scan_instagram'
  | 'scan_tiktok'
  | 'scan_snapchat'
  | 'scan_youtube'
  | 'scan_serp'
  | 'scan_maps'
  | 'ai_tagging'
  | 'ai_analysis'
  | 'report_single'
  | 'report_comparison';

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

export interface Plan {
  tier: SubscriptionTier;
  name: string;
  credits: number;        // credits per month
  priceMonthly: number;   // USD / month
  priceYearly: number;    // USD / year
  maxBrands: number;      // -1 = unlimited
  maxTeamMembers: number;
  features: string[];
}

export const plans: Plan[] = [
  {
    tier: 'scout',
    name: 'Scout',
    credits: 10,
    priceMonthly: 0,
    priceYearly: 0,
    maxBrands: 2,
    maxTeamMembers: 1,
    features: [
      '10 credits/month',
      'Up to 2 brands',
      'Meta Ads scanning',
      'Basic reports',
    ],
  },
  {
    tier: 'analyst',
    name: 'Analyst',
    credits: 80,
    priceMonthly: 29,
    priceYearly: 299,
    maxBrands: 10,
    maxTeamMembers: 1,
    features: [
      '80 credits/month',
      'Up to 10 brands',
      'All channels (Meta, Google, Instagram)',
      'AI-powered analysis',
      'Full reports',
    ],
  },
  {
    tier: 'strategist',
    name: 'Strategist',
    credits: 250,
    priceMonthly: 89,
    priceYearly: 899,
    maxBrands: 25,
    maxTeamMembers: 3,
    features: [
      '250 credits/month',
      'Up to 25 brands',
      'All channels',
      'AI analysis + tagging',
      'Brand comparison',
      'Priority support',
      'Up to 3 team members',
    ],
  },
  {
    tier: 'agency',
    name: 'Agency',
    credits: 650,
    priceMonthly: 239,
    priceYearly: 2399,
    maxBrands: -1,
    maxTeamMembers: 10,
    features: [
      '650 credits/month',
      'Unlimited brands',
      'All channels',
      'Full AI suite',
      'Advanced comparisons',
      'Custom reports',
      'Up to 10 team members',
      'Dedicated support',
    ],
  },
];

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
  report_single: 2,
  report_comparison: 3,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approximate yearly discount percentage (displayed on pricing page). */
export const yearlyDiscount = 14;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the credit cost for a given action. */
export function getCreditCost(action: CreditAction): number {
  return creditCosts[action];
}

/** Return the plan definition for a given tier. */
export function getPlan(tier: SubscriptionTier): Plan {
  const plan = plans.find((p) => p.tier === tier);
  if (!plan) {
    throw new Error(`Unknown subscription tier: ${tier}`);
  }
  return plan;
}
