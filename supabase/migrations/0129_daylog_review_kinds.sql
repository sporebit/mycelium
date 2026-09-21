-- 0129 — Day log Part B: the review queue learns the day-log kinds.
--
-- pending_entities (0034) only allowed person / project / workout / food.
-- The day log queues four more at close (daylog spec §4.4 step 3): a known
-- person to link to scenes, a new person, a fact, and a place. Rows carry
-- no capture_id; additional_data holds {day_id, day, key, ...} and `key` is
-- what makes a re-extract idempotent. Quotes do not come through here — they
-- enter the Quotes pipeline as an ordinary quote capture.
--
-- No new tables: daylog_scenes / daylog_scene_people / daylog_facts shipped
-- in 0127 and are written on approval.

do $$
declare
	c record;
begin
	for c in
		select conname
		from pg_constraint
		where conrelid = 'public.pending_entities'::regclass
			and contype = 'c'
			and pg_get_constraintdef(oid) ilike '%entity_type%'
	loop
		execute format('alter table public.pending_entities drop constraint %I', c.conname);
	end loop;
end $$;

alter table public.pending_entities
	add constraint pending_entities_entity_type_check
	check (entity_type in (
		'person', 'project', 'workout', 'food',
		'daylog_person_link', 'daylog_new_person', 'daylog_fact', 'daylog_place'
	));

-- the day page badge and the close reply count unresolved items per day
create index if not exists pending_entities_daylog_day
	on public.pending_entities ((additional_data ->> 'day_id'))
	where resolved_at is null;
