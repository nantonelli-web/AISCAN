-- =====================================================================
-- AISCAN — Adv Performance: AI analysis cache (2026-05-09).
-- L'utente puo' generare un'analisi AI per ogni "sezione" del dashboard
-- (overview / acquisti / engagement / time series / top campaigns /
-- countries / campaign types / creatives / objective). Una sezione per
-- import, last-write-wins. Salviamo anche l'origine (model + tier) e un
-- flag edited_by_user per non sovrascrivere modifiche manuali al
-- regenerate.
-- =====================================================================

create table if not exists mait_perf_analyses (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  import_id       uuid not null references mait_perf_imports(id) on delete cascade,
  section         text not null,
  content         text not null,
  model_tier      text not null check (model_tier in ('cheap','pragmatic','premium')),
  model_id        text,
  edited_by_user  boolean not null default false,
  created_by      uuid references mait_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (import_id, section)
);

create index if not exists idx_perf_analyses_import
  on mait_perf_analyses(import_id);

alter table mait_perf_analyses enable row level security;

-- Nota: mait_users.id e' direttamente l'auth.users(id), quindi
-- workspace lookup e': workspace_id where mait_users.id = auth.uid().
drop policy if exists "perf_analyses_select" on mait_perf_analyses;
create policy "perf_analyses_select"
  on mait_perf_analyses for select
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

drop policy if exists "perf_analyses_insert" on mait_perf_analyses;
create policy "perf_analyses_insert"
  on mait_perf_analyses for insert
  with check (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

drop policy if exists "perf_analyses_update" on mait_perf_analyses;
create policy "perf_analyses_update"
  on mait_perf_analyses for update
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

drop policy if exists "perf_analyses_delete" on mait_perf_analyses;
create policy "perf_analyses_delete"
  on mait_perf_analyses for delete
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );
