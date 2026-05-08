-- =====================================================================
-- AISCAN — Adv Performance follow-up (2026-05-08)
-- 1. creative_type / creative_count: due colonne custom che gli
--    utenti aggiungono ai loro export per tracciare la tipologia
--    asset (image / video / carousel) e il numero di creativita'
--    per ad set / campaign / ecc. Optional — null se l'export
--    non le ha.
-- 2. campaign_type_overrides: override manuali fatti dall'utente
--    sulla tipologia di campagna decodificata dal nome (es.
--    "UAE_2026_VC" → "VC" → "View Content"). JSONB nel header,
--    chiavi = campaign_name, valori = type code.
-- =====================================================================

alter table mait_perf_meta_rows
  add column if not exists creative_type text,
  add column if not exists creative_count integer;

alter table mait_perf_imports
  add column if not exists campaign_type_overrides jsonb not null default '{}'::jsonb;

create index if not exists idx_perf_meta_rows_creative_type
  on mait_perf_meta_rows(import_id, creative_type)
  where creative_type is not null;
