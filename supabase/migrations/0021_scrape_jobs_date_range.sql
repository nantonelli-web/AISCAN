-- Persist the user-requested scan window on each scrape job so the
-- brand list can show "Last scan: <date> · period <from> → <to>"
-- without having to re-derive the range from the ads themselves.
--
-- Both columns default NULL — full-archive scans (cron + manual scan
-- without a window) have no range to show.

alter table mait_scrape_jobs
  add column if not exists date_from text,
  add column if not exists date_to   text;
