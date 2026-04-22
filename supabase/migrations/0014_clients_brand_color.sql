-- =====================================================================
-- MAIT — Update brand accent colour from gold to royal blue
-- Changes the mait_clients.color default and backfills rows that still
-- carry the old default value. Custom colours picked by the user are
-- untouched.
-- =====================================================================

alter table mait_clients alter column color set default '#2667ff';

update mait_clients
set color = '#2667ff'
where color = '#d4a843';
