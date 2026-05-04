export type Role = "super_admin" | "admin" | "analyst" | "viewer";

export type ScrapeStatus = "pending" | "running" | "succeeded" | "failed";

export interface MaitWorkspace {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface MaitUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  workspace_id: string | null;
  created_at: string;
}

export interface MaitClient {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export type AdSource = "meta" | "google";

export interface MaitCompetitor {
  id: string;
  workspace_id: string;
  client_id: string | null;
  page_name: string;
  page_id: string | null;
  page_url: string;
  category: string | null;
  country: string | null;
  instagram_username: string | null;
  tiktok_username: string | null;
  tiktok_profile: Record<string, unknown> | null;
  snapchat_handle: string | null;
  snapchat_profile: Record<string, unknown> | null;
  youtube_channel_url: string | null;
  youtube_profile: Record<string, unknown> | null;
  google_advertiser_id: string | null;
  google_domain: string | null;
  profile_picture_url: string | null;
  monitor_config: Record<string, unknown>;
  last_scraped_at: string | null;
  created_at: string;
}

export interface MaitAdExternal {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  ad_archive_id: string;
  ad_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  image_url: string | null;
  video_url: string | null;
  landing_url: string | null;
  platforms: string[];
  languages: string[];
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  source: AdSource;
  raw_data: Record<string, unknown> | null;
  /** ISO-2 codes passed to Apify when this ad was scraped. NULL for
   *  legacy rows (scanned before per-country scraping) and for Google
   *  ads (not scraped per-country). */
  scan_countries: string[] | null;
  /** Timestamp of the most recent scan that included this ad. Updated
   *  on every upsert by /api/apify/scan{,-google}; defaults to now()
   *  on insert. Distinct from `created_at` (first time the row
   *  landed) and from raw `lastShown` from the actor (Google
   *  catalog observation). Used on the ad-detail page as a
   *  transparency signal: "we last saw this ad in our own scans on
   *  [date]". */
  last_seen_in_scan_at: string;
  created_at: string;
}

export interface MaitScrapeJob {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  apify_run_id: string | null;
  status: ScrapeStatus;
  started_at: string | null;
  completed_at: string | null;
  records_count: number;
  cost_cu: number;
  error: string | null;
}

export interface MaitOrganicPost {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  platform: string;
  post_id: string;
  post_url: string | null;
  post_type: string | null;
  caption: string | null;
  display_url: string | null;
  video_url: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  video_views: number;
  video_play_count: number;
  hashtags: string[];
  mentions: string[];
  tagged_users: string[];
  posted_at: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MaitSnapchatProfile {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  username: string;
  display_name: string | null;
  profile_url: string | null;
  profile_type: string | null;
  business_profile_id: string | null;
  bio: string | null;
  website_url: string | null;
  category: string | null;
  subcategory: string | null;
  is_verified: boolean;
  address: string | null;
  profile_picture_url: string | null;
  snapcode_image_url: string | null;
  hero_image_url: string | null;
  subscriber_count: number;
  lens_count: number;
  highlight_count: number;
  spotlight_count: number;
  has_story: boolean;
  has_curated_highlights: boolean;
  has_spotlight_highlights: boolean;
  related_accounts: unknown[];
  account_created_at: string | null;
  profile_updated_at: string | null;
  scraped_at: string;
  raw_data: Record<string, unknown> | null;
}

export interface MaitYoutubeChannel {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  channel_id: string | null;
  channel_username: string | null;
  channel_url: string | null;
  input_channel_url: string | null;
  channel_name: string | null;
  channel_description: string | null;
  channel_location: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_verified: boolean;
  is_age_restricted: boolean;
  subscriber_count: number;
  total_videos: number;
  total_views: number;
  description_links: { text: string | null; url: string | null }[];
  channel_joined_at: string | null;
  scraped_at: string;
  raw_data: Record<string, unknown> | null;
}

export interface MaitYoutubeVideo {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  video_id: string;
  video_url: string | null;
  channel_id: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  type: string | null;
  duration_seconds: number | null;
  view_count: number;
  like_count: number | null;
  comment_count: number | null;
  posted_at: string | null;
  posted_relative: string | null;
  created_at: string;
  raw_data: Record<string, unknown> | null;
}

export interface MaitTikTokPost {
  id: string;
  workspace_id: string;
  competitor_id: string | null;
  post_id: string;
  post_url: string | null;
  caption: string | null;
  text_language: string | null;
  cover_url: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  is_slideshow: boolean;
  is_pinned: boolean;
  is_ad: boolean;
  is_sponsored: boolean;
  play_count: number;
  digg_count: number;
  share_count: number;
  comment_count: number;
  collect_count: number;
  music_id: string | null;
  music_name: string | null;
  music_author: string | null;
  music_original: boolean | null;
  hashtags: string[];
  mentions: string[];
  posted_at: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}
