-- Cache busting field for mait_comparisons.
--
-- Each time the math behind technical_data changes (e.g. when we add
-- a country filter to computeTechnicalStats) every cached row that
-- predates the change is silently wrong. The cache key
-- (workspace, competitor_ids, locale) does not capture the
-- "computation version", so the GET handler returns stale numbers.
--
-- data_version is the schema-of-the-stored-payload version.
-- Backend POSTs always write the current value defined in
-- /api/comparisons/route.ts (CURRENT_DATA_VERSION). The client treats
-- any row with a lower value as a cache miss and forces a regenerate.

alter table mait_comparisons
  add column if not exists data_version int not null default 0;
