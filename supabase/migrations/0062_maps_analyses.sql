-- AI store-analysis reports for the Maps detail view.
--
-- One row per generated analysis, keyed by (search, comparison signature,
-- model, locale). The signature is a stable hash of the comparison spec
-- (mode + selected store/brand keys) so re-opening the same comparison
-- serves the cached report instead of re-billing the user. `result` holds
-- the full payload: the deterministic facts (per-store / per-brand
-- aggregates, foot-traffic profile, store-count asymmetry) plus the AI
-- narrative, so the page can render everything from a single row.
--
-- Includes the Data API grants + RLS block required for new public tables
-- (see supabase/migrations/_TEMPLATE_new_table.sql).

-- 1. Table definition
create table if not exists public.mait_maps_analyses (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references mait_workspaces(id) on delete cascade,
  search_id            uuid not null references mait_maps_searches(id) on delete cascade,
  mode                 text not null check (mode in ('intra_brand', 'cross_brand')),
  comparison_signature text not null,
  model_id             text,
  locale               text not null default 'it',
  result               jsonb not null,
  created_at           timestamptz not null default now()
);

-- One cached report per (search, comparison, model, locale). Re-generating
-- overwrites via upsert on this key.
create unique index if not exists mait_maps_analyses_unique
  on public.mait_maps_analyses (search_id, comparison_signature, model_id, locale);

create index if not exists mait_maps_analyses_workspace_search
  on public.mait_maps_analyses (workspace_id, search_id);

-- 2. Data API grants (Supabase 2026-10-30 default change).
grant select, insert, update, delete on public.mait_maps_analyses to authenticated, service_role;

-- 3. RLS + workspace isolation (standard AISCAN pattern).
alter table public.mait_maps_analyses enable row level security;

create policy "mait_maps_analyses_workspace_isolation" on public.mait_maps_analyses
  for all to authenticated
  using (
    workspace_id in (select workspace_id from mait_users where id = auth.uid())
  )
  with check (
    workspace_id in (select workspace_id from mait_users where id = auth.uid())
  );
