-- =====================================================================
-- AISCAN — TikTok integration
--   - Add tiktok_username + tiktok_profile to mait_competitors
--     (mirrors the existing instagram_username + instagram_profile pair)
--   - New mait_tiktok_posts table
-- Same shape as mait_organic_posts where the field semantics overlap
-- (post_id, post_url, caption, hashtags, mentions, posted_at, raw_data)
-- plus TikTok-specific columns for music metadata, slideshow flag,
-- collect/digg/play counters, and ad/sponsored markers. Kept as a
-- dedicated table per the architectural decision in the new-actors
-- sprint memory: tabelle dedicate per channel — opzione B.
-- =====================================================================

-- Brand-level TikTok handle + cached profile snapshot
alter table mait_competitors add column if not exists tiktok_username text;
alter table mait_competitors add column if not exists tiktok_profile jsonb;

-- ---------- TIKTOK POSTS ----------
create table if not exists mait_tiktok_posts (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id       uuid references mait_competitors(id) on delete cascade,

  -- Identity (TikTok video id + canonical share URL)
  post_id             text not null,             -- TikTok video id
  post_url            text,                      -- webVideoUrl

  -- Content
  caption             text,                      -- text
  text_language       text,                      -- textLanguage (ISO-ish)
  cover_url           text,                      -- videoMeta.coverUrl
  video_url           text,                      -- direct mp4 (when available)
  duration_seconds    numeric,                   -- videoMeta.duration

  -- Type flags
  is_slideshow        boolean default false,
  is_pinned           boolean default false,
  is_ad               boolean default false,
  is_sponsored        boolean default false,

  -- Engagement (TikTok native field names preserved for clarity)
  play_count          integer default 0,         -- views
  digg_count          integer default 0,         -- likes
  share_count         integer default 0,
  comment_count       integer default 0,
  collect_count       integer default 0,         -- saves / bookmarks

  -- Music / Audio (TikTok's equivalent of Instagram's musicInfo)
  music_id            text,                      -- musicMeta.musicId
  music_name          text,                      -- musicMeta.musicName
  music_author        text,                      -- musicMeta.musicAuthor
  music_original      boolean,                   -- musicMeta.musicOriginal

  -- Tags
  hashtags            text[] default '{}',       -- hashtags[].name
  mentions            text[] default '{}',       -- detailedMentions[].name

  -- Timing
  posted_at           timestamptz,               -- createTimeISO
  created_at          timestamptz not null default now(),

  -- Raw payload (full Apify response so we can re-derive without re-scraping)
  raw_data            jsonb,

  unique (workspace_id, post_id)
);

create index if not exists idx_mait_tiktok_posts_workspace
  on mait_tiktok_posts(workspace_id);
create index if not exists idx_mait_tiktok_posts_competitor
  on mait_tiktok_posts(competitor_id);
create index if not exists idx_mait_tiktok_posts_posted
  on mait_tiktok_posts(posted_at desc);

-- ---------- RLS (mirror of mait_organic_posts policies) ----------
alter table mait_tiktok_posts enable row level security;

drop policy if exists "tiktok_posts_select" on mait_tiktok_posts;
create policy "tiktok_posts_select" on mait_tiktok_posts for select
  using (
    workspace_id = mait_current_workspace()
    or mait_current_role() = 'super_admin'
  );

drop policy if exists "tiktok_posts_write" on mait_tiktok_posts;
create policy "tiktok_posts_write" on mait_tiktok_posts for all
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  )
  with check (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  );

-- ---------- Grants ----------
grant all on mait_tiktok_posts to anon, authenticated, service_role;
