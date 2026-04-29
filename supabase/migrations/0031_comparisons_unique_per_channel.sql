-- =====================================================================
-- AISCAN — Compare cache key now includes channel
--
-- Problem: mait_comparisons had unique key on
--   (workspace_id, competitor_ids, locale)
-- which forced ONE cache row per brand-set. When a user toggled
-- channel from Meta to Google for the same brands, the POST handler
-- overwrote the row in place, and the GET handler returned that row
-- regardless of which channel the caller actually wanted. The
-- Compare UI then rendered Meta numbers under Google labels (and
-- vice versa) — verified on Sezane / Ulla Popken / Marina Rinaldi
-- 2026-04-29 where the platforms field showed
-- "instagram, facebook, threads" on a Google-channel page.
--
-- Fix: include `channel` in the unique constraint so each channel
-- gets its own row. NULL is treated as a distinct value by Postgres
-- in unique indexes, so legacy rows (channel NULL) stay valid until
-- the next POST replaces them with a non-NULL value.
-- =====================================================================

drop index if exists idx_mait_comparisons_key;

create unique index if not exists idx_mait_comparisons_key
  on mait_comparisons(workspace_id, competitor_ids, locale, channel);
