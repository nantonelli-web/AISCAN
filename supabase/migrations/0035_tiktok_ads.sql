-- =====================================================================
-- MAIT — TikTok Ads (paid channel)
-- =====================================================================
-- Stores ads scraped from the two TikTok ad surfaces:
--
-- 1. DSA Ad Library (EU/EEA/UK)  →  source = 'library'
--    Actor: silva95gustavo/tiktok-ads-scraper. Brand-specific:
--    we filter by advertiser business ID and get THAT advertiser's
--    ads with rich targeting + impressions data.
--
-- 2. Creative Center (50+ countries globally + MENA)  →  source = 'creative_center'
--    Actor: beyondops/tiktok-ad-library-scraper. Workspace-level
--    market intel: top performing ads by industry/country, NOT
--    tied to a single advertiser. Phase 2 of the rollout.
--
-- The two sources expose structurally different fields so each
-- has its own column block. Common columns sit on top, then
-- DSA-only, then Creative-Center-only. Defaults match Meta vs
-- Google split on mait_ads_external (see project memory
-- "Channel separation").
-- =====================================================================

create table if not exists mait_tiktok_ads (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  -- Brand link is OPTIONAL because Creative Center top-ads are not
  -- tied to a tracked competitor — they're market intel rows. DSA
  -- library ads are always tied to a brand (the advertiser ID is
  -- the search key) and competitor_id is non-null in that path.
  competitor_id   uuid references mait_competitors(id) on delete cascade,

  -- Source discriminator. Enforces the project memory rule that
  -- DSA fields and Creative-Center fields must NEVER mix in the
  -- same query without the user knowing which source they're on.
  source          text not null check (source in ('library', 'creative_center')),

  -- Stable id from TikTok. The same ad can appear on both surfaces
  -- (rare but possible), so the unique constraint includes source
  -- and we keep two rows when that happens.
  ad_id           text not null,

  -- ── Common (both sources) ──
  advertiser_id   text,
  advertiser_name text,
  ad_title        text,             -- CC primary; library has no title
  video_url       text,
  video_cover_url text,
  ad_format       text,             -- 'spark_ads' | 'non_spark_ads' | 'collection_ads' | NULL
  scraped_at      timestamptz not null default now(),

  -- ── DSA library only ──
  paid_by              text,
  -- impressions exposed as ranges (lower/upper) — Meta-style
  impressions_lower    bigint,
  impressions_upper    bigint,
  reach_lower          bigint,
  reach_upper          bigint,
  -- Per-region breakdown — array of {regionCode, impressions, ageRanges, genders}
  region_stats         jsonb,
  -- Targeting object: audienceSize{lower,upper}, interests[], firstPartyAudience,
  -- regions[{regionCode, ageRanges, genders}], videoInteractions, creatorInteractions
  targeting            jsonb,
  -- TikTok creator account that ran the ad. Profile pic + handle.
  tiktok_user          jsonb,
  -- Window the ad was shown — derived from the actor's startUrl
  -- (start_time/end_time) when scraping or computed from regionStats.
  first_shown_date     date,
  last_shown_date      date,
  days_running         integer,

  -- ── Creative Center only ──
  ad_text              text,        -- copy/caption shown on the ad
  landing_page_url     text,
  call_to_action       text,
  industry             text,
  campaign_objective   text,
  country              text,        -- ISO 2-letter (CC scrape country)
  ctr                  numeric(6, 4),  -- click-through rate (decimal, e.g. 0.0234)
  likes                integer,
  budget_level         text,        -- 'low' | 'medium' | 'high' (CC bucket)
  video_duration       integer,     -- seconds
  tags                 text[],

  -- ── Catch-all + housekeeping ──
  ad_status            text,
  raw_data             jsonb not null default '{}'::jsonb,
  scan_countries       text[],      -- ISO codes passed to the actor at scrape time
  last_seen_in_scan_at timestamptz not null default now(),
  created_at           timestamptz not null default now(),

  -- One row per (workspace, ad_id, source). Keeps the table
  -- idempotent under re-scan and lets the same ad ID exist on
  -- both surfaces if it ever does.
  unique (workspace_id, ad_id, source)
);

-- Workspace-scoped queries are the hot path (everything filters
-- by workspace_id under RLS).
create index if not exists idx_mait_tiktok_ads_workspace
  on mait_tiktok_ads (workspace_id);

-- Brand-detail page queries by competitor + source.
create index if not exists idx_mait_tiktok_ads_competitor
  on mait_tiktok_ads (competitor_id, source)
  where competitor_id is not null;

-- Source split — drives the "library vs creative center" tab on
-- the brand detail.
create index if not exists idx_mait_tiktok_ads_source
  on mait_tiktok_ads (workspace_id, source);

-- Library page browses by start date, ordered most-recent-first.
create index if not exists idx_mait_tiktok_ads_first_shown
  on mait_tiktok_ads (first_shown_date desc nulls last)
  where source = 'library';

-- Creative Center library queries by industry/country/objective.
create index if not exists idx_mait_tiktok_ads_cc_filters
  on mait_tiktok_ads (workspace_id, industry, country, campaign_objective)
  where source = 'creative_center';

-- ── RLS ──
alter table mait_tiktok_ads enable row level security;

-- Read: members of the workspace see their rows.
drop policy if exists "tiktok_ads_select" on mait_tiktok_ads;
create policy "tiktok_ads_select" on mait_tiktok_ads
  for select
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

-- Insert: only the service role / scan API writes.
drop policy if exists "tiktok_ads_insert" on mait_tiktok_ads;
create policy "tiktok_ads_insert" on mait_tiktok_ads
  for insert
  with check (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

-- Delete: brand owner can delete their workspace's rows (used by
-- the brand "delete" cascade and the "clean Google Ads" SQL pattern).
drop policy if exists "tiktok_ads_delete" on mait_tiktok_ads;
create policy "tiktok_ads_delete" on mait_tiktok_ads
  for delete
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

-- ── Brand metadata: tiktok_advertiser_id ──
-- Optional field — when set, silva DSA scrape uses it as a hard
-- match (adv_biz_ids URL param) instead of the looser adv_name
-- search. Most workspaces will never set this; the search-by-name
-- path handles 95% of cases.
alter table mait_competitors
  add column if not exists tiktok_advertiser_id text;
