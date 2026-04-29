-- =====================================================================
-- AISCAN — Per-user company / fiscal data
-- Each user owns their own company record (1:1 with mait_users).
-- The credit-recharge flow reads this record so the admin email can
-- include legal name, VAT, address, SDI/PEC and emit the invoice
-- without chasing the customer.
--
-- Country is ISO-2; VAT and SDI are validated *light* on the app side
-- (regex per country). Fields kept nullable so the user can save in
-- progress, but the app gates the credit request on a fully-filled
-- record.
-- =====================================================================

create table if not exists mait_user_company (
  user_id        uuid primary key references mait_users(id) on delete cascade,
  -- Denormalised so RLS can scope by workspace without joining
  -- mait_users on every check.
  workspace_id   uuid not null references mait_workspaces(id) on delete cascade,

  legal_name     text,
  country        text,                      -- ISO-3166-1 alpha-2
  vat_number     text,                      -- P.IVA / VAT / Tax ID
  tax_code       text,                      -- Codice fiscale (IT, can differ from P.IVA)

  address_line1  text,
  address_line2  text,
  city           text,
  province       text,                      -- Provincia / state / region
  postal_code    text,                      -- ZIP / CAP

  -- Italian electronic invoicing — only meaningful when country = 'IT'.
  sdi_code       text,                      -- 7-char alphanumeric destinatario
  pec_email      text,                      -- Posta Elettronica Certificata

  billing_email  text,
  phone          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_mait_user_company_workspace
  on mait_user_company(workspace_id);

-- Touch updated_at on every UPDATE so the admin panel can show
-- "last edited" without the app remembering to set it.
create or replace function mait_user_company_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mait_user_company_touch on mait_user_company;
create trigger trg_mait_user_company_touch
  before update on mait_user_company
  for each row execute function mait_user_company_touch_updated_at();

-- ---------- RLS ----------
alter table mait_user_company enable row level security;

-- Each user can read their own company record. Admins/super_admins in
-- the same workspace can also read colleagues' records (needed for
-- the admin credit-request panel and for per-workspace billing
-- oversight).
drop policy if exists "user_company_select" on mait_user_company;
create policy "user_company_select" on mait_user_company for select
  using (
    user_id = auth.uid()
    or (
      workspace_id = mait_current_workspace()
      and mait_current_role() in ('super_admin', 'admin')
    )
    or mait_current_role() = 'super_admin'
  );

-- A user can INSERT only their own row, and only against their own
-- workspace — no spoofing someone else's user_id or workspace.
drop policy if exists "user_company_insert" on mait_user_company;
create policy "user_company_insert" on mait_user_company for insert
  with check (
    user_id = auth.uid()
    and workspace_id = mait_current_workspace()
  );

-- A user can UPDATE their own row. Workspace admins can also update
-- colleagues in the same workspace (e.g. agency owner curating the
-- billing data for their team).
drop policy if exists "user_company_update" on mait_user_company;
create policy "user_company_update" on mait_user_company for update
  using (
    user_id = auth.uid()
    or (
      workspace_id = mait_current_workspace()
      and mait_current_role() in ('super_admin', 'admin')
    )
  )
  with check (
    user_id = auth.uid()
    or (
      workspace_id = mait_current_workspace()
      and mait_current_role() in ('super_admin', 'admin')
    )
  );

-- Deletes only via service role (account deletion cleanup); regular
-- clients have no policy and therefore cannot DELETE.

grant select, insert, update on mait_user_company to authenticated;
grant all on mait_user_company to service_role;
