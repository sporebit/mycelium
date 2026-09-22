-- 0133 — Day log Part E: linked users (spec §3 decision 26, §5, §11 flag 3,
-- decision 30).
--
-- 1. Linking without consent is the risk (flag 3): only a user who already
--    shares a team with the linker can be linked, and the database enforces
--    it, not just the route.
-- 2. A linked viewer may read the scene rows they are in (0130's policies)
--    but never a daylog_days row — so the date, the owner's name and the
--    participants' names come through one SECURITY DEFINER function that
--    applies the very same visibility rule. Scene basics only: date, place,
--    names, the scene narrative, shareable photos. Never a fact, never the
--    transcript, never the summary.

-- 1. teammates -----------------------------------------------------------
create or replace function app.shares_team_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_user is not null and p_user <> auth.uid() and exists (
		select 1
		from public.team_members me
		join public.team_members them on them.team_id = me.team_id
		where me.user_id = auth.uid() and them.user_id = p_user
	);
$$;
revoke all on function app.shares_team_with(uuid) from public;
grant execute on function app.shares_team_with(uuid) to authenticated, service_role;

create or replace function app.people_check_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if new.linked_user_id is not null
		and (tg_op = 'INSERT' or new.linked_user_id is distinct from old.linked_user_id)
		and auth.uid() is not null
		and not app.shares_team_with(new.linked_user_id)
	then
		raise exception 'linked_user_id must share a team with you' using errcode = '42501';
	end if;
	if new.linked_user_id is null then
		new.linked_at := null;
	elsif tg_op = 'INSERT' or new.linked_user_id is distinct from old.linked_user_id then
		new.linked_at := now();
	end if;
	return new;
end;
$$;
drop trigger if exists people_check_link on public.people;
create trigger people_check_link
	before insert or update of linked_user_id on public.people
	for each row execute function app.people_check_link();

-- 2. the viewer's read path -------------------------------------------------
create or replace function public.daylog_shared_scenes(p_from date, p_to date)
returns table (
	scene_id      uuid,
	day           date,
	scene_position int,
	title         text,
	place_text    text,
	place_name    text,
	narrative     text,
	owner_name    text,
	participants  text[],
	photos        jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		s.id,
		d.day,
		s.position,
		s.title,
		s.place_text,
		pl.name,
		s.narrative,
		coalesce(pr.display_name, 'someone'),
		coalesce((
			select array_agg(coalesce(p.display_name, nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'someone') order by p.display_name)
			from public.daylog_scene_people sp
			join public.people p on p.id = sp.person_id
			where sp.scene_id = s.id
		), '{}'),
		coalesce((
			select jsonb_agg(jsonb_build_object('id', m.id, 'storage_path', m.storage_path, 'caption', m.caption) order by m.taken_at)
			from public.daylog_media m
			where m.scene_id = s.id and m.shareable
		), '[]'::jsonb)
	from public.daylog_scenes s
	join public.daylog_days d on d.id = s.day_id
	left join public.places pl on pl.id = s.place_id
	left join public.profiles pr on pr.id = d.created_by
	where d.day between p_from and p_to
		and d.created_by is distinct from auth.uid()
		and app.daylog_scene_visible_to_linked(s.id)
	order by d.day desc, s.position;
$$;
revoke all on function public.daylog_shared_scenes(date, date) from public;
grant execute on function public.daylog_shared_scenes(date, date) to authenticated, service_role;
