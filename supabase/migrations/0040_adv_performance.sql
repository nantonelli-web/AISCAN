-- =====================================================================
-- AISCAN — Adv Performance (first-party campaign data analysis)
-- Feature 2026-05-08: nuova sezione /adv-performance dove l'utente
-- carica file CSV/XLSX esportati dagli ad manager (Meta MVP, poi
-- Google/TikTok/Snapchat) e AISCAN parsa, valida, normalizza,
-- persiste e renderizza un dashboard interattivo Benchmark-style.
--
-- ⚠ ARCHITETTURA — segue il pattern AISCAN di tabelle channel-
-- specifiche (mait_ads_external Meta+Google, mait_tiktok_ads,
-- mait_snapchat_ads): un header agnostic (mait_perf_imports) +
-- una tabella di rows per canale (questa migration: solo Meta).
-- Future migrations: mait_perf_google_rows / tiktok_rows /
-- snapchat_rows quando i parser saranno pronti.
-- =====================================================================

-- ---------- IMPORT HEADER (channel-agnostic) ----------
create table if not exists mait_perf_imports (
  id                uuid primary key default uuid_generate_v4(),
  workspace_id      uuid not null references mait_workspaces(id) on delete cascade,
  client_id         uuid not null references mait_clients(id) on delete cascade,

  channel           text not null check (channel in ('meta','google','tiktok','snapchat')),
  period_from       date not null,
  period_to         date not null check (period_to >= period_from),

  file_path         text not null,         -- Supabase Storage path nel bucket performance-imports
  file_format       text not null check (file_format in ('csv','xlsx')),
  file_name         text,                  -- nome originale per UI

  -- Stato del import lifecycle:
  --   parsing:    upload arrivato, parsing in corso (transient)
  --   validated:  parsing+validation OK, righe persistite (default visibile)
  --   failed:     parsing/validation hanno trovato errori bloccanti
  status            text not null default 'parsing'
                       check (status in ('parsing','validated','failed')),

  currency          text,                  -- ISO 4217 (es. 'EUR','USD','GBP')
  row_count         integer not null default 0,
  total_spend       numeric not null default 0,
  total_impressions bigint not null default 0,

  -- Validation findings: array di {severity, code, message, context}.
  -- Mostrato all'utente sulla diagnostic page prima del confirm.
  diagnostics       jsonb not null default '[]'::jsonb,

  -- Metadata debug (column-mapping rilevato, ad-account name dal
  -- file, locale rilevato, ecc.)
  raw_meta          jsonb not null default '{}'::jsonb,

  created_by        uuid references mait_users(id) on delete set null,
  created_at        timestamptz not null default now(),
  validated_at      timestamptz
);

create index if not exists idx_perf_imports_workspace_client_channel
  on mait_perf_imports(workspace_id, client_id, channel, period_from desc);
create index if not exists idx_perf_imports_workspace_status
  on mait_perf_imports(workspace_id, status);
create index if not exists idx_perf_imports_period
  on mait_perf_imports(client_id, channel, period_from, period_to);

-- ---------- META PERFORMANCE ROWS ----------
-- Ogni riga e' una combinazione (date, campaign, ad_set, ad) dal
-- export Meta. Modelliamo le metriche piu' usate come colonne
-- tipizzate; il payload originale resta in raw_data per fields
-- piu' esoterici (frequency by region, app metrics, ecc).
create table if not exists mait_perf_meta_rows (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references mait_workspaces(id) on delete cascade,
  import_id           uuid not null references mait_perf_imports(id) on delete cascade,
  -- Denormalizzato per filtering veloce sul dashboard (una query
  -- per client cross-import senza JOIN a mait_perf_imports).
  client_id           uuid not null references mait_clients(id) on delete cascade,

  -- Granularita' temporale + campagna
  date                date not null,
  campaign_name       text,
  campaign_id         text,                -- Meta Campaign ID (se presente nel export)
  ad_set_name         text,
  ad_set_id           text,
  ad_name             text,
  ad_id               text,

  -- Strategia di campagna
  objective           text,                -- es. 'OUTCOME_SALES','TRAFFIC','REACH'
  buying_type         text,                -- 'AUCTION'|'RESERVED'

  -- Spesa
  amount_spent        numeric not null default 0,

  -- Volume
  impressions         bigint not null default 0,
  reach               bigint not null default 0,
  frequency           numeric,             -- impressions / reach
  clicks              bigint not null default 0,         -- "Clicks (all)"
  link_clicks         bigint not null default 0,
  unique_clicks       bigint not null default 0,
  unique_link_clicks  bigint not null default 0,

  -- Rate (memorizzati come riportati dall'export, validator
  -- verifica consistenza con clicks/impressions a +/- 5%)
  ctr                 numeric,             -- "CTR (all)"
  link_ctr            numeric,             -- "CTR (link click-through rate)"
  cpm                 numeric,
  cpc                 numeric,             -- "CPC (all)"
  link_cpc            numeric,

  -- Conversion outcomes — Meta li riporta come "Results" + un
  -- "Result indicator" che dice di quale evento si tratta
  -- (Purchase / AddToCart / Lead / ecc).
  results             numeric,
  result_indicator    text,
  cost_per_result     numeric,
  purchase_roas       numeric,             -- Website Purchase ROAS (se col file)
  purchases           numeric,
  purchase_value      numeric,             -- Website Purchase Conversion Value

  -- Quality signals (Meta delivery rankings)
  quality_ranking          text,           -- 'above_average'|'average'|'below_average'|null
  engagement_rate_ranking  text,
  conversion_rate_ranking  text,

  -- Full original row per fields non modellati
  raw_data            jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now()
);

create index if not exists idx_perf_meta_rows_import
  on mait_perf_meta_rows(import_id);
create index if not exists idx_perf_meta_rows_client_date
  on mait_perf_meta_rows(workspace_id, client_id, date desc);
create index if not exists idx_perf_meta_rows_campaign
  on mait_perf_meta_rows(import_id, campaign_name);
create index if not exists idx_perf_meta_rows_year_lookup
  on mait_perf_meta_rows(client_id, date)
  where amount_spent > 0;

-- ---------- RLS ----------
alter table mait_perf_imports enable row level security;
alter table mait_perf_meta_rows enable row level security;

drop policy if exists "perf_imports_select" on mait_perf_imports;
create policy "perf_imports_select" on mait_perf_imports for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "perf_imports_write" on mait_perf_imports;
create policy "perf_imports_write" on mait_perf_imports for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

drop policy if exists "perf_meta_rows_select" on mait_perf_meta_rows;
create policy "perf_meta_rows_select" on mait_perf_meta_rows for select
  using (workspace_id = mait_current_workspace() or mait_current_role() = 'super_admin');

drop policy if exists "perf_meta_rows_write" on mait_perf_meta_rows;
create policy "perf_meta_rows_write" on mait_perf_meta_rows for all
  using (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'))
  with check (workspace_id = mait_current_workspace() and mait_current_role() in ('super_admin','admin'));

-- ---------- Grants ----------
grant all on mait_perf_imports   to anon, authenticated, service_role;
grant all on mait_perf_meta_rows to anon, authenticated, service_role;
