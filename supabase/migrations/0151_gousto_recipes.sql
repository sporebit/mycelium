-- 0151 — the Gousto cookbook, stored (health.nutrition).
--
-- Gousto's site reads its cookbook from an unauthenticated JSON API:
--   GET https://production-api.gousto.co.uk/cmsreadbroker/v1/recipes?limit=200&offset=0
--   GET https://production-api.gousto.co.uk/cmsreadbroker/v1/recipe/<slug>
-- The listing (~12,200 recipes) is small enough to hold whole; the detail
-- (ingredients, steps, nutrition, allergens) is fetched on first open and
-- cached here, so the table never has to carry 12,000 detail payloads.
--
-- One row per Gousto recipe per space. `is_favourite` is the heart;
-- `saved_recipe_id` points at the copy made into `recipes` (the app's own
-- table, so the meal planner and shopping lists work on it) when Phil saves
-- one. Unofficial API: nothing here is guaranteed by Gousto.

create table if not exists public.gousto_recipes (
	id                uuid primary key default gen_random_uuid(),
	gousto_uid        text not null,
	slug              text not null,
	title             text not null,
	url               text not null,
	image_url         text,
	image_large_url   text,
	rating_avg        numeric(3,2),
	rating_count      integer,
	prep_for_2        integer,
	prep_for_4        integer,
	cuisine           text,
	description       text,
	categories        text[] not null default '{}',
	detail            jsonb,
	detail_fetched_at timestamptz,
	is_favourite      boolean not null default false,
	favourited_at     timestamptz,
	saved_recipe_id   uuid references public.recipes(id) on delete set null,
	first_seen_at     timestamptz not null default now(),
	last_seen_at      timestamptz not null default now(),
	updated_at        timestamptz not null default now()
);

select app.register_table('gousto_recipes', 'health', 'nutrition');

create unique index if not exists gousto_recipes_space_uid_idx
	on public.gousto_recipes (space_id, gousto_uid);
create unique index if not exists gousto_recipes_space_slug_idx
	on public.gousto_recipes (space_id, slug);
create index if not exists gousto_recipes_favourites_idx
	on public.gousto_recipes (space_id, favourited_at desc)
	where is_favourite;
create index if not exists gousto_recipes_cuisine_idx
	on public.gousto_recipes (space_id, cuisine);
create index if not exists gousto_recipes_rating_idx
	on public.gousto_recipes (space_id, rating_count desc);
-- No pg_trgm on the hosted project (0126, 0127): title search is an ilike
-- over ~12k rows, which is fine without an index.

comment on table public.gousto_recipes is
	'The Gousto cookbook index per space (0151): listing fields for every recipe, detail cached on first open, favourite flag, link to the saved copy in recipes.';
