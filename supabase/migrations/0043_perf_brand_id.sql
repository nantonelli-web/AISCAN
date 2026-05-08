-- =====================================================================
-- AISCAN — Adv Performance: brand_id su mait_perf_imports (2026-05-08).
-- Le performance non sono piu' associate al solo client (es. NIMA),
-- ma a uno specifico brand monitorato sotto quel client (i.e.
-- mait_competitors). Permette di confrontare le performance per
-- ognuno dei brand del cliente invece di accumulare tutto sotto il
-- contenitore.
-- Nullable per backward compat con import gia' caricati senza brand.
-- =====================================================================

alter table mait_perf_imports
  add column if not exists brand_id uuid references mait_competitors(id) on delete cascade;

create index if not exists idx_perf_imports_brand
  on mait_perf_imports(brand_id, period_from desc)
  where brand_id is not null;
