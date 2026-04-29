-- =====================================================================
-- AISCAN — Backfill Google Ads "ACTIVE" status
--
-- The pre-existing google-ads-service.ts heuristic flagged an ad as
-- ACTIVE only when `raw_data.lastShown == today` (strict equality).
-- That over-collapsed the ACTIVE bucket: every time the Transparency
-- library was a day behind our scrape, all ads observed yesterday
-- were marked INACTIVE with end_date = lastShown — even though they
-- were almost certainly still running.
--
-- The heuristic is now relaxed to `lastShown >= today - 1 day`
-- (1-day polling tolerance) for new scrapes. This migration applies
-- the same rule one-shot to existing rows so the Volume / Active
-- counts on Confronto + Benchmark immediately reflect reality
-- without a re-scan (re-scans cost credits).
--
-- Scope: ONLY rows from Google Ads (identified by
-- raw_data ? 'creativeId', a Google-Transparency-only field).
--
-- Reference for the "scrape day": `created_at::date`. Apify rows are
-- inserted within seconds of the scrape, so this is a tight proxy.
-- An ad whose lastShown is at most 1 day older than created_at::date
-- is flipped to ACTIVE + end_date NULL. Older lastShown values are
-- left as-is (real ends).
-- =====================================================================

update mait_ads_external
set
  status = 'ACTIVE',
  end_date = null
where
  raw_data ? 'creativeId'
  and status = 'INACTIVE'
  and raw_data->>'lastShown' is not null
  and (raw_data->>'lastShown')::date >= (created_at at time zone 'UTC')::date - interval '1 day';
