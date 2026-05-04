-- =====================================================================
-- AISCAN — YouTube integration
--   - Add youtube_channel_url + youtube_profile to mait_competitors
--   - New mait_youtube_channels table (snapshot history, like Snapchat)
--   - New mait_youtube_videos table (video posts, like TikTok)
--
-- Architecture: TWO dedicated tables (matches the brief's option B
-- + the project memory's "tabelle dedicate per channel" rule).
-- - mait_youtube_channels: ONE ROW PER SCAN. Trend store for
--   subscribers / totals / verification flag — same shape as
--   mait_snapchat_profiles. Latest snapshot is mirrored on
--   mait_competitors.youtube_profile for the brand-detail header.
-- - mait_youtube_videos: ONE ROW PER VIDEO. Upserted on
--   (workspace_id, video_id) — same pattern as mait_tiktok_posts.
--
-- Schema verified on 2026-04-28 against the real
-- streamers/youtube-channel-scraper actor with @Nike — all fields
-- below come from the live response. See `project_new_actors_plan.md`.
-- =====================================================================

-- Brand-level YouTube channel URL + cached profile snapshot (latest scan)
alter table mait_competitors add column if not exists youtube_channel_url text;
alter table mait_competitors add column if not exists youtube_profile jsonb;

-- ---------- YOUTUBE CHANNEL SNAPSHOTS ----------
-- One row per scan. The trend over time (subscriber growth, video
-- count, total views) tells the story. The latest row is also
-- mirrored on mait_competitors.youtube_profile so the brand header
-- can read it without joining.
create table if not exists mait_youtube_channels (
  id                   uuid primary key default uuid_generate_v4(),
  workspace_id         uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id        uuid references mait_competitors(id) on delete cascade,

  -- Identity
  channel_id           text,                       -- "UC..." (YouTube canonical)
  channel_username     text,                       -- "@nike" handle (no @)
  channel_url          text,                       -- canonical /channel/UC... URL
  input_channel_url    text,                       -- the URL we sent to the actor

  -- Branding
  channel_name         text,
  channel_description  text,
  channel_location     text,
  avatar_url           text,                       -- store-ad-images permanent
  banner_url           text,                       -- store-ad-images permanent
  is_verified          boolean default false,
  is_age_restricted    boolean default false,

  -- Lifetime metrics
  subscriber_count     bigint default 0,           -- "2220000"
  total_videos         bigint default 0,           -- channelTotalVideos
  total_views          bigint default 0,           -- channelTotalViews

  -- Description links: array of {text, url} so the brand card can
  -- show "Instagram" / "Twitter" / website with one tap. The actor
  -- returns these as a clean array; we keep the same shape.
  description_links    jsonb default '[]'::jsonb,

  -- Timing
  -- channel_joined_at: actor returns "Mar 7, 2006". We attempt to
  -- parse it server-side; when parsing fails the column stays null
  -- and the raw string survives in raw_data.
  channel_joined_at    timestamptz,
  scraped_at           timestamptz not null default now(),

  -- Raw payload (full aboutChannelInfo + the bridging fields the
  -- actor duplicates on every video item).
  raw_data             jsonb
);

create index if not exists idx_mait_youtube_channels_workspace
  on mait_youtube_channels(workspace_id);
create index if not exists idx_mait_youtube_channels_competitor
  on mait_youtube_channels(competitor_id);
create index if not exists idx_mait_youtube_channels_scraped
  on mait_youtube_channels(scraped_at desc);

-- ---------- YOUTUBE VIDEOS ----------
create table if not exists mait_youtube_videos (
  id                   uuid primary key default uuid_generate_v4(),
  workspace_id         uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id        uuid references mait_competitors(id) on delete cascade,

  -- Identity
  video_id             text not null,              -- 11-char YT id
  video_url            text,                       -- watch?v=...
  channel_id           text,                       -- "UC..." (foreign reference)

  -- Content
  title                text,
  description          text,                       -- only with video_details=true; null otherwise
  thumbnail_url        text,                       -- yt3.googleusercontent.com (CDN-stable)
  type                 text,                       -- "video" | "short" | "stream"
  duration_seconds     integer,                    -- parsed from "1:54" → 114

  -- Engagement (when present — the streamers actor exposes views
  -- but not likes/comments without enabling video_details).
  view_count           bigint default 0,
  like_count           bigint,                     -- nullable: only with video_details
  comment_count        bigint,                     -- nullable: only with video_details

  -- Timing
  -- posted_at: parsed from the actor's relative date string
  -- ("1 month ago"). When parsing fails we keep the original
  -- string in raw_data and leave this null — never invent a date.
  posted_at            timestamptz,
  posted_relative      text,                       -- raw "1 month ago" for transparency
  created_at           timestamptz not null default now(),

  raw_data             jsonb,

  unique (workspace_id, video_id)
);

create index if not exists idx_mait_youtube_videos_workspace
  on mait_youtube_videos(workspace_id);
create index if not exists idx_mait_youtube_videos_competitor
  on mait_youtube_videos(competitor_id);
create index if not exists idx_mait_youtube_videos_posted
  on mait_youtube_videos(posted_at desc);

-- ---------- RLS (mirror of mait_snapchat_profiles + mait_tiktok_posts) ----------
alter table mait_youtube_channels enable row level security;
alter table mait_youtube_videos enable row level security;

drop policy if exists "youtube_channels_select" on mait_youtube_channels;
create policy "youtube_channels_select" on mait_youtube_channels for select
  using (
    workspace_id = mait_current_workspace()
    or mait_current_role() = 'super_admin'
  );

drop policy if exists "youtube_channels_write" on mait_youtube_channels;
create policy "youtube_channels_write" on mait_youtube_channels for all
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  )
  with check (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  );

drop policy if exists "youtube_videos_select" on mait_youtube_videos;
create policy "youtube_videos_select" on mait_youtube_videos for select
  using (
    workspace_id = mait_current_workspace()
    or mait_current_role() = 'super_admin'
  );

drop policy if exists "youtube_videos_write" on mait_youtube_videos;
create policy "youtube_videos_write" on mait_youtube_videos for all
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  )
  with check (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  );

-- ---------- Grants ----------
grant all on mait_youtube_channels to anon, authenticated, service_role;
grant all on mait_youtube_videos to anon, authenticated, service_role;
