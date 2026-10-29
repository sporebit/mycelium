-- 0152: the slug is the Gousto recipe's identity, not the uid.
--
-- The listing carries the same recipe page under two gousto_uids when Gousto
-- re-issues it (same url/slug, ratings carried on the newer uid; ~0.7% of
-- entries). The ingest upserts on (space_id, slug) and keeps the most-rated
-- entry per slug, so the uid index is a plain one.
drop index if exists public.gousto_recipes_space_uid_idx;
create index if not exists gousto_recipes_space_uid_idx
	on public.gousto_recipes (space_id, gousto_uid);
