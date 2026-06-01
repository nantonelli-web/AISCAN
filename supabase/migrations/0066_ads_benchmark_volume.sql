-- Benchmark "volume pass" aggregate. Replaces paging up to 500k ad rows
-- into Node (computeBenchmarks.fetchAllVolumeRows) with a SQL GROUP BY:
-- returns the per-competitor aggregates the benchmark page needs.
--
-- Date boundaries are passed in as timestamptz PARAMETERS (computed in JS
-- exactly as today — end-of-day for dateTo, 90d default for the refresh
-- window) so the SQL only does exact timestamptz comparisons and can't
-- diverge from the JS date math. The per-row Google region-date
-- intersection (raw_data.regionStats) is NOT handled here — the caller
-- keeps the existing row-based path for the source=google + country
-- filter case.
create or replace function public.mait_ads_benchmark_volume(
  p_workspace_id uuid,
  p_source text default null,            -- 'meta' | 'google' | null
  p_competitor_ids uuid[] default null,  -- null = all
  p_countries text[] default null,       -- null = no country filter (overlap)
  p_status text default null,            -- 'active' | 'inactive' | null
  p_overlap_from timestamptz default null,  -- volume window lower bound (fromMs)
  p_overlap_to timestamptz default null,    -- volume window upper bound (toMs, end-of-day)
  p_refresh_from timestamptz default null,  -- refresh-rate window lower bound
  p_refresh_to timestamptz default null     -- refresh-rate window upper bound
) returns table (
  competitor_id uuid,
  earliest_start timestamptz,
  total bigint,
  with_start_date bigint,
  recent bigint,
  active_in_range bigint,
  inactive_in_range bigint,
  source_breakdown jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select e.competitor_id, e.status, e.source, e.start_date, e.end_date
    from mait_ads_external e
    where e.workspace_id = p_workspace_id
      and (p_source is null or e.source = p_source)
      and (p_competitor_ids is null or e.competitor_id = any (p_competitor_ids))
      and (p_countries is null or e.scan_countries && p_countries)
      and (
        p_status is null
        or (p_status = 'active' and e.status = 'ACTIVE')
        or (p_status = 'inactive' and e.status <> 'ACTIVE')
      )
  ),
  agg as (
    select
      competitor_id,
      min(start_date) as earliest_start,
      count(*) as total,
      count(*) filter (where start_date is not null) as with_start_date,
      -- refresh-rate window: start_date within [refresh_from, refresh_to]
      count(*) filter (
        where start_date is not null
          and (p_refresh_from is null or start_date >= p_refresh_from)
          and (p_refresh_to is null or start_date <= p_refresh_to)
      ) as recent,
      -- volume window (date-overlap predicate), ACTIVE
      count(*) filter (
        where start_date is not null
          and status = 'ACTIVE'
          and (p_overlap_to is null or start_date <= p_overlap_to)
          and (
            p_overlap_from is null or status = 'ACTIVE'
            or end_date is null or end_date >= p_overlap_from
          )
      ) as active_in_range,
      -- volume window, non-ACTIVE. `is distinct from` so a NULL status
      -- counts as inactive (matches the JS `else` branch in volumeMap),
      -- unlike `<> 'ACTIVE'` which would drop NULLs.
      count(*) filter (
        where start_date is not null
          and status is distinct from 'ACTIVE'
          and (p_overlap_to is null or start_date <= p_overlap_to)
          and (
            p_overlap_from is null
            or end_date is null or end_date >= p_overlap_from
          )
      ) as inactive_in_range
    from base
    group by competitor_id
  ),
  src as (
    select competitor_id, jsonb_object_agg(src, cnt) as source_breakdown
    from (
      select competitor_id, coalesce(source, '(null)') as src, count(*) as cnt
      from base
      group by competitor_id, coalesce(source, '(null)')
    ) t
    group by competitor_id
  )
  select
    a.competitor_id,
    a.earliest_start,
    a.total,
    a.with_start_date,
    a.recent,
    a.active_in_range,
    a.inactive_in_range,
    coalesce(s.source_breakdown, '{}'::jsonb)
  from agg a
  left join src s on s.competitor_id is not distinct from a.competitor_id;
$$;

grant execute on function public.mait_ads_benchmark_volume(
  uuid, text, uuid[], text[], text, timestamptz, timestamptz, timestamptz, timestamptz
) to authenticated, service_role;
