-- =====================================================================
-- MAIT — Invitation system
-- =====================================================================

create table if not exists mait_invitations (
  id           uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  email        text not null,
  role         mait_role not null default 'analyst',
  token        text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by   uuid references mait_users(id) on delete set null,
  accepted_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  unique (workspace_id, email)
);

create index if not exists idx_mait_invitations_token on mait_invitations(token);
create index if not exists idx_mait_invitations_workspace on mait_invitations(workspace_id);

alter table mait_invitations enable row level security;

-- Only admins can see/manage invitations for their workspace
drop policy if exists "inv_select" on mait_invitations;
create policy "inv_select" on mait_invitations for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "inv_write" on mait_invitations;
create policy "inv_write" on mait_invitations for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

-- Grant access
grant all on mait_invitations to anon, authenticated, service_role;
