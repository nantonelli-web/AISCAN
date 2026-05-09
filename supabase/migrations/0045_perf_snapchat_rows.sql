-- =====================================================================
-- AISCAN — Adv Performance: tabella Snapchat (2026-05-09).
-- Snapchat Ads export ha uno schema piu' essenziale di Meta:
-- 14 colonne (Week, identificativi campagna/ad set/ad/creativo,
-- Amount Spent, Paid Impressions, Clicks, Landing Page Views,
-- Adds To Cart, Purchases, Purchases Value). Niente Reach,
-- Frequency, CTR/CPM/CPC espliciti (derivati). Niente engagement
-- (post engagement, IG visits/follows).
-- Tabella dedicata per non sporcare lo schema Meta con field
-- inutili (channel separation rule, memory feedback).
-- =====================================================================

create table if not exists mait_perf_snapchat_rows (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  import_id           uuid not null references mait_perf_imports(id) on delete cascade,
  client_id           uuid not null references mait_clients(id) on delete cascade,
  date                date,
  week                text,
  campaign_name       text,
  campaign_id         text,
  ad_set_name         text,
  ad_set_id           text,
  ad_name             text,
  ad_id               text,
  creative_id         text,
  amount_spent        numeric,
  paid_impressions    bigint,
  clicks              bigint,
  landing_page_views  bigint,
  adds_to_cart        numeric,
  purchases           numeric,
  purchase_value      numeric,
  -- Custom columns ottenute eventualmente dall'utente per
  -- arricchire l'export (creative type / numero asset). Stesso
  -- pattern di Meta.
  creative_type       text,
  creative_count      integer,
  raw_data            jsonb default '{}'::jsonb
);

create index if not exists idx_perf_snap_rows_import
  on mait_perf_snapchat_rows(import_id);
create index if not exists idx_perf_snap_rows_workspace_client
  on mait_perf_snapchat_rows(workspace_id, client_id);
create index if not exists idx_perf_snap_rows_week
  on mait_perf_snapchat_rows(import_id, week)
  where week is not null;

alter table mait_perf_snapchat_rows enable row level security;

drop policy if exists "perf_snap_rows_select" on mait_perf_snapchat_rows;
create policy "perf_snap_rows_select"
  on mait_perf_snapchat_rows for select
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

drop policy if exists "perf_snap_rows_insert" on mait_perf_snapchat_rows;
create policy "perf_snap_rows_insert"
  on mait_perf_snapchat_rows for insert
  with check (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

drop policy if exists "perf_snap_rows_update" on mait_perf_snapchat_rows;
create policy "perf_snap_rows_update"
  on mait_perf_snapchat_rows for update
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );

drop policy if exists "perf_snap_rows_delete" on mait_perf_snapchat_rows;
create policy "perf_snap_rows_delete"
  on mait_perf_snapchat_rows for delete
  using (
    workspace_id in (
      select workspace_id from mait_users where id = auth.uid()
    )
  );
