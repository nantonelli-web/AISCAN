-- Tracks admin-login attempts for brute-force throttling.
-- One row per attempt; lookups are by (email, attempted_at) or (ip, attempted_at)
-- within a recent window.
create table if not exists mait_admin_login_attempts (
  id           uuid primary key default uuid_generate_v4(),
  email        text not null,
  ip           text,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_mait_admin_login_attempts_email_time
  on mait_admin_login_attempts (email, attempted_at desc);

create index if not exists idx_mait_admin_login_attempts_ip_time
  on mait_admin_login_attempts (ip, attempted_at desc);

-- RLS: no authenticated users should touch this table. Service role bypasses.
alter table mait_admin_login_attempts enable row level security;

create policy "admin_login_attempts_no_access"
  on mait_admin_login_attempts for all
  using (false)
  with check (false);
