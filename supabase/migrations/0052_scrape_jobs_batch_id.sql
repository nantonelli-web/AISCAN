-- =====================================================================
-- AISCAN — Batch scan support (2026-05-11)
-- Aggiungiamo a mait_scrape_jobs un batch_id (uuid generato server-side
-- quando l'utente lancia uno scan multi-brand) cosi possiamo:
-- 1. Aggregare jobs per batch nel monitor UI ("12 brand scansionati,
--    10 success / 2 partial")
-- 2. Audit-trail: sapere quali job appartengono a una stessa azione
--    utente
-- 3. Calcolare cost totale di una batch operation
--
-- Non creiamo una tabella mait_scan_batches separata: per V1 basta
-- l'UUID di raggruppamento sulla row del job. Se in futuro servira'
-- uno status di batch globale (es. "completed when all jobs are
-- terminal") estrarremo la tabella allora.
-- =====================================================================

alter table mait_scrape_jobs
  add column if not exists batch_id uuid;

create index if not exists idx_mait_scrape_jobs_batch
  on mait_scrape_jobs(batch_id)
  where batch_id is not null;
