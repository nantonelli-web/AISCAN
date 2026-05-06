-- =====================================================================
-- AISCAN — Google Maps rank history
-- Feature #1 di "analisi Maps oltre reviews": Local Pack ranking.
--
-- Le righe in mait_maps_places vengono UPSERTATE su ogni scan
-- (workspace, search, place_id) — quindi il `rank` corrente sovrascrive
-- il precedente e perdiamo la traccia. Per consentire delta rank
-- ("⬆3" / "⬇2") e trend nel tempo serve una tabella snapshot
-- append-only: una riga per scan per place.
--
-- Riferiamo Google's `place_id` text invece dell'AISCAN UUID per
-- non perdere la cronologia se eliminiamo/re-inseriamo righe in
-- mait_maps_places (es. ON CONFLICT DO UPDATE che cambia id).
-- =====================================================================

create table if not exists mait_maps_place_snapshots (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  search_id           uuid not null references mait_maps_searches(id) on delete cascade,
  place_id            text not null,                      -- Google's, NOT AISCAN UUID

  rank                integer,
  total_score         numeric,
  reviews_count       integer default 0,
  permanently_closed  boolean default false,
  temporarily_closed  boolean default false,
  is_advertisement    boolean default false,

  captured_at         timestamptz not null default now()
);

create index if not exists idx_maps_snapshots_search_captured
  on mait_maps_place_snapshots(search_id, captured_at desc);
create index if not exists idx_maps_snapshots_search_place_captured
  on mait_maps_place_snapshots(search_id, place_id, captured_at desc);
create index if not exists idx_maps_snapshots_workspace
  on mait_maps_place_snapshots(workspace_id);

-- ---------- RLS ----------
alter table mait_maps_place_snapshots enable row level security;

drop policy if exists "maps_snapshots_select" on mait_maps_place_snapshots;
create policy "maps_snapshots_select" on mait_maps_place_snapshots for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "maps_snapshots_write" on mait_maps_place_snapshots;
create policy "maps_snapshots_write" on mait_maps_place_snapshots for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

grant all on mait_maps_place_snapshots to anon, authenticated, service_role;
