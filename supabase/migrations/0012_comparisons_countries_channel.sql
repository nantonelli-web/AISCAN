-- =====================================================================
-- MAIT — Persist UI selection for saved comparisons
-- Stores the countries and channel picked at scan time so that reopening
-- a saved comparison pre-fills the selector state (not just the brands).
-- =====================================================================

alter table mait_comparisons
  add column if not exists countries text[] not null default '{}',
  add column if not exists channel   text;
