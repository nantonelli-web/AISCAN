-- =====================================================================
-- MAIT — Client folders for brand organization
-- =====================================================================

create table if not exists mait_clients (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  name         text not null,
  color        text not null default '#d4a843',
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);

create index if not exists idx_mait_clients_workspace on mait_clients(workspace_id);

-- Add client_id to competitors (nullable — unassigned brands)
alter table mait_competitors
  add column if not exists client_id uuid references mait_clients(id) on delete set null;

create index if not exists idx_mait_competitors_client on mait_competitors(client_id);

-- RLS
alter table mait_clients enable row level security;

drop policy if exists "clients_select" on mait_clients;
create policy "clients_select" on mait_clients for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "clients_write" on mait_clients;
create policy "clients_write" on mait_clients for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

-- Grants
grant all on mait_clients to anon, authenticated, service_role;
