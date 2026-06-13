-- Scalability aggregate RPCs (audit 2026-05-31). Replace two
-- "fetch ALL rows into Node and reduce in JS" patterns with SQL GROUP BY,
-- so the dashboard and the maps list transfer a handful of rows instead
-- of up to hundreds of thousands.
--
-- SECURITY DEFINER + explicit workspace_id arg: callers pass the resolved
-- workspace id (server already does the auth/ownership check), the
-- function only ever aggregates within that workspace.

-- Dashboard "top competitors by active ads": was paging up to 100k ACTIVE
-- ad rows on every landing-page load just to count by competitor.
create or replace function public.mait_top_competitors_active(
  p_workspace_id uuid,
  p_limit integer default 5
) returns table (competitor_id uuid, active_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select competitor_id, count(*) as active_count
  from mait_ads_external
  where workspace_id = p_workspace_id
    and status = 'ACTIVE'
    and competitor_id is not null
  group by competitor_id
  order by active_count desc
  limit greatest(p_limit, 1);
$$;

grant execute on function public.mait_top_competitors_active(uuid, integer)
  to authenticated, service_role;

-- Maps list per-search place + review counts: was streaming every place
-- AND every review row in the workspace to render small "N places / N
-- reviews" badges. mait_maps_reviews.place_id references the internal
-- mait_maps_places.id.
create or replace function public.mait_maps_search_counts(
  p_workspace_id uuid
) returns table (search_id uuid, place_count bigint, review_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.id as search_id,
         count(distinct p.id) as place_count,
         count(r.id) as review_count
  from mait_maps_searches s
  left join mait_maps_places p on p.search_id = s.id
  left join mait_maps_reviews r on r.place_id = p.id
  where s.workspace_id = p_workspace_id
  group by s.id;
$$;

grant execute on function public.mait_maps_search_counts(uuid)
  to authenticated, service_role;
