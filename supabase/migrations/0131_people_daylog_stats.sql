-- 0131 — Day log Part C: per-person aggregates (daylog spec §3, decision 19).
--
-- A view, not stored: days together, first seen, last seen — over approved
-- daylog_scene_people joined to their day. security_invoker, so the caller's
-- own policies on the three tables apply. A linked user can read the scene
-- rows they appear in but never a daylog_days row, so the join gives them
-- nothing here. A day counts once however many scenes the person was in, and
-- Quick-mode days count (spec §10 decision 4: a scene is a scene).

create or replace view public.people_daylog_stats
	with (security_invoker = true)
	as
	select
		sp.person_id,
		count(distinct d.day)::int as days_together,
		min(d.day) as first_seen,
		max(d.day) as last_seen
	from public.daylog_scene_people sp
	join public.daylog_scenes s on s.id = sp.scene_id
	join public.daylog_days d on d.id = s.day_id
	group by sp.person_id;

grant select on public.people_daylog_stats to authenticated, service_role;
