-- 0068_job_refund_idempotency.sql
-- Idempotency claim for scan-credit refunds.
--
-- Problem: mait_add_credits (the refund RPC) is NOT idempotent — it just
-- adds. Multiple independent code paths can try to refund the SAME job's
-- credit (the per-brand route's catch, the abort checkpoint, the batch
-- reconcile/zombie-cleanup, the dispatch error path). Today only the
-- "mark failed WHERE status=running" ordering loosely prevents a double
-- refund; it is not airtight.
--
-- Fix: a single nullable timestamp that acts as a one-shot claim. The
-- refund helper (refundJobCreditOnce) atomically sets it WHERE it IS NULL
-- and only issues the refund if it won the claim. Any number of callers →
-- at most one refund. No FK/behaviour change for existing rows (NULL =
-- not yet refunded).

alter table public.mait_scrape_jobs
  add column if not exists credits_refunded_at timestamptz;

comment on column public.mait_scrape_jobs.credits_refunded_at is
  'One-shot claim for credit refund idempotency. Set atomically by '
  'refundJobCreditOnce(); when non-null the credit was already refunded '
  'and no further refund must be issued for this job.';
