-- ─────────────────────────────────────────────────────────────────────────
-- TEMPLATE — NOT A MIGRATION. The leading underscore keeps it out of any
-- migration-order tooling. Do NOT execute as-is (it has placeholders).
--
-- Copy-paste into a new `NNNN_<name>.sql` migration when creating a table
-- in the `public` schema, and replace every occurrence of `TABLE_NAME`
-- with the real table name.
--
-- Why this template exists:
--   From 2026-10-30 Supabase stops auto-granting Data API access to new
--   tables in `public` on existing projects (today we still get the
--   auto-grant — this is preparation). Without the GRANTs below, even
--   the service-role admin client (`createAdminClient`) receives
--   `42501 permission denied` on the new table.
--
-- What it does:
--   1. Creates the table (skeleton — adapt columns).
--   2. Grants Data API access to the two roles AISCAN actually uses
--      (service_role for server, authenticated for logged-in clients).
--      `anon` is intentionally omitted; add it only if an unauthenticated
--      page must read the table.
--   3. Enables RLS with the standard workspace-isolation policy. Adapt
--      the predicates if the table doesn't have a direct `workspace_id`.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Table definition
create table if not exists public.TABLE_NAME (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references mait_workspaces(id) on delete cascade,
  created_at   timestamptz not null default now()
  -- ... rest of the columns
);

-- 2. Data API grants (Supabase 2026-10-30 default change).
grant select, insert, update, delete on public.TABLE_NAME to authenticated, service_role;

-- 3. RLS + workspace isolation (standard AISCAN pattern).
alter table public.TABLE_NAME enable row level security;

create policy "TABLE_NAME_workspace_isolation" on public.TABLE_NAME
  for all to authenticated
  using (
    workspace_id in (select workspace_id from mait_users where id = auth.uid())
  )
  with check (
    workspace_id in (select workspace_id from mait_users where id = auth.uid())
  );
