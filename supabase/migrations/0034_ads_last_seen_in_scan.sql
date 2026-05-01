-- =====================================================================
-- 0034 — mait_ads_external.last_seen_in_scan_at
--
-- Track when WE last observed each ad in a scan, independently of
-- silva's `lastShown` (which reflects Google's catalog and can lag).
-- Useful on the ad-detail page as a transparency signal: "we last
-- saw this ad in our scans on [date]" — distinct from Google's own
-- "last shown".
--
-- Updated by every scan handler (scan / scan-google) on the upsert.
-- For now we do NOT change the active/inactive heuristic — the new
-- column is informational only. If we later want the stricter
-- option C ("active = last_seen_in_scan_at within 48h"), the field
-- is already in place.
--
-- Backfill: existing rows get the value from `created_at` (their
-- own first-time-into-DB timestamp). The default for new rows is
-- the same — so a row inserted by a scan that was written before
-- the API change ships still gets a sensible value.

alter table mait_ads_external
  add column if not exists last_seen_in_scan_at timestamptz;

update mait_ads_external
   set last_seen_in_scan_at = created_at
 where last_seen_in_scan_at is null;

alter table mait_ads_external
  alter column last_seen_in_scan_at set default now(),
  alter column last_seen_in_scan_at set not null;

create index if not exists idx_mait_ads_external_last_seen_in_scan
  on mait_ads_external (competitor_id, last_seen_in_scan_at desc);
