-- 0180: lane DC of the parallel run (MYC-186 family, MYC-185 partner).
--
-- 1. A household bill that adds itself (MYC-186). A cost marked monthly is
--    the source; when the month turns, the family tick writes that month's
--    row and points it back at the source with `recurs_from`. The unique
--    index below is what makes the tick idempotent: one row a month per
--    source, however many times and from however many members it runs.
--    A row the tick wrote carries recurs = 'none', so it is never itself a
--    source, and deleting the source stops the rhythm without touching the
--    months already written.
--
-- 2. A team's default project has a key (MYC-185). A team space was made
--    with no ticket_prefix, so its tickets were keyed TKT-n and its default
--    project answered to nothing. A team space now takes a prefix from the
--    team's name when it is inserted (initials of the name, or its first
--    four letters, made unique against every space and project prefix),
--    and the spaces already here are backfilled. Their TKT-n tickets are
--    rekeyed to the new prefix with the same number; the old key stays an
--    alias (0135), so every link still opens.
--
-- Depends on: 0171 (household_costs), 0135 (key_aliases, tickets_take_key).

-- ---------------------------------------------------------------------
-- 1. household_costs.recurs_from
-- ---------------------------------------------------------------------
alter table public.household_costs
	add column if not exists recurs_from uuid references public.household_costs (id) on delete set null;

-- one row a month per source: the tick's idempotency, enforced where it cannot be forgotten
create unique index if not exists household_costs_one_a_month
	on public.household_costs (recurs_from, (date_trunc('month', paid_on::timestamp)))
	where recurs_from is not null;

create index if not exists household_costs_by_source on public.household_costs (recurs_from) where recurs_from is not null;

-- as 0161 and 0168: whoever inserts is the author unless they say otherwise
alter table public.household_costs alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------
-- 2. A prefix for every team space
-- ---------------------------------------------------------------------

-- A short key from a team's name: the initials of up to four words
-- ("Whelan household" → WH), or the first four letters of a single word
-- ("Rundown" → RUND); letters and digits, starting with a letter; made
-- unique against every space prefix and every project prefix by a number
-- on the end when needed (WH, WH2, WH3 …).
create or replace function public.team_space_prefix(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_words text[];
	v_base  text := '';
	v_try   text;
	v_n     int := 1;
	w       text;
begin
	v_words := array_remove(regexp_split_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 _-]', '', 'g')), '[ _-]+'), '');
	if coalesce(array_length(v_words, 1), 0) >= 2 then
		foreach w in array v_words[1:4] loop
			v_base := v_base || left(w, 1);
		end loop;
	elsif coalesce(array_length(v_words, 1), 0) = 1 then
		v_base := left(v_words[1], 4);
	end if;
	v_base := regexp_replace(v_base, '^[0-9]+', '');
	if length(v_base) < 2 then
		v_base := 'TEAM';
	end if;
	v_try := v_base;
	loop
		exit when not exists (select 1 from public.spaces where upper(ticket_prefix) = v_try)
		     and not exists (select 1 from public.projects where upper(prefix) = v_try);
		v_n := v_n + 1;
		v_try := v_base || v_n;
	end loop;
	return v_try;
end
$$;
revoke all on function public.team_space_prefix(text) from public;

create or replace function public.spaces_team_prefix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_name text;
begin
	if new.kind = 'team' and new.ticket_prefix is null then
		select name into v_name from public.teams where id = new.team_id;
		new.ticket_prefix := public.team_space_prefix(coalesce(v_name, 'Team'));
	end if;
	return new;
end
$$;
revoke all on function public.spaces_team_prefix() from public;

drop trigger if exists spaces_00_team_prefix on public.spaces;
create trigger spaces_00_team_prefix
	before insert on public.spaces
	for each row execute function public.spaces_team_prefix();

-- Backfill: every team space without a prefix, oldest first, and its TKT-n tickets rekeyed with the number kept.
do $$
declare
	s        record;
	t        record;
	v_prefix text;
begin
	for s in
		select sp.id, coalesce(tm.name, 'Team') as name
		from public.spaces sp
		left join public.teams tm on tm.id = sp.team_id
		where sp.kind = 'team' and sp.ticket_prefix is null
		order by sp.created_at, sp.id
	loop
		v_prefix := public.team_space_prefix(s.name);
		update public.spaces set ticket_prefix = v_prefix where id = s.id;
		for t in select id, ticket_key from public.tickets where space_id = s.id and ticket_key like 'TKT-%' loop
			update public.tickets
			set key_aliases = array_append(array_remove(coalesce(key_aliases, '{}'), t.ticket_key), t.ticket_key),
			    ticket_key  = v_prefix || substr(t.ticket_key, 4)
			where id = t.id;
		end loop;
	end loop;
end
$$;
