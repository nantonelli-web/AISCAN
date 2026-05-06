-- =====================================================================
-- AISCAN — Google SERP rank history (per-domain)
-- Feature #4 di "analisi SERP oltre lista basilare". Parallela a
-- Migration 0038 sul Maps.
--
-- Decisione di design: snapshot per-DOMINIO (non per-URL).
-- Le URL singole nei risultati cambiano spesso (article rotation,
-- categoria pagine, query string) → per-URL snapshot sarebbe noisy.
-- Per-dominio e' stabile e matcha il nostro modello di brand
-- tracking (mait_competitors.google_domain).
--
-- Per ogni scan tracciamo: per dominio (organic only nella prima
-- iterazione), best_position raggiunta e quanti URL totali ha sulla
-- pagina. Il delta UI ("↑3 / ↓2") e' calcolato a render time
-- confrontando i due snapshot piu recenti per ogni dominio.
-- =====================================================================

create table if not exists mait_serp_result_snapshots (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  query_id            uuid not null references mait_serp_queries(id) on delete cascade,

  normalized_domain   text not null,                  -- eTLD+1
  result_type         text not null,                  -- 'organic', 'paid', 'ai_source', 'paid_product'
  best_position       integer,                        -- posizione best raggiunta (lower = better)
  result_count        integer not null default 0,     -- quante URL ha sulla pagina

  captured_at         timestamptz not null default now()
);

create index if not exists idx_serp_snapshots_query_captured
  on mait_serp_result_snapshots(query_id, captured_at desc);
create index if not exists idx_serp_snapshots_query_domain_captured
  on mait_serp_result_snapshots(query_id, normalized_domain, captured_at desc);
create index if not exists idx_serp_snapshots_workspace
  on mait_serp_result_snapshots(workspace_id);

-- ---------- RLS ----------
alter table mait_serp_result_snapshots enable row level security;

drop policy if exists "serp_snapshots_select" on mait_serp_result_snapshots;
create policy "serp_snapshots_select" on mait_serp_result_snapshots for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "serp_snapshots_write" on mait_serp_result_snapshots;
create policy "serp_snapshots_write" on mait_serp_result_snapshots for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin', 'admin'));

grant all on mait_serp_result_snapshots to anon, authenticated, service_role;
