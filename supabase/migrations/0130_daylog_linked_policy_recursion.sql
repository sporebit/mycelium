-- 0130 — Day log: the linked-user select policies recursed.
--
-- 0127 wrote decision 30's read path as plain subqueries: the daylog_scenes
-- policy read daylog_scene_people, and the daylog_scene_people policy read
-- daylog_scenes (and itself). Policies on a table apply to subqueries inside
-- other policies too, so any statement touching either table — including the
-- owner's own inserts, which RETURNING re-reads — failed with
-- "infinite recursion detected in policy for relation daylog_scenes".
-- Part A never touched scenes, so it surfaced with Part B's first close.
--
-- Fix: one SECURITY DEFINER helper does the membership lookup with RLS out
-- of the way (the app.accessible_spaces pattern, 0110). The rule it encodes
-- is unchanged: a scene is visible to a viewer when it is not hidden and a
-- person in it is linked to that viewer. Still no policy on daylog_days or
-- daylog_facts — a linked user never sees a day row or a fact.

create or replace function app.daylog_scene_visible_to_linked(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.daylog_scenes s
		join public.daylog_scene_people sp on sp.scene_id = s.id
		join public.people p on p.id = sp.person_id
		where s.id = p_scene
			and not s.hidden_from_linked
			and p.linked_user_id = auth.uid()
	);
$$;

revoke all on function app.daylog_scene_visible_to_linked(uuid) from public;
grant execute on function app.daylog_scene_visible_to_linked(uuid) to authenticated, service_role;

drop policy if exists daylog_scenes_linked_select on public.daylog_scenes;
create policy daylog_scenes_linked_select on public.daylog_scenes for select to authenticated
using (app.daylog_scene_visible_to_linked(id));

drop policy if exists daylog_scene_people_linked_select on public.daylog_scene_people;
create policy daylog_scene_people_linked_select on public.daylog_scene_people for select to authenticated
using (app.daylog_scene_visible_to_linked(scene_id));

drop policy if exists daylog_media_linked_select on public.daylog_media;
create policy daylog_media_linked_select on public.daylog_media for select to authenticated
using (shareable and scene_id is not null and app.daylog_scene_visible_to_linked(scene_id));
