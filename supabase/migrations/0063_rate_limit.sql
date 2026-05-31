-- Atomic fixed-window rate limiter, backed by a single counter row per
-- bucket key. Used to cap expensive paid actions per workspace (AI calls,
-- scans) so a single account can't drain the company's OpenRouter/Apify
-- budget by looping requests (security audit H6/H7).
--
-- The bucket key is an arbitrary string (e.g. "ai:<workspace_id>"), NOT
-- workspace-scoped data — the table is only ever touched by the
-- SECURITY DEFINER function below, called from the service-role admin
-- client. Hence: service_role grant + RLS enabled with no authenticated
-- policy (deny by default for end-users).

-- 1. Counter table
create table if not exists public.mait_rate_buckets (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- 2. Data API grants (Supabase 2026-10-30 default change). service_role
--    only — clients never read/write this table directly.
grant select, insert, update, delete on public.mait_rate_buckets to service_role;

-- 3. RLS on, no policy → authenticated/anon get nothing. The RPC below is
--    SECURITY DEFINER so it still works.
alter table public.mait_rate_buckets enable row level security;

-- 4. Atomic hit: increments the bucket and returns true if still within
--    the limit. The INSERT ... ON CONFLICT DO UPDATE locks the row, so
--    concurrent calls serialize on the PK — no TOCTOU. The window resets
--    when the stored window_start is older than p_window_seconds.
create or replace function public.mait_rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  insert into public.mait_rate_buckets as b (key, window_start, count)
    values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when b.window_start < v_now - make_interval(secs => p_window_seconds)
          then 1 else b.count + 1 end,
        window_start = case
          when b.window_start < v_now - make_interval(secs => p_window_seconds)
          then v_now else b.window_start end
  returning b.count into v_count;
  return v_count <= p_limit;
end;
$$;

grant execute on function public.mait_rate_limit_hit(text, integer, integer)
  to service_role, authenticated;
