-- 0167 — a link to a person stays inside the person's own space.
--
-- Many rows can point at a person: a quote's speaker, who a ticket is
-- waiting on, who was in a Day log scene, who shares a receipt line. The
-- app checked in some places that the person was the caller's own; the
-- database checked nowhere (found by the test pass, 2026-11-20). Worse,
-- every such link runs people_promote_on_link(), which is SECURITY DEFINER
-- and promoted whatever person id it was given: a row in one space naming
-- a person in another changed that other person's record.
--
-- That trigger already fires on every table with a foreign key to people
-- (0140 wires it by reading the catalogue, so new tables are covered when
-- they are added). It is the one place every link passes, so the rule goes
-- there: the row and the person must be in the same space. A link across
-- spaces is refused, and nothing in the other space is read or changed.
--
-- Existing rows are not re-checked; the rule applies to a link being made
-- or changed from now on.
--
-- Depends on: 0140.

create or replace function public.people_promote_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
	v_row_space uuid;
	v_person_space uuid;
begin
	v_id := (to_jsonb(new) ->> tg_argv[0])::uuid;
	if v_id is null then
		return new;
	end if;
	v_row_space := (to_jsonb(new) ->> 'space_id')::uuid;
	select p.space_id into v_person_space from public.people p where p.id = v_id;
	-- A table with no space of its own (none today) is left to its own rules.
	if v_row_space is not null and v_person_space is not null and v_person_space <> v_row_space then
		raise exception 'That person is not in this space.'
			using errcode = '23514', hint = 'person_other_space';
	end if;
	update public.people set tier = 'person', promoted_at = now(), updated_at = now()
	where id = v_id and tier = 'contact';
	return new;
end
$$;

revoke all on function public.people_promote_on_link() from public;
