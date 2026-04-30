-- =====================================================================
-- 0033 — Prevent concurrent running scans on the same competitor
--
-- The /api/apify/scan{,-google,-instagram,-tiktok,-youtube,-snapchat}
-- routes all do a `checkScanConcurrency` lookup BEFORE inserting the
-- new job row. The two operations are not atomic, so a racy double
-- click that lands within the same few milliseconds can have BOTH
-- requests pass the lookup (each sees zero running) and then INSERT
-- two `running` rows for the same competitor. The user observes a
-- "queued" second scan that starts as soon as the first stops.
--
-- A partial unique index on (competitor_id) WHERE status = 'running'
-- closes the race at the database layer. The cleanup logic in each
-- scan route still flips stale running rows to `failed` (>10 min)
-- before the rate check, so a genuinely-orphan job does not lock the
-- brand out forever — once flipped, the new INSERT succeeds.
--
-- Stale data check: in extremely rare cases an existing row could
-- already violate the constraint (two simultaneous running rows). The
-- "where not exists" clause forces those down to failed first so the
-- index creation does not error on apply.

-- Heal any existing duplicates: keep the most-recently-started
-- `running` row per competitor, mark older ones as failed so the
-- partial unique index can be created without violation. id is a
-- uuid here so we use started_at as the recency signal.
with latest_running as (
  select distinct on (competitor_id) id
    from mait_scrape_jobs
   where status = 'running'
   order by competitor_id, started_at desc nulls last
)
update mait_scrape_jobs j
   set status = 'failed',
       completed_at = now(),
       error = coalesce(j.error, 'Auto-healed: duplicate running row collapsed by 0033')
 where j.status = 'running'
   and j.id not in (select id from latest_running);

create unique index if not exists idx_mait_scrape_jobs_one_running_per_competitor
  on mait_scrape_jobs (competitor_id)
  where status = 'running';
