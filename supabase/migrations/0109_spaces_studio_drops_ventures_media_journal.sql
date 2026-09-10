-- Migration: space_id + created_by on studio, drops, ventures, media,
-- journal, places and reminders. P12 Part 2, last of the domain group.
-- See 0104 for what app.adopt_table does. Parents before children.
--
-- The reminders app.user_id policy the prompt names is dropped by the
-- helper along with the seven sibling policies 0101 left in place
-- (exercise_aliases, health_metrics, health_workouts, pc_components,
-- places, supplements, supplement_logs); Part 3 writes every policy anew.
--
-- Depends on: 0103.
-- Rollback: restore from the pre-cutover dump.

-- studio
select app.adopt_table('pc_components');
select app.adopt_table('pc_metrics');
select app.adopt_table('pc_metrics_hourly');
select app.adopt_table('spotify_tokens');
select app.adopt_table('spotify_plays');

-- drops
select app.adopt_table('drops');
select app.adopt_table('wishlist_items', 'drops', 'drop_id');
select app.adopt_table('raffle_entries', 'drops', 'drop_id');
select app.adopt_table('drop_monitors');

-- ventures
select app.adopt_table('ventures');
select app.adopt_table('venture_steps', 'ventures', 'venture_id');
select app.adopt_table('venture_ads', 'ventures', 'venture_id');
select app.adopt_table('venture_inspiration');

-- media
select app.adopt_table('media_items');
select app.adopt_table('media_episodes', 'media_items', 'item_id');

-- journal
select app.adopt_table('journal_entries');
select app.adopt_table('journal_daily_summaries');
select app.adopt_table('daily_logs');

-- places, reminders
select app.adopt_table('places');
select app.adopt_table('reminders');

-- Every registered table must now carry space_id and created_by, and no
-- table in public may still carry user_id. Fail the migration otherwise,
-- so a table missed above cannot slip through to Part 3.
do $$
declare
	v_missing text;
	v_legacy  text;
begin
	select string_agg(eg.table_name, ', ' order by eg.table_name) into v_missing
	from public.entity_groups eg
	where not exists (
		select 1 from information_schema.columns c
		where c.table_schema = 'public' and c.table_name = eg.table_name and c.column_name = 'space_id')
	   or not exists (
		select 1 from information_schema.columns c
		where c.table_schema = 'public' and c.table_name = eg.table_name and c.column_name = 'created_by');
	if v_missing is not null then
		raise exception 'Registered tables without space_id/created_by: %', v_missing;
	end if;

	select string_agg(c.table_name, ', ' order by c.table_name) into v_legacy
	from information_schema.columns c
	join information_schema.tables t using (table_schema, table_name)
	where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name = 'user_id';
	if v_legacy is not null then
		raise exception 'Tables still carrying user_id after adoption: %', v_legacy;
	end if;
end
$$;
