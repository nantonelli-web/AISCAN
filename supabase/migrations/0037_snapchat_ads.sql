-- =====================================================================
-- AISCAN — Snapchat Ads (paid channel) via official Snap REST API
-- =====================================================================
-- Stores ads scraped from Snap's public DSA Ads Library API:
--   POST https://adsapi.snapchat.com/v1/ads_library/ads/search
--
-- Why this is separate from mait_snapchat_profiles:
--   mait_snapchat_profiles  → ORGANIC profile snapshot (Apify actor,
--                              one row per scan, lifetime counters).
--   mait_snapchat_ads       → PAID ads served in EU in last 12 months
--                              (Snap official API, one row per ad,
--                              cursor-paginated, with impressions +
--                              targeting + creative).
--
-- Per project memory `feedback_channel_separation`: NEVER share columns
-- or queries across paid vs organic. The two surfaces have distinct
-- semantics — paid is per-creative, organic is per-snapshot.
--
-- Schema verified live on 2026-05-05 with `paying_advertiser_name=nike`,
-- `countries=[fr,de,it,es]`, `status=ACTIVE`. See project memory
-- `project_snapchat_ads_api`.
-- =====================================================================

create table if not exists mait_snapchat_ads (
  id                       uuid primary key default uuid_generate_v4(),
  workspace_id             uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id            uuid not null references mait_competitors(id) on delete cascade,

  -- Stable Snap ad identifier — UUID-shaped string. The unique key
  -- (workspace_id, ad_id) makes re-scans idempotent.
  ad_id                    text not null,

  -- ── Identity ──
  -- name = Snap's internal campaign label, e.g.
  --   "CRSXP9VPEHSJ_Evergreen_Evergreen_Mixed_Male_EMEA_Mixed_X_X_FR_Feed"
  -- Useful for grouping creatives by campaign on the brand page.
  name                     text,
  ad_account_name          text,            -- "Nike EMEA - Initiative - Marketplace"
  paying_advertiser_name   text not null,   -- search key
  profile_name             text,            -- handle shown on the ad
  profile_logo_url         text,            -- short-TTL CDN, will need media-store
  status                   text,            -- ACTIVE | PAUSED

  -- ── Creative metadata ──
  creative_type            text,            -- WEB_VIEW | VIDEO | IMAGE | …
  ad_type                  text,            -- REMOTE_WEBPAGE | …
  ad_render_type           text,            -- DYNAMIC | STATIC
  top_snap_media_type      text,            -- DYNAMIC | VIDEO | IMAGE
  top_snap_crop_position   text,            -- TOP | MIDDLE | BOTTOM
  headline                 text,
  call_to_action           text,            -- SHOP_NOW | LEARN_MORE | …
  languages                text[],          -- e.g. ['fr']

  -- ── Reach / impressions ──
  -- Snap exposes a single int for total impressions plus a per-country
  -- breakdown. Country codes are lowercase ISO-2.
  impressions_total        bigint default 0,
  impressions_map          jsonb,           -- { fr: 43610849, de: 0, ... }

  -- ── Targeting (DSA-grade) ──
  -- targeting_v2 keeps the full structure: regulated_content flag,
  -- demographics[]{min_age, age_groups, languages, operation,
  -- advanced_demographics}, devices[]. Stored verbatim because the
  -- shape evolves and we want to surface new fields without a
  -- migration each time.
  targeting_v2             jsonb,

  -- ── Creative payload ──
  -- dpa_preview.items[] holds Dynamic Product Ads catalog: each item
  -- has a main_image + additional_media[] + description. Non-DPA
  -- creatives leave this null.
  dpa_preview              jsonb,

  -- ── Dates ──
  start_date               timestamptz,
  -- Snap's API does not surface end_date for active ads, only on
  -- paused/archived ones via the /ads/{id} detail endpoint. Left
  -- nullable so a future detail-fetch step can populate.
  end_date                 timestamptz,

  -- ── Scan metadata ──
  -- Countries the user asked for at scrape time. Stored so we can
  -- distinguish "no impressions in market X" from "market X was
  -- not part of the query".
  scan_countries           text[],
  scan_status_filter       text,            -- ACTIVE | PAUSED — what was queried
  scraped_at               timestamptz not null default now(),
  last_seen_in_scan_at     timestamptz not null default now(),

  -- Catch-all + housekeeping.
  raw_data                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),

  unique (workspace_id, ad_id)
);

-- Workspace-scoped queries are the hot path under RLS.
create index if not exists idx_mait_snapchat_ads_workspace
  on mait_snapchat_ads (workspace_id);

-- Brand-detail page queries by competitor + start_date desc.
create index if not exists idx_mait_snapchat_ads_competitor
  on mait_snapchat_ads (competitor_id, start_date desc nulls last);

-- Library-style listing across the workspace, newest first.
create index if not exists idx_mait_snapchat_ads_start
  on mait_snapchat_ads (workspace_id, start_date desc nulls last);

-- Status filter on brand detail (Active vs Paused tab).
create index if not exists idx_mait_snapchat_ads_status
  on mait_snapchat_ads (workspace_id, status)
  where status is not null;

-- ── RLS — same shape as mait_snapchat_profiles / mait_tiktok_ads ──
alter table mait_snapchat_ads enable row level security;

drop policy if exists "snapchat_ads_select" on mait_snapchat_ads;
create policy "snapchat_ads_select" on mait_snapchat_ads for select
  using (
    workspace_id = mait_current_workspace()
    or mait_current_role() = 'super_admin'
  );

drop policy if exists "snapchat_ads_write" on mait_snapchat_ads;
create policy "snapchat_ads_write" on mait_snapchat_ads for all
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  )
  with check (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  );

grant all on mait_snapchat_ads to anon, authenticated, service_role;
