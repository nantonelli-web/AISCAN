-- =====================================================================
-- AISCAN — Bring-Your-Own provider keys (Apify + LLM)
--
-- Two billing modes coexist on the platform, toggled per workspace
-- by the AISCAN super_admin from the backoffice:
--
--   - "credits"      → AISCAN-managed: env-level Apify + OpenRouter
--                      keys, every operation consumes credits.
--                      Default for existing and new workspaces.
--   - "subscription" → BYO: workspace owner pays a flat platform
--                      fee (handled offline / Stripe later) and
--                      brings own provider keys (mait_provider_keys
--                      below). Credit consumption is no-op.
--
-- A workspace switched to "subscription" with no keys configured is
-- a hard fail: scans / AI calls error out with a clear "configure
-- your keys" prompt, no silent fallback to AISCAN credits.
-- Crediti residui restano dormienti (Q2.a — scelta utente, gestiti
-- offline come rimborso al passaggio).
-- =====================================================================

-- ---------- 1. workspace.billing_mode ----------
alter table mait_workspaces
  add column if not exists billing_mode text not null default 'credits'
    check (billing_mode in ('credits', 'subscription'));

-- ---------- 2. mait_provider_keys ----------
-- One row per (workspace, provider). The actual API token is
-- AES-256-GCM encrypted on the application side using
-- process.env.PROVIDER_KEYS_MASTER, stored as a packed text payload
-- "iv:tag:ciphertext" (all base64). pgcrypto is NOT used at runtime
-- so the master key never travels in SQL queries / logs.
create table if not exists mait_provider_keys (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references mait_workspaces(id) on delete cascade,
  provider        text not null check (provider in ('apify', 'openrouter')),
  encrypted_key   text not null,
  -- Last 4 chars of the plaintext, kept verbatim so the UI can show
  -- "sk-…AbCd" without ever decrypting. Never store more than this.
  last_4          text not null,
  label           text,
  status          text not null default 'active'
                   check (status in ('active', 'invalid', 'revoked')),
  last_tested_at  timestamptz,
  last_test_error text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index if not exists idx_mait_provider_keys_workspace
  on mait_provider_keys(workspace_id);

-- Touch updated_at on every UPDATE.
create or replace function mait_provider_keys_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mait_provider_keys_touch on mait_provider_keys;
create trigger trg_mait_provider_keys_touch
  before update on mait_provider_keys
  for each row execute function mait_provider_keys_touch_updated_at();

-- ---------- 3. scrape_jobs audit ----------
-- Two new columns let the AISCAN admin answer support questions like
-- "why did this run fail at 10:32?" without guessing. key_used is
-- NULL when the run used the AISCAN-managed env key (credits mode);
-- otherwise it points at the mait_provider_keys row that was active
-- at run time. billing_mode_at_run snapshots the mode in case the
-- workspace switches modes after the fact.
alter table mait_scrape_jobs
  add column if not exists key_used uuid references mait_provider_keys(id) on delete set null,
  add column if not exists billing_mode_at_run text;

-- ---------- 4. RLS ----------
alter table mait_provider_keys enable row level security;

-- Only admins / super_admins of the same workspace can read or
-- mutate keys. Analysts / viewers do NOT see them, even masked —
-- the security boundary is "who controls billing for this
-- workspace", which is admin-grade.
drop policy if exists "provider_keys_admin_select" on mait_provider_keys;
create policy "provider_keys_admin_select" on mait_provider_keys for select
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
    or mait_current_role() = 'super_admin'
  );

drop policy if exists "provider_keys_admin_write" on mait_provider_keys;
create policy "provider_keys_admin_write" on mait_provider_keys for all
  using (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  )
  with check (
    workspace_id = mait_current_workspace()
    and mait_current_role() in ('super_admin', 'admin')
  );

grant select, insert, update, delete on mait_provider_keys to authenticated;
grant all on mait_provider_keys to service_role;
