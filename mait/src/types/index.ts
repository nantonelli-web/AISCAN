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

export interface MaitCompetitor {
  id: string;
  workspace_id: string;
  page_name: string;
  page_id: string | null;
  page_url: string;
  category: string | null;
  country: string | null;
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
  raw_data: Record<string, unknown> | null;
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
