-- 0121_area_kind.sql
-- Tickets / Tasks partition (Phil, 2026-09-17): one table, two surfaces.
-- Tickets = the technical projects being built; Tasks = personal life and
-- everything outside project work. The discriminator is the project's
-- AREA, not a per-ticket flag: technical-ness is a property of the project
-- and survives moving a ticket between projects.
--
--   areas.kind ∈ {technical, life}; two areas seeded per space
--   ("Technical", "Life"), idempotent, per the 0117 workflow-seed pattern.
--   projects.area_id is NOT guessed: a project with no area, or a life
--   area, resolves to Tasks, so nothing disappears on deploy. Phil assigns
--   projects to Technical in the UI.
--
-- `areas` was adopted + RLS-enabled in 0116 (app.adopt_table + policies);
-- a new column needs no new policy. Depends on: 0120.

alter table public.areas
	add column if not exists kind text not null default 'life'
	check (kind in ('technical', 'life'));

create index if not exists areas_kind_idx on public.areas (space_id, kind) where archived_at is null;

create or replace function public.tickets_seed_areas(p_space uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_owner uuid;
begin
	select owner_user_id into v_owner from public.spaces where id = p_space;
	if not exists (select 1 from public.areas where space_id = p_space and kind = 'technical' and archived_at is null) then
		insert into public.areas (space_id, created_by, name, kind, colour, sort_order)
		values (p_space, v_owner, 'Technical', 'technical', '#7aa2f7', 0);
	end if;
	if not exists (select 1 from public.areas where space_id = p_space and kind = 'life' and archived_at is null) then
		insert into public.areas (space_id, created_by, name, kind, colour, sort_order)
		values (p_space, v_owner, 'Life', 'life', '#9ece6a', 1);
	end if;
end
$$;
revoke all on function public.tickets_seed_areas(uuid) from public;

-- seed on space insert (alongside the 0117 workflow seed) and backfill
create or replace function public.spaces_seed_areas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.tickets_seed_areas(new.id);
	return new;
end
$$;
revoke all on function public.spaces_seed_areas() from public;

drop trigger if exists spaces_seed_areas on public.spaces;
create trigger spaces_seed_areas
	after insert on public.spaces
	for each row execute function public.spaces_seed_areas();

select public.tickets_seed_areas(s.id) from public.spaces s;
