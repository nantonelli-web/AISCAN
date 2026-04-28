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
