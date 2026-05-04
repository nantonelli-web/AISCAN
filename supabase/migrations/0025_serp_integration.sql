-- =====================================================================
-- AISCAN — Google SERP integration
-- Class B (autonomous entity, not bound to a brand) per the brief —
-- with an optional M:N association to brands so the same query can
-- be tracked standalone AND as a "rank check" for one or more brands.
--
-- Four tables (matches the project memory architectural decision):
-- 1. mait_serp_queries          — the query itself (text + geo)
-- 2. mait_serp_query_brands     — M:N junction (query, competitor)
-- 3. mait_serp_runs             — one row per scan
-- 4. mait_serp_results          — one row per individual SERP result
--
-- Brand match is a JOIN at render time on
-- `mait_serp_results.normalized_domain = mait_competitors.google_domain`
-- — never a foreign key, so renaming a brand domain or adding new
-- brands does not require backfill, and the same SERP run feeds
-- every brand simultaneously.
--
-- Schema verified on 2026-04-28 against the real
-- apify/google-search-scraper actor with "running shoes" / IT —
-- see `project_new_actors_plan.md`.
-- =====================================================================

-- ---------- SERP QUERIES ----------
-- Each row is a unique (workspace, query_text, country, language)
-- combo. Same query in IT vs FR is two distinct rows because the
-- SERP itself differs.
create table if not exists mait_serp_queries (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,

  query               text not null,                  -- e.g. "abito lino donna"
  country             text not null default 'IT',     -- ISO alpha-2
  language            text not null default 'it',     -- ISO alpha-2 lowercase
  device              text not null default 'DESKTOP', -- "DESKTOP" | "MOBILE"

  -- Optional human label, e.g. "Branded — Sezane Italia"
  label               text,

  is_active           boolean not null default true,

  last_scraped_at     timestamptz,
  created_at          timestamptz not null default now()
);

-- Postgres rejects expression-based UNIQUE constraints inside
-- CREATE TABLE; the equivalent expression UNIQUE INDEX does the job
-- and is what you'd actually want anyway (case-insensitive uniqueness).
create unique index if not exists ux_mait_serp_queries_unique
  on mait_serp_queries(workspace_id, lower(query), country, language, device);

create index if not exists idx_mait_serp_queries_workspace
  on mait_serp_queries(workspace_id);
create index if not exists idx_mait_serp_queries_last_scraped
  on mait_serp_queries(last_scraped_at desc nulls last);

-- ---------- SERP QUERY ↔ BRAND (M:N) ----------
-- The same query can be associated with zero, one or many brands.
-- Used to feed the "brand SERP rank" view in the brand-detail tab —
-- the user picks "this query is interesting for brand X" so the
-- brand-scoped UI surfaces only the queries the user opted in.
create table if not exists mait_serp_query_brands (
  query_id        uuid not null references mait_serp_queries(id) on delete cascade,
  competitor_id   uuid not null references mait_competitors(id) on delete cascade,
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (query_id, competitor_id)
);

create index if not exists idx_mait_serp_query_brands_query
  on mait_serp_query_brands(query_id);
create index if not exists idx_mait_serp_query_brands_competitor
  on mait_serp_query_brands(competitor_id);
create index if not exists idx_mait_serp_query_brands_workspace
  on mait_serp_query_brands(workspace_id);

-- ---------- SERP RUNS ----------
-- One row per scan of a query. Stores aggregate counters + the full
-- raw response for downstream re-derivation. The individual results
-- are also normalised into mait_serp_results so we can query them
-- without parsing JSON.
create table if not exists mait_serp_runs (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  query_id            uuid not null references mait_serp_queries(id) on delete cascade,

  apify_run_id        text,
  scraped_at          timestamptz not null default now(),

  -- Aggregate counters (cheap to compute, very useful for the
  -- queries grid: "8 organic, 2 ads on this scan").
  organic_count       integer default 0,
  paid_count          integer default 0,
  paid_products_count integer default 0,
  has_ai_overview     boolean default false,
  related_queries     jsonb default '[]'::jsonb,
  people_also_ask     jsonb default '[]'::jsonb,

  -- Full Apify response — includes everything we did NOT normalise
  -- (peopleAlsoAsk full text, aiOverview sources, htmlSnapshotUrl).
  raw_data            jsonb,

  cost_cu             numeric default 0
);

create index if not exists idx_mait_serp_runs_workspace
  on mait_serp_runs(workspace_id);
create index if not exists idx_mait_serp_runs_query
  on mait_serp_runs(query_id);
create index if not exists idx_mait_serp_runs_scraped
  on mait_serp_runs(scraped_at desc);

-- ---------- SERP RESULTS ----------
-- One row per individual result on the SERP. We do NOT delete old
-- results when a new scan lands — instead we keep the history (run
-- linked) so the user can see how a brand's rank evolved.
create table if not exists mait_serp_results (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  run_id              uuid not null references mait_serp_runs(id) on delete cascade,
  query_id            uuid not null references mait_serp_queries(id) on delete cascade,

  -- Type taxonomy:
  --   "organic"            → standard /search organic listing
  --   "paid"               → Google Ads sponsored result (top/bottom)
  --   "paid_product"       → Google Shopping product ad
  --   "people_also_ask"    → PAA card with answer
  --   "ai_source"          → source cited in the AI Overview
  result_type         text not null,
  -- 1-based ranking — independent counters for organic vs paid (the
  -- actor exposes `position` for organic and `adPosition` for paid).
  position            integer,

  url                 text,
  -- normalized_domain: registrable domain (eTLD+1) extracted by the
  -- service layer. Used to JOIN against mait_competitors.google_domain.
  normalized_domain   text,
  displayed_url       text,
  title               text,
  description         text,
  image_url           text,
  date_text           text,                 -- raw "10 mesi fa" / ISO date / null
  emphasized_keywords jsonb default '[]'::jsonb,
  site_links          jsonb default '[]'::jsonb,
  product_info        jsonb default '{}'::jsonb,

  raw_data            jsonb
);

create index if not exists idx_mait_serp_results_workspace
  on mait_serp_results(workspace_id);
create index if not exists idx_mait_serp_results_run
  on mait_serp_results(run_id);
create index if not exists idx_mait_serp_results_query
  on mait_serp_results(query_id);
create index if not exists idx_mait_serp_results_domain
  on mait_serp_results(normalized_domain);
create index if not exists idx_mait_serp_results_type
  on mait_serp_results(result_type);

-- ---------- RLS ----------
alter table mait_serp_queries        enable row level security;
alter table mait_serp_query_brands   enable row level security;
alter table mait_serp_runs           enable row level security;
alter table mait_serp_results        enable row level security;

drop policy if exists "serp_queries_select" on mait_serp_queries;
create policy "serp_queries_select" on mait_serp_queries for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "serp_queries_write" on mait_serp_queries;
create policy "serp_queries_write" on mait_serp_queries for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

drop policy if exists "serp_query_brands_select" on mait_serp_query_brands;
create policy "serp_query_brands_select" on mait_serp_query_brands for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "serp_query_brands_write" on mait_serp_query_brands;
create policy "serp_query_brands_write" on mait_serp_query_brands for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

drop policy if exists "serp_runs_select" on mait_serp_runs;
create policy "serp_runs_select" on mait_serp_runs for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "serp_runs_write" on mait_serp_runs;
create policy "serp_runs_write" on mait_serp_runs for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

drop policy if exists "serp_results_select" on mait_serp_results;
create policy "serp_results_select" on mait_serp_results for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "serp_results_write" on mait_serp_results;
create policy "serp_results_write" on mait_serp_results for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

-- ---------- Grants ----------
grant all on mait_serp_queries to anon, authenticated, service_role;
grant all on mait_serp_query_brands to anon, authenticated, service_role;
grant all on mait_serp_runs to anon, authenticated, service_role;
grant all on mait_serp_results to anon, authenticated, service_role;
