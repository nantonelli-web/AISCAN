-- =====================================================================
-- AISCAN — Admin AI Models management (2026-05-10)
-- Portato da AICREA. Tabella catalogo dei modelli LLM disponibili
-- nel workspace, con costo crediti, flag attivo, last sync, info per
-- review/analyze (fase successiva).
-- Globale (no workspace_id): l'admin platform-wide la gestisce per
-- tutti i workspace.
-- =====================================================================

create table if not exists mait_ai_models (
  id              uuid primary key default uuid_generate_v4(),
  provider        text not null,           -- 'openai' | 'anthropic' | 'google' | 'mistral' | 'deepseek' | ...
  model_id        text not null unique,    -- es. 'claude-haiku-4-5'
  display_name    text not null,
  credits_cost    integer not null default 1,
  is_active       boolean not null default true,
  -- ID OpenRouter (es. 'anthropic/claude-haiku-4-5'), usato per
  -- routing API. Nullable per modelli non ancora syncati.
  openrouter_id   text,
  supports_vision boolean not null default false,
  -- Ultimo sync dal catalogo OpenRouter (cron + manual).
  last_synced_at  timestamptz,
  -- Review state (fase successiva): analysis JSONB e relativi campi
  -- restano nullable per back-compat. Quando si attiva un modello
  -- nuovo dal sync, l'admin puo' analizzarlo prima di decidere.
  analysis        jsonb,
  analyzed_with   text,
  analyzed_at     timestamptz,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_mait_ai_models_provider on mait_ai_models(provider);
create index if not exists idx_mait_ai_models_active on mait_ai_models(is_active) where is_active = true;
create index if not exists idx_mait_ai_models_unreviewed
  on mait_ai_models (created_at desc)
  where is_active = false and reviewed_at is null;

-- Tabella admin-only: gli endpoint /api/admin/models usano sempre
-- createAdminClient() (service role key) che bypassa RLS. Abilitiamo
-- RLS senza policy = nessun accesso per anon/authenticated keys.
-- Cosi' Supabase non emette il warning "RLS not enabled" e l'unico
-- vettore di accesso resta il service role (verificato da JWT admin
-- nei nostri endpoint).
alter table mait_ai_models enable row level security;

-- Catalogo iniziale: gli stessi modelli AICREA del 2026-04 + i tier
-- specifici Claude / DeepSeek che AISCAN gia' usa nel modulo Adv
-- Performance.
insert into mait_ai_models (provider, model_id, display_name, credits_cost, is_active, openrouter_id, supports_vision, last_synced_at) values
  ('openai',    'gpt-4.1',                 'GPT-4.1',                 2, true, 'openai/gpt-4.1',              true,  now()),
  ('openai',    'gpt-4.1-mini',            'GPT-4.1 Mini',            1, true, 'openai/gpt-4.1-mini',         true,  now()),
  ('openai',    'gpt-4o',                  'GPT-4o',                  2, true, 'openai/gpt-4o',               true,  now()),
  ('anthropic', 'claude-sonnet-4-5',       'Claude Sonnet 4.5',       3, true, 'anthropic/claude-sonnet-4.5', true,  now()),
  ('anthropic', 'claude-haiku-4-5',        'Claude Haiku 4.5',        1, true, 'anthropic/claude-haiku-4.5',  true,  now()),
  ('google',    'gemini-2.5-pro',          'Gemini 2.5 Pro',          2, true, 'google/gemini-2.5-pro',       true,  now()),
  ('google',    'gemini-2.5-flash',        'Gemini 2.5 Flash',        1, true, 'google/gemini-2.5-flash',     true,  now()),
  ('google',    'gemini-2.0-flash-lite',   'Gemini 2.0 Flash Lite',   1, true, 'google/gemini-2.0-flash-lite-001', true, now()),
  ('deepseek',  'deepseek-v3.2',           'DeepSeek V3.2',           1, true, 'deepseek/deepseek-v3.2',      false, now())
on conflict (model_id) do update set
  provider        = excluded.provider,
  display_name    = excluded.display_name,
  credits_cost    = excluded.credits_cost,
  is_active       = excluded.is_active,
  openrouter_id   = excluded.openrouter_id,
  supports_vision = excluded.supports_vision,
  last_synced_at  = now();
