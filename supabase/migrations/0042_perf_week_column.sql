-- =====================================================================
-- AISCAN — Adv Performance: column "week" per supporto confronti
-- week-vs-week reali (2026-05-08).
--
-- I file Meta esportati con granularita' settimanale hanno la colonna
-- "Week" (es. "week 14"). La salviamo per filtrare velocemente le
-- righe per settimana, evitando di parsare il raw_data ad ogni query.
-- =====================================================================

alter table mait_perf_meta_rows
  add column if not exists week text;

create index if not exists idx_perf_meta_rows_week
  on mait_perf_meta_rows(import_id, week)
  where week is not null;
