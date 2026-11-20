-- 0169 — a Day log entry is private until its owner marks it shared, and a
-- shared entry is read through its own door.
--
-- Sharing is granted per group of things ("journal.daylog", view). For the
-- Day log that was all or nothing: giving someone a view of yours showed
-- them every day you have ever written. The brief asks for the opposite
-- (master run §7): a person you share with sees ONLY the entries you mark
-- shared.
--
-- Two parts.
--
-- 1. A day in SOMEONE ELSE'S personal space is never readable through the
--    Day log's tables, whatever grant exists. One restrictive rule on each
--    table says so (restrictive rules are ANDed with every permissive one,
--    so no grant, present or future, can widen it).
--
--    Why "never", and not "when it is marked shared": the Day log's own
--    code asks "the day for this date" and expects one answer. If a shared
--    day of his were readable through the tables, on that date she would
--    have two, and her own Day log (the page, the lists, the scores, the
--    nightly tidy-up) would mix his days into hers.
--
-- 2. The days he marks shared are offered through one function,
--    daylog_shared_with_me(): the day, his words for it and its scenes, to
--    anyone he has given a view of his Day log. Nothing else: not the
--    transcript, not the extracted facts, not the scores, not the cost.
--
-- Not affected:
--   - your own days (your personal space): all of them, as before;
--   - a team's space (the family timeline): everything there is shared by
--     being there;
--   - the separate "a linked person sees the scenes they are in" rule: it
--     reaches rows in spaces the reader has NOT been granted, and the rule
--     here constrains only the granted path.
--
-- No one could read anyone else's Day log before this: no grant on
-- journal.daylog exists on production.
--
-- Depends on: 0160 (app.personal_space, app.accessible_spaces, app.session_ok).

alter table public.daylog_days
	add column if not exists shared boolean not null default false;

comment on column public.daylog_days.shared is
	'The owner has marked this day for the people they share their Day log with. Read through daylog_shared_with_me(), never through the table.';

-- Is this day in a space where the tables may be read by the caller at all: their own, or a team's?
create or replace function app.daylog_day_open(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.daylog_days d
		where d.id = p_day
		  and (
			d.space_id = app.personal_space()
			-- not anybody's personal space: a team's
			or not exists (select 1 from public.profiles p where p.personal_space_id = d.space_id)
		  )
	)
$$;

create or replace function app.daylog_scene_open(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.daylog_scenes s where s.id = p_scene and app.daylog_day_open(s.day_id))
$$;

revoke all on function app.daylog_day_open(uuid) from public, anon;
revoke all on function app.daylog_scene_open(uuid) from public, anon;
grant execute on function app.daylog_day_open(uuid) to authenticated, service_role;
grant execute on function app.daylog_scene_open(uuid) to authenticated, service_role;

drop policy if exists daylog_days_shared_only on public.daylog_days;
drop policy if exists daylog_days_own_or_team on public.daylog_days;
create policy daylog_days_own_or_team on public.daylog_days
	as restrictive for all to authenticated
	using (
		space_id = app.personal_space()
		or not exists (select 1 from public.profiles p where p.personal_space_id = daylog_days.space_id)
	)
	with check (
		space_id = app.personal_space()
		or not exists (select 1 from public.profiles p where p.personal_space_id = daylog_days.space_id)
	);

-- The children: a row in a space the reader has been GRANTED must belong to an open day. A row outside every
-- granted space can only be reached by the linked-person rule, which is left as it is.
drop policy if exists daylog_scenes_shared_only on public.daylog_scenes;
drop policy if exists daylog_scenes_own_or_team on public.daylog_scenes;
create policy daylog_scenes_own_or_team on public.daylog_scenes
	as restrictive for select to authenticated
	using (
		app.daylog_day_open(day_id)
		or space_id not in (select app.accessible_spaces('journal.daylog', 'view'))
	);

drop policy if exists daylog_facts_shared_only on public.daylog_facts;
drop policy if exists daylog_facts_own_or_team on public.daylog_facts;
create policy daylog_facts_own_or_team on public.daylog_facts
	as restrictive for select to authenticated
	using (
		app.daylog_day_open(day_id)
		or space_id not in (select app.accessible_spaces('journal.daylog', 'view'))
	);

drop policy if exists daylog_media_shared_only on public.daylog_media;
drop policy if exists daylog_media_own_or_team on public.daylog_media;
create policy daylog_media_own_or_team on public.daylog_media
	as restrictive for select to authenticated
	using (
		app.daylog_day_open(day_id)
		or space_id not in (select app.accessible_spaces('journal.daylog', 'view'))
	);

drop policy if exists daylog_scene_people_shared_only on public.daylog_scene_people;
drop policy if exists daylog_scene_people_own_or_team on public.daylog_scene_people;
create policy daylog_scene_people_own_or_team on public.daylog_scene_people
	as restrictive for select to authenticated
	using (
		app.daylog_scene_open(scene_id)
		or space_id not in (select app.accessible_spaces('journal.daylog', 'view'))
	);

-- The door for shared days. The grant is checked exactly as app.accessible_spaces() checks one.
create or replace function public.daylog_shared_with_me(p_from date default null, p_to date default null)
returns table (id uuid, day date, owner_id uuid, owner_name text, summary text, scenes jsonb)
language sql
stable
security definer
set search_path = ''
as $$
	select
		d.id,
		d.day,
		owner.id,
		coalesce(nullif(btrim(owner.display_name), ''), 'Someone'),
		d.summary,
		coalesce((
			select jsonb_agg(
				jsonb_build_object('position', s.position, 'title', s.title, 'time_hint', s.time_hint, 'narrative', s.narrative)
				order by s.position
			)
			from public.daylog_scenes s
			where s.day_id = d.id and not s.hidden_from_linked
		), '[]'::jsonb)
	from public.daylog_days d
	join public.profiles owner on owner.personal_space_id = d.space_id
	join public.profiles me on me.id = auth.uid()
	where d.shared
	  and d.status = 'closed'
	  and app.session_ok()
	  and me.disabled_at is null
	  and owner.disabled_at is null
	  and owner.id <> me.id
	  and exists (
		select 1 from public.user_grants ug
		where ug.grantor_id = owner.id
		  and ug.grantee_id = me.id
		  and ug.section = 'journal'
		  and (cardinality(ug.entity_groups) = 0 or 'daylog' = any (ug.entity_groups))
		  and 'view' = any (ug.verbs)
		  and ug.revoked_at is null
		  and (ug.expires_at is null or ug.expires_at > now())
	  )
	  and (p_from is null or d.day >= p_from)
	  and (p_to is null or d.day <= p_to)
	order by d.day desc
	limit 200
$$;

revoke all on function public.daylog_shared_with_me(date, date) from public, anon;
grant execute on function public.daylog_shared_with_me(date, date) to authenticated, service_role;
