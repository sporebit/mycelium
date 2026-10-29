-- 0154 — Gousto facets: cuisine and category counts in one call.
--
-- The cookbook page offered a cuisine filter computed in the route by
-- pulling every row's cuisine (12k small rows per list call). Categories
-- (text[] per recipe, filled as the PC sync pulls details) need the same
-- and would be worse to count in JS. One function does both server-side.
-- Security invoker: RLS on gousto_recipes scopes it to the caller's space.

create index if not exists gousto_recipes_categories_gin_idx
	on public.gousto_recipes using gin (categories);

create or replace function public.gousto_facets()
returns table (kind text, name text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
	select 'cuisine'::text as kind, r.cuisine as name, count(*)::bigint
	from public.gousto_recipes r
	where r.cuisine is not null and r.cuisine <> ''
	group by r.cuisine
	union all
	select 'category'::text, c.name, count(*)::bigint
	from public.gousto_recipes r
	cross join lateral unnest(coalesce(r.categories, '{}'::text[])) as c(name)
	where c.name <> ''
	group by c.name
	order by 1, 3 desc, 2;
$$;

grant execute on function public.gousto_facets() to authenticated, service_role;
