-- =====================================================================
-- AISCAN — Google Ads scan async via Apify webhook (2026-05-11)
-- Estensione di mait_scrape_jobs per supportare il completamento
-- event-driven: Apify chiama il nostro endpoint webhook quando il run
-- finisce (SUCCEEDED, ABORTED, TIMED-OUT, FAILED) e noi finalizziamo.
--
-- Modifiche:
-- 1) Aggiunto valore 'partial' all'enum mait_scrape_status — usato
--    quando il run viene abortito ma il dataset contiene comunque
--    items utili (es. Elena Mirò: silva95gustavo crawla 200 ads ma
--    timeout interrompe a 150 → status='partial', records_count=150).
-- 2) webhook_received_at: timestamp del primo webhook ricevuto per
--    questo job. Serve da marker di idempotenza: se gia' presente,
--    una seconda webhook (retry Apify) viene ignorata.
-- =====================================================================

alter type mait_scrape_status add value if not exists 'partial';

alter table mait_scrape_jobs
  add column if not exists webhook_received_at timestamptz,
  add column if not exists dataset_id text,
  add column if not exists scan_options jsonb,
  add column if not exists created_by uuid references mait_users(id) on delete set null;

create index if not exists idx_mait_scrape_jobs_apify_run_id
  on mait_scrape_jobs(apify_run_id)
  where apify_run_id is not null;
