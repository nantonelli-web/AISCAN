-- =====================================================================
-- AISCAN — Scrape jobs source column
-- The brand list at /competitors shows "last scan: <date>" but did not
-- say WHICH channel the user scanned (Meta / Google / Instagram /
-- TikTok / Snapchat / YouTube). Adding `source` to mait_scrape_jobs
-- so each scan endpoint can stamp the channel it ran for. Historical
-- rows (before this migration) keep `source = NULL` and the UI shows
-- the date alone — no fake fallback.
-- =====================================================================

alter table mait_scrape_jobs add column if not exists source text;

-- Composite index for the brand list "latest scan per competitor"
-- query — `order by started_at desc` filtered by `competitor_id`
-- needs both columns to avoid a sort scan when the workspace has
-- thousands of jobs.
create index if not exists idx_mait_scrape_jobs_competitor_started
  on mait_scrape_jobs(competitor_id, started_at desc);
