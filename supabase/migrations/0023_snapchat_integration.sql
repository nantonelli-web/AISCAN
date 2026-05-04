-- =====================================================================
-- AISCAN — Snapchat integration
--   - Add snapchat_handle + snapchat_profile to mait_competitors
--     (mirrors the existing instagram_username + instagram_profile pair
--     and the tiktok_username + tiktok_profile pair from migration 0022)
--   - New mait_snapchat_profiles table — *snapshot history* table
--
-- Snapchat is fundamentally NOT a posts-based platform like Instagram
-- or TikTok: there is no per-post object to scrape (stories are
-- ephemeral and disappear after 24h, spotlights/highlights are exposed
-- only as counters via the public profile page). So we do NOT mirror
-- the mait_instagram_posts / mait_tiktok_posts shape.
--
-- Instead this table stores ONE ROW PER SCAN of a profile, so we can
-- track how the brand's Snapchat presence evolves over time
-- (lensCount, spotlightCount, highlightCount, subscriberCount changes).
-- The latest row is the brand's current state; the older rows are
-- the trend.
--
-- Schema verified on 2026-04-28 against the real `automation-lab/
-- snapchat-scraper` actor with @nike — all 24 fields below come
-- straight from the live response. See `project_new_actors_plan.md`.
-- =====================================================================

-- Brand-level Snapchat handle + cached profile snapshot (latest scan)
alter table mait_competitors add column if not exists snapchat_handle text;
alter table mait_competitors add column if not exists snapchat_profile jsonb;

-- ---------- SNAPCHAT PROFILE SNAPSHOTS ----------
create table if not exists mait_snapchat_profiles (
  id                       uuid primary key default uuid_generate_v4(),
  workspace_id             uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id            uuid references mait_competitors(id) on delete cascade,

  -- Identity
  username                 text not null,             -- snapchat handle (no @)
  display_name             text,                      -- displayName
  profile_url              text,                      -- url (canonical share)
  profile_type             text,                      -- "public" | "private" | "not_found"
  business_profile_id      text,                      -- businessProfileId (UUID-shaped)

  -- Identity / branding
  bio                      text,                      -- bio
  website_url              text,                      -- websiteUrl
  category                 text,                      -- category
  subcategory              text,                      -- subcategory
  is_verified              boolean default false,
  address                  text,                      -- address (city, country)

  -- Visual assets (CDN-signed URLs from sc-cdn.net — short TTL,
  -- the scan route downloads + permanents them via store-ad-images).
  profile_picture_url      text,                      -- profilePictureUrl
  snapcode_image_url       text,                      -- snapcodeImageUrl (deeplink, stable)
  hero_image_url           text,                      -- heroImageUrl

  -- Activity counters (the closest thing Snapchat has to engagement).
  -- Subscriber count is exposed publicly only for opted-in creator
  -- accounts; brands like Nike show 0 here. Treat as nullable when
  -- absent rather than overwriting non-zero history with 0.
  subscriber_count         integer default 0,         -- subscriberCount
  lens_count               integer default 0,
  highlight_count          integer default 0,
  spotlight_count          integer default 0,

  -- Presence flags ("is the brand active today" signals)
  has_story                boolean default false,     -- live story now
  has_curated_highlights   boolean default false,
  has_spotlight_highlights boolean default false,

  -- Discovery
  related_accounts         jsonb default '[]'::jsonb, -- relatedAccounts[]

  -- Timing
  -- account_created_at: actor's `createdAt`. Documented as account
  -- creation but unverified; stored as-is for transparency.
  account_created_at       timestamptz,
  -- profile_updated_at: actor's `lastUpdatedAt` (when Snapchat last
  -- updated the public profile, NOT when we scraped it).
  profile_updated_at       timestamptz,
  -- scraped_at: when AISCAN took THIS snapshot. Drives ordering.
  scraped_at               timestamptz not null default now(),

  -- Raw payload (full Apify response — re-scraping costs money,
  -- re-parsing is free; this is the same defensive choice we made
  -- for Meta/Instagram/TikTok).
  raw_data                 jsonb
);

create index if not exists idx_mait_snapchat_profiles_workspace
  on mait_snapchat_profiles(workspace_id);
create index if not exists idx_mait_snapchat_profiles_competitor
  on mait_snapchat_profiles(competitor_id);
create index if not exists idx_mait_snapchat_profiles_scraped
  on mait_snapchat_profiles(scraped_at desc);

-- ---------- RLS (mirror of mait_tiktok_posts policies from 0022) ----------
alter table mait_snapchat_profiles enable row level security;

drop policy if exists "snapchat_profiles_select" on mait_snapchat_profiles;
create policy "snapchat_profiles_select" on mait_snapchat_profiles for select
  using (
    workspace_id = mait_current_workspace()
    or mait_current_role() = 'super_admin'
  );

drop policy if exists "snapchat_profiles_write" on mait_snapchat_profiles;
create policy "snapchat_profiles_write" on mait_snapchat_profiles for all
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  )
  with check (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  );

-- ---------- Grants ----------
grant all on mait_snapchat_profiles to anon, authenticated, service_role;
