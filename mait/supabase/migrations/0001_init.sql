-- =====================================================================
-- MAIT — Meta Ads Intelligence Tool
-- Initial schema. All tables prefixed `mait_` to coexist with other apps
-- on the same Supabase project.
-- Run in: Supabase SQL Editor (or `supabase db push`).
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin
  create type mait_role as enum ('super_admin','admin','analyst','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mait_scrape_status as enum ('pending','running','succeeded','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mait_alert_type as enum ('new_ads','strategy_change','volume_spike','sync_error');
exception when duplicate_object then null; end $$;

-- ---------- WORKSPACES ----------
create table if not exists mait_workspaces (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text unique not null,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- ---------- USERS ----------
-- Mirrors auth.users (Supabase Auth) with workspace + role assignment.
create table if not exists mait_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  name          text,
  role          mait_role not null default 'analyst',
  workspace_id  uuid references mait_workspaces(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_mait_users_workspace on mait_users(workspace_id);

-- ---------- COMPETITORS ----------
create table if not exists mait_competitors (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  page_name       text not null,
  page_id         text,
  page_url        text not null,
  category        text,
  country         text,
  monitor_config  jsonb not null default '{}'::jsonb,
  last_scraped_at timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_mait_competitors_workspace on mait_competitors(workspace_id);

-- ---------- ADS EXTERNAL (Apify) ----------
create table if not exists mait_ads_external (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id   uuid references mait_competitors(id) on delete set null,
  ad_archive_id   text not null,
  ad_text         text,
  headline        text,
  description     text,
  cta             text,
  image_url       text,
  video_url       text,
  landing_url     text,
  platforms       text[] not null default '{}',
  languages       text[] not null default '{}',
  start_date      timestamptz,
  end_date        timestamptz,
  status          text,
  raw_data        jsonb,
  created_at      timestamptz not null default now(),
  unique (workspace_id, ad_archive_id)
);
create index if not exists idx_mait_ads_external_workspace on mait_ads_external(workspace_id);
create index if not exists idx_mait_ads_external_competitor on mait_ads_external(competitor_id);
create index if not exists idx_mait_ads_external_created on mait_ads_external(created_at desc);
create index if not exists idx_mait_ads_external_text on mait_ads_external using gin (to_tsvector('simple', coalesce(ad_text,'') || ' ' || coalesce(headline,'')));

-- ---------- ADS MEDIA ----------
create table if not exists mait_ads_media (
  id            uuid primary key default uuid_generate_v4(),
  ad_id         uuid not null references mait_ads_external(id) on delete cascade,
  media_type    text not null,
  storage_path  text,
  original_url  text,
  downloaded_at timestamptz
);

-- ---------- META ACCOUNTS (Phase 1.1) ----------
create table if not exists mait_meta_accounts (
  id               uuid primary key default uuid_generate_v4(),
  workspace_id     uuid not null references mait_workspaces(id) on delete cascade,
  account_id       text not null,
  account_name     text,
  access_token     text,
  token_expires_at timestamptz,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------- ADS INTERNAL (Meta Marketing API — Phase 1.1) ----------
create table if not exists mait_ads_internal (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  meta_account_id uuid references mait_meta_accounts(id) on delete cascade,
  campaign_id     text,
  adset_id        text,
  ad_id           text,
  ad_name         text,
  creative_url    text,
  metrics         jsonb,
  date            date,
  breakdowns      jsonb,
  fetched_at      timestamptz not null default now()
);
create index if not exists idx_mait_ads_internal_workspace on mait_ads_internal(workspace_id);

-- ---------- SCRAPE JOBS ----------
create table if not exists mait_scrape_jobs (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references mait_workspaces(id) on delete cascade,
  competitor_id uuid references mait_competitors(id) on delete set null,
  apify_run_id  text,
  status        mait_scrape_status not null default 'pending',
  started_at    timestamptz default now(),
  completed_at  timestamptz,
  records_count integer default 0,
  cost_cu       numeric(10,4) default 0,
  error         text
);
create index if not exists idx_mait_scrape_jobs_workspace on mait_scrape_jobs(workspace_id);

-- ---------- ALERTS ----------
create table if not exists mait_alerts (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references mait_workspaces(id) on delete cascade,
  type          mait_alert_type not null,
  competitor_id uuid references mait_competitors(id) on delete set null,
  message       text not null,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_mait_alerts_workspace on mait_alerts(workspace_id);

-- ---------- TAGS / COLLECTIONS ----------
create table if not exists mait_tags (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  name         text not null,
  unique (workspace_id, name)
);

create table if not exists mait_ads_tags (
  ad_id  uuid not null references mait_ads_external(id) on delete cascade,
  tag_id uuid not null references mait_tags(id) on delete cascade,
  primary key (ad_id, tag_id)
);

create table if not exists mait_collections (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  name         text not null,
  description  text,
  user_id      uuid references mait_users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists mait_collection_ads (
  collection_id uuid not null references mait_collections(id) on delete cascade,
  ad_id         uuid not null references mait_ads_external(id) on delete cascade,
  primary key (collection_id, ad_id)
);

-- =====================================================================
-- HELPER: current user's workspace_id and role (used by RLS policies)
-- SECURITY DEFINER avoids RLS recursion when policies on mait_users
-- query mait_users for the caller's role.
-- =====================================================================
create or replace function mait_current_workspace()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select workspace_id from mait_users where id = auth.uid();
$$;

create or replace function mait_current_role()
returns mait_role
language sql stable security definer
set search_path = public
as $$
  select role from mait_users where id = auth.uid();
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table mait_workspaces      enable row level security;
alter table mait_users           enable row level security;
alter table mait_competitors     enable row level security;
alter table mait_ads_external    enable row level security;
alter table mait_ads_media       enable row level security;
alter table mait_meta_accounts   enable row level security;
alter table mait_ads_internal    enable row level security;
alter table mait_scrape_jobs     enable row level security;
alter table mait_alerts          enable row level security;
alter table mait_tags            enable row level security;
alter table mait_ads_tags        enable row level security;
alter table mait_collections     enable row level security;
alter table mait_collection_ads  enable row level security;

-- workspaces: members see their own; super_admin sees all
drop policy if exists "ws_select" on mait_workspaces;
create policy "ws_select" on mait_workspaces for select
  using (id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "ws_insert_super" on mait_workspaces;
create policy "ws_insert_super" on mait_workspaces for insert
  with check (mait_current_role() = 'super_admin');

drop policy if exists "ws_update_admin" on mait_workspaces;
create policy "ws_update_admin" on mait_workspaces for update
  using (id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

-- users: see colleagues in same workspace
drop policy if exists "users_select" on mait_users;
create policy "users_select" on mait_users for select
  using (workspace_id = mait_current_workspace() or id = auth.uid() or mait_current_role() = 'super_admin');

drop policy if exists "users_self_insert" on mait_users;
create policy "users_self_insert" on mait_users for insert
  with check (id = auth.uid());

drop policy if exists "users_self_update" on mait_users;
create policy "users_self_update" on mait_users for update
  using (id = auth.uid() or mait_current_role() in ('super_admin','admin'));

-- Generic workspace-scoped policy template
-- competitors
drop policy if exists "comp_select" on mait_competitors;
create policy "comp_select" on mait_competitors for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "comp_write" on mait_competitors;
create policy "comp_write" on mait_competitors for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

-- ads_external
drop policy if exists "ads_ext_select" on mait_ads_external;
create policy "ads_ext_select" on mait_ads_external for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

-- ads_media (joined via ad)
drop policy if exists "ads_media_select" on mait_ads_media;
create policy "ads_media_select" on mait_ads_media for select
  using (exists (
    select 1 from mait_ads_external a
    where a.id = ad_id
      and (a.workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin')
  ));

-- meta accounts
drop policy if exists "meta_acc_select" on mait_meta_accounts;
create policy "meta_acc_select" on mait_meta_accounts for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "meta_acc_write" on mait_meta_accounts;
create policy "meta_acc_write" on mait_meta_accounts for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

-- ads_internal
drop policy if exists "ads_int_select" on mait_ads_internal;
create policy "ads_int_select" on mait_ads_internal for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

-- scrape jobs
drop policy if exists "jobs_select" on mait_scrape_jobs;
create policy "jobs_select" on mait_scrape_jobs for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

-- alerts
drop policy if exists "alerts_select" on mait_alerts;
create policy "alerts_select" on mait_alerts for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "alerts_update" on mait_alerts;
create policy "alerts_update" on mait_alerts for update
  using (workspace_id = mait_current_workspace());

-- tags
drop policy if exists "tags_select" on mait_tags;
create policy "tags_select" on mait_tags for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "tags_write" on mait_tags;
create policy "tags_write" on mait_tags for all
  using (workspace_id = mait_current_workspace())
  with check (workspace_id = mait_current_workspace());

drop policy if exists "ads_tags_all" on mait_ads_tags;
create policy "ads_tags_all" on mait_ads_tags for all
  using (exists (select 1 from mait_ads_external a where a.id = ad_id and a.workspace_id = mait_current_workspace()))
  with check (exists (select 1 from mait_ads_external a where a.id = ad_id and a.workspace_id = mait_current_workspace()));

-- collections
drop policy if exists "coll_select" on mait_collections;
create policy "coll_select" on mait_collections for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "coll_write" on mait_collections;
create policy "coll_write" on mait_collections for all
  using (workspace_id = mait_current_workspace())
  with check (workspace_id = mait_current_workspace());

drop policy if exists "coll_ads_all" on mait_collection_ads;
create policy "coll_ads_all" on mait_collection_ads for all
  using (exists (select 1 from mait_collections c where c.id = collection_id and c.workspace_id = mait_current_workspace()))
  with check (exists (select 1 from mait_collections c where c.id = collection_id and c.workspace_id = mait_current_workspace()));
