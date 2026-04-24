-- scan_countries: the ISO-2 country codes passed to Apify when the ad
-- was scraped. One row per ad_archive_id; the array grows to the union
-- when the same ad surfaces in multiple country-specific scans.
--
-- A NULL array means "unknown" (legacy data scanned with country=ALL,
-- or data ingested before this column existed). Benchmark filters treat
-- NULL as "excluded from country filters".
--
-- GIN index supports fast containment queries: `scan_countries && $1`.

ALTER TABLE mait_ads_external
  ADD COLUMN IF NOT EXISTS scan_countries text[];

CREATE INDEX IF NOT EXISTS idx_ads_ext_scan_countries
  ON mait_ads_external USING GIN (scan_countries);
