-- =====================================================================
-- AISCAN — Allineamento modelli AI con AICREA (2026-05-10).
-- AICREA mantiene la single source of truth in src/config/models.ts
-- (MODEL_CATALOG, 8 modelli). Replichiamo qui:
--   * upsert dei 8 modelli con flag is_active=true e i corretti
--     credits_cost / openrouter_id / supports_vision
--   * NON tocchiamo gli altri modelli gia' attivi in AISCAN
--     (gemini-2.0-flash-lite, deepseek-v3.2) perche' usati dal tier
--     "cheap" dell'AI analysis Adv Performance e non vogliamo
--     rompere quel flusso.
--
-- Cambi netti rispetto a 0046:
--   + AGGIUNTO 'claude-sonnet-4' (mancava)
--   * Tutti gli altri 7 erano gia' presenti, l'upsert li forza
--     a is_active=true e timbra last_synced_at=now() per coerenza.
-- =====================================================================

insert into mait_ai_models (provider, model_id, display_name, credits_cost, is_active, openrouter_id, supports_vision, last_synced_at) values
  ('openai',    'gpt-4.1',           'GPT-4.1',           2, true, 'openai/gpt-4.1',              true, now()),
  ('openai',    'gpt-4.1-mini',      'GPT-4.1 Mini',      1, true, 'openai/gpt-4.1-mini',         true, now()),
  ('openai',    'gpt-4o',            'GPT-4o',            2, true, 'openai/gpt-4o',               true, now()),
  ('anthropic', 'claude-sonnet-4',   'Claude Sonnet 4',   2, true, 'anthropic/claude-sonnet-4',   true, now()),
  ('anthropic', 'claude-sonnet-4-5', 'Claude Sonnet 4.5', 3, true, 'anthropic/claude-sonnet-4.5', true, now()),
  ('anthropic', 'claude-haiku-4-5',  'Claude Haiku 4.5',  1, true, 'anthropic/claude-haiku-4.5',  true, now()),
  ('google',    'gemini-2.5-pro',    'Gemini 2.5 Pro',    2, true, 'google/gemini-2.5-pro',       true, now()),
  ('google',    'gemini-2.5-flash',  'Gemini 2.5 Flash',  1, true, 'google/gemini-2.5-flash',     true, now())
on conflict (model_id) do update set
  provider        = excluded.provider,
  display_name    = excluded.display_name,
  credits_cost    = excluded.credits_cost,
  is_active       = true,
  openrouter_id   = excluded.openrouter_id,
  supports_vision = excluded.supports_vision,
  last_synced_at  = now(),
  -- Stamp reviewed_at cosi non finisce nella coda "Da revisionare"
  -- per il modello nuovo (Claude Sonnet 4).
  reviewed_at     = coalesce(mait_ai_models.reviewed_at, now());
