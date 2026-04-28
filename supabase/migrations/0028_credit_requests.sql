-- =====================================================================
-- AISCAN — Credit recharge requests (AICREA-style flow)
-- The Crediti page lets a user pick a pack and submit a recharge
-- request. The request is saved here and an email is sent to
-- the AISCAN admin via Resend; the admin then fulfills (grants the
-- credits) or rejects from the admin panel. No online payment —
-- payment is handled offline (bonifico, etc).
--
-- Mirrors AICREA's `credit_requests` table 1:1 so the two products
-- can share an admin pattern. Renamed with the `mait_` prefix to
-- match the rest of AISCAN's namespace.
-- =====================================================================

create table if not exists mait_credit_requests (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  user_id             uuid references mait_users(id) on delete set null,
  user_email          text not null,
  user_name           text,
  credits_requested   integer not null,
  package_price_eur   numeric(10, 2) not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'fulfilled', 'rejected')),
  -- Admin who actioned the request. Foreign-keyed to admin users
  -- when the row exists, but kept nullable so a deleted admin
  -- account does not nuke history.
  fulfilled_by        uuid,
  fulfilled_at        timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_mait_credit_requests_workspace
  on mait_credit_requests(workspace_id);
create index if not exists idx_mait_credit_requests_status_created
  on mait_credit_requests(status, created_at desc);
create index if not exists idx_mait_credit_requests_user
  on mait_credit_requests(user_id);

-- ---------- RLS ----------
alter table mait_credit_requests enable row level security;

-- A workspace member can SEE the requests their workspace has made
-- (so the user can later see "yes my request was fulfilled").
drop policy if exists "credit_requests_select_own" on mait_credit_requests;
create policy "credit_requests_select_own" on mait_credit_requests for select
  using (
    workspace_id = mait_current_workspace()
    or mait_current_role() = 'super_admin'
  );

-- Workspace members CREATE requests for their own workspace. Admin
-- panel writes go via the service role client and bypass RLS.
drop policy if exists "credit_requests_insert_own" on mait_credit_requests;
create policy "credit_requests_insert_own" on mait_credit_requests for insert
  with check (
    workspace_id = mait_current_workspace()
  );

-- Updates only via service role (admin actions). No policy so the
-- regular client cannot tamper with status.

-- ---------- Grants ----------
grant select, insert on mait_credit_requests to authenticated;
grant all on mait_credit_requests to anon, service_role;
