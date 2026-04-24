-- One-shot cleanup to align existing Meta ads with the new
-- scan_countries model.
--
-- 1. Mono-country ads: backfill scan_countries from the country query
--    param embedded in raw_data.inputUrl (e.g. `country=IT` → `['IT']`).
-- 2. ALL-country ads: delete. We cannot assign a country to them — they
--    came from scans that asked Meta for every country at once — so they
--    must be re-scanned once the per-country scan flow ships.
--
-- Google ads are left untouched; scan_countries stays NULL for them.

-- 1) Backfill mono-country Meta ads
UPDATE mait_ads_external
SET scan_countries = ARRAY[
  upper((regexp_match(raw_data->>'inputUrl', 'country=([A-Za-z]{2,3})'))[1])
]
WHERE source = 'meta'
  AND scan_countries IS NULL
  AND raw_data ? 'inputUrl'
  AND raw_data->>'inputUrl' ~ 'country=[A-Za-z]{2,3}(?![A-Za-z])'
  AND raw_data->>'inputUrl' !~ 'country=ALL(?![A-Za-z])';

-- 2) Purge the ALL-country Meta ads (they will be re-scraped per country)
DELETE FROM mait_ads_external
WHERE source = 'meta'
  AND (raw_data->>'inputUrl') ~ 'country=ALL(?![A-Za-z])';
