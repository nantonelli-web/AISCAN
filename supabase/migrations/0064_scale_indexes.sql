-- Scalability indexes (audit 2026-05-31). Composite indexes for the hot
-- query paths that currently force in-memory sorts / unindexed scans as
-- ads/jobs grow. Indexes only — no new tables, so no grant/RLS block
-- needed (indexes inherit the table's grants).
--
-- Tables are still small, so a plain CREATE INDEX builds instantly. If
-- re-running against a large table later, switch to CREATE INDEX
-- CONCURRENTLY (one statement at a time, outside a transaction) to avoid
-- locking writes.

-- ── mait_ads_external ──────────────────────────────────────────────
-- Library default view: filter workspace_id, ORDER BY created_at DESC.
create index if not exists idx_ads_ext_ws_created
  on mait_ads_external (workspace_id, created_at desc);
-- Unfiltered Library "Meta-first" sort: workspace_id, source, created_at.
create index if not exists idx_ads_ext_ws_source_created
  on mait_ads_external (workspace_id, source, created_at desc);
-- Brand-detail channel-chip counts: competitor_id + source [+ status].
create index if not exists idx_ads_ext_competitor_source_status
  on mait_ads_external (competitor_id, source, status);
-- Digest "new since" counts: competitor_id + created_at.
create index if not exists idx_ads_ext_competitor_created
  on mait_ads_external (competitor_id, created_at);

-- ── mait_scrape_jobs ───────────────────────────────────────────────
-- Daily cost cap: sum cost_cu where workspace_id + started_at > since.
create index if not exists idx_scrape_jobs_ws_started
  on mait_scrape_jobs (workspace_id, started_at desc);
-- Concurrency gate: count where workspace_id + status='running'.
create index if not exists idx_scrape_jobs_ws_status
  on mait_scrape_jobs (workspace_id, status);
-- Cooldown / running-by-source checks.
create index if not exists idx_scrape_jobs_ws_source_status
  on mait_scrape_jobs (workspace_id, source, status);

-- ── mait_comparisons ───────────────────────────────────────────────
-- Brand-detail "comparisons containing this brand": contains(competitor_ids,[id]).
create index if not exists idx_comparisons_competitor_ids
  on mait_comparisons using gin (competitor_ids);
