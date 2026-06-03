-- 0067_mait_logs.sql
-- Durable business/audit + warn/error event log written by the app
-- logger (src/lib/logger). Companion to Sentry: Sentry owns real-time
-- error alerting; this table owns the queryable in-house history that
-- can be joined against application data.
--
-- This table SHARES the prod DB, so:
--   * writes are best-effort from the app via the service-role admin
--     client (createAdminClient) — never block a request.
--   * retention is enforced via mait_logs_prune() (manual for now —
--     Vercel crons are paused; wire to a cron when they resume).
--
-- RLS model:
--   * service_role (admin client) inserts everything, reads everything
--     (RLS is bypassed for service_role).
--   * authenticated users may only SELECT rows of their own workspace.
--   * system rows (workspace_id IS NULL: cron / webhook logs) are
--     readable only by super_admin users.
--   * authenticated users can never INSERT/UPDATE/DELETE (no policy +
--     no write grant).

-- 1. Table
create table if not exists public.mait_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  level         text not null check (level in ('debug','info','warn','error')),
  event         text,                       -- short key, e.g. 'scrape.completed'
  message       text not null,
  channel       text,                       -- bracket-tag, e.g. 'Google Ads'
  workspace_id  uuid references mait_workspaces(id) on delete cascade,  -- NULLABLE (system logs)
  user_id       uuid references mait_users(id) on delete set null,
  competitor_id uuid references mait_competitors(id) on delete set null,
  job_id        uuid,                        -- soft ref to mait_scrape_jobs (no FK: logs may outlive jobs)
  request_id    text,
  context       jsonb not null default '{}'::jsonb,   -- already redacted by the logger
  error_name    text,
  error_stack   text
);

-- 2. Indexes for the expected query patterns.
create index if not exists mait_logs_created_at_idx on public.mait_logs (created_at desc);
create index if not exists mait_logs_level_idx      on public.mait_logs (level);
create index if not exists mait_logs_workspace_idx  on public.mait_logs (workspace_id);
create index if not exists mait_logs_event_idx      on public.mait_logs (event);
-- Common dashboard query: a workspace's recent errors.
create index if not exists mait_logs_ws_level_time_idx
  on public.mait_logs (workspace_id, level, created_at desc);

-- 3. Data API grants (Supabase 2026-10-30 default change).
--    authenticated may SELECT only; never write.
grant select on public.mait_logs to authenticated;
grant select, insert, update, delete on public.mait_logs to service_role;

-- 4. RLS
alter table public.mait_logs enable row level security;

-- 4a. Authenticated read: own-workspace rows.
create policy "mait_logs_ws_read" on public.mait_logs
  for select to authenticated
  using (
    workspace_id in (select workspace_id from mait_users where id = auth.uid())
  );

-- 4b. Authenticated read: system rows (null workspace) only for super_admin.
create policy "mait_logs_system_read_superadmin" on public.mait_logs
  for select to authenticated
  using (
    workspace_id is null
    and exists (
      select 1 from mait_users
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- 5. Retention. Crons are paused, so run this manually in the SQL editor
--    (e.g. monthly): select public.mait_logs_prune(90);
--    When crons resume, call it from a thin route via
--    admin.rpc('mait_logs_prune', { retain_days: 90 }).
create or replace function public.mait_logs_prune(retain_days int default 90)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted bigint;
begin
  delete from public.mait_logs
  where created_at < now() - make_interval(days => retain_days);
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.mait_logs_prune(int) from public, anon, authenticated;
grant execute on function public.mait_logs_prune(int) to service_role;
