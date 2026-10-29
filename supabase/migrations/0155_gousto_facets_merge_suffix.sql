-- 0155 — Gousto categories come in pairs ("Chicken" and "Chicken Recipes",
-- the second being the category page's name). The facet merges them by
-- stripping the suffix; the route filters with an overlap on both forms;
-- details synced from now on are stored without the suffix (toDetail).
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
	select 'category'::text, n.name, count(distinct r.id)::bigint
	from public.gousto_recipes r
	cross join lateral unnest(coalesce(r.categories, '{}'::text[])) as c(raw)
	cross join lateral (select regexp_replace(c.raw, '\s+Recipes$', '', 'i') as name) n
	where n.name <> ''
	group by n.name
	order by 1, 3 desc, 2;
$$;
