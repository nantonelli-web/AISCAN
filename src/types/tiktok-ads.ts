/**
 * TikTok Ads — DB row shape mirroring `mait_tiktok_ads` (migration
 * 0035_tiktok_ads.sql). Discriminated by the `source` column so DSA
 * Library and Creative Center fields stay statically separated at
 * the type level — same pattern as MetaAdsCompStats vs
 * GoogleAdsCompStats elsewhere in the codebase.
 */
export interface MaitTiktokAdBase {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  ad_id: string;
  advertiser_id: string | null;
  advertiser_name: string | null;
  ad_title: string | null;
  video_url: string | null;
  video_cover_url: string | null;
  ad_format: string | null;
  ad_status: string | null;
  raw_data: Record<string, unknown>;
  scan_countries: string[] | null;
  last_seen_in_scan_at: string;
  scraped_at: string;
  created_at: string;
}

export interface MaitTiktokAdLibrary extends MaitTiktokAdBase {
  source: "library";
  paid_by: string | null;
  impressions_lower: number | null;
  impressions_upper: number | null;
  reach_lower: number | null;
  reach_upper: number | null;
  region_stats: unknown;
  targeting: unknown;
  tiktok_user: unknown;
  first_shown_date: string | null;
  last_shown_date: string | null;
  days_running: number | null;
}

export interface MaitTiktokAdCc extends MaitTiktokAdBase {
  source: "creative_center";
  ad_text: string | null;
  landing_page_url: string | null;
  call_to_action: string | null;
  industry: string | null;
  campaign_objective: string | null;
  country: string | null;
  ctr: number | null;
  likes: number | null;
  budget_level: string | null;
  video_duration: number | null;
  tags: string[] | null;
}

export type MaitTiktokAd = MaitTiktokAdLibrary | MaitTiktokAdCc;
