/**
 * Snapchat Ads — DB row shape mirroring `mait_snapchat_ads`
 * (migration 0037_snapchat_ads.sql). One row per ad served in the
 * EU in the last 12 months, source = Snap's official public DSA
 * REST API at adsapi.snapchat.com. See project memory
 * `project_snapchat_ads_api`.
 */
export interface MaitSnapchatAd {
  id: string;
  workspace_id: string;
  competitor_id: string;
  ad_id: string;

  name: string | null;
  ad_account_name: string | null;
  paying_advertiser_name: string;
  profile_name: string | null;
  profile_logo_url: string | null;
  status: string | null;

  creative_type: string | null;
  ad_type: string | null;
  ad_render_type: string | null;
  top_snap_media_type: string | null;
  top_snap_crop_position: string | null;
  headline: string | null;
  call_to_action: string | null;
  languages: string[] | null;

  impressions_total: number;
  /** Lowercase ISO-2 → impressions int. */
  impressions_map: Record<string, number> | null;

  /** Full DSA-grade targeting object: regulated_content, demographics[],
   *  devices[]. Stored verbatim because the shape evolves. */
  targeting_v2: Record<string, unknown> | null;
  /** Dynamic Product Ads catalog (multi-image creative + descriptions).
   *  Null when the ad isn't a DPA. */
  dpa_preview: Record<string, unknown> | null;

  start_date: string | null;
  end_date: string | null;

  scan_countries: string[] | null;
  scan_status_filter: string | null;
  scraped_at: string;
  last_seen_in_scan_at: string;

  raw_data: Record<string, unknown>;
  created_at: string;
}
