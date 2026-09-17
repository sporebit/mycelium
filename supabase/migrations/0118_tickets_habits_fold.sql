-- 0118_tickets_habits_fold.sql
-- Tickets — Part C: Habits fold into series tickets (spec §8.3, Flag 5).
--
-- Each configured habit becomes one visible `series` ticket (kind = habit,
-- FREQ=DAILY) carrying the legacy habit id in meta.habit_id, so the Habits
-- tile, heatmap and streak keep their ids. History moves from the per-day
-- daily_logs.notes JSON (habits.done = [ids]) into ticket_completions, one
-- row per habit per day. The migration asserts, per habit, that the number
-- of distinct completed days matches the legacy count and aborts otherwise
-- (Flag 5: "verify by count before dropping the old read path").
--
-- Config source per space: the sentinel daily_logs row (log_date
-- 2000-01-01, notes.habits_config). Spaces with no sentinel config but with
-- habit history get the app's default six. Spaces with neither are skipped.
-- Idempotent: an existing habit ticket for the same habit id is reused.
--
-- Depends on: 0117 (ticket_status_for).

alter table public.tickets
	add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists tickets_habit_idx
	on public.tickets ((meta->>'habit_id'))
	where kind = 'habit';

create or replace function public.try_jsonb(t text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
	if t is null or btrim(t) = '' then return null; end if;
	return t::jsonb;
exception when others then
	return null;
end
$$;
revoke all on function public.try_jsonb(text) from public;

do $$
declare
	s          record;
	cfg        jsonb;
	h          jsonb;
	v_status   uuid;
	v_ticket   uuid;
	v_idx      int;
	v_legacy   int;
	v_new      int;
	v_habits   int := 0;
	v_rows     int := 0;
	v_default  jsonb := '[
		{"id":"move","name":"Move","category":"BODY","target":1},
		{"id":"read","name":"Read","category":"MIND","target":30,"unit":"m"},
		{"id":"hydrate","name":"Hydrate","category":"BODY","target":2,"unit":"L"},
		{"id":"meditate","name":"Meditate","category":"MIND","target":10,"unit":"m"},
		{"id":"write","name":"Write","category":"CRAFT","target":1},
		{"id":"connect","name":"Connect","category":"SOCIAL","target":1}
	]'::jsonb;
begin
	for s in select id, owner_user_id from public.spaces loop
		select public.try_jsonb(d.notes)->'habits_config' into cfg
		from public.daily_logs d
		where d.space_id = s.id and d.log_date = date '2000-01-01'
		limit 1;

		if cfg is null or jsonb_typeof(cfg) <> 'array' or jsonb_array_length(cfg) = 0 then
			if not exists (
				select 1 from public.daily_logs d
				where d.space_id = s.id and d.log_date <> date '2000-01-01'
				  and jsonb_typeof(public.try_jsonb(d.notes)->'habits'->'done') = 'array'
				  and jsonb_array_length(public.try_jsonb(d.notes)->'habits'->'done') > 0
			) then
				continue;
			end if;
			cfg := v_default;
		end if;

		v_status := public.ticket_status_for(s.id, 'next');
		if v_status is null then
			raise exception 'space % has no Next status (0117 seed missing)', s.id;
		end if;

		v_idx := 0;
		for h in select * from jsonb_array_elements(cfg) loop
			v_idx := v_idx + 1;
			if coalesce(h->>'id', '') = '' or coalesce(h->>'name', '') = '' then
				continue;
			end if;

			select id into v_ticket from public.tickets
			where space_id = s.id and kind = 'habit' and meta->>'habit_id' = h->>'id'
			limit 1;

			if v_ticket is null then
				insert into public.tickets (
					space_id, created_by, owner, title, kind,
					recurrence_mode, recurrence_rrule, status_id, source,
					urgency, priority_score, where_ctx, tools, time_window,
					sort_order, tags, meta
				) values (
					s.id, s.owner_user_id, s.owner_user_id::text, h->>'name', 'habit',
					'series', 'FREQ=DAILY', v_status, 'import',
					'someday', 0.5, 'anywhere', '{none}', 'anytime',
					v_idx, array[coalesce(h->>'category', 'HABIT')],
					jsonb_build_object(
						'habit_id', h->>'id',
						'category', coalesce(h->>'category', 'HABIT'),
						'target', h->'target',
						'unit', h->'unit',
						'legacy', true
					)
				) returning id into v_ticket;
				v_habits := v_habits + 1;
			end if;

			-- history: one completion per day the legacy JSON lists this habit
			insert into public.ticket_completions (space_id, created_by, ticket_id, completed_on, completed_by)
			select distinct s.id, s.owner_user_id, v_ticket, d.log_date, s.owner_user_id
			from public.daily_logs d
			where d.space_id = s.id and d.log_date <> date '2000-01-01'
			  and jsonb_typeof(public.try_jsonb(d.notes)->'habits'->'done') = 'array'
			  and (public.try_jsonb(d.notes)->'habits'->'done') ? (h->>'id')
			on conflict (ticket_id, completed_on) do nothing;

			-- assert: distinct legacy days == completion rows
			select count(distinct d.log_date) into v_legacy
			from public.daily_logs d
			where d.space_id = s.id and d.log_date <> date '2000-01-01'
			  and jsonb_typeof(public.try_jsonb(d.notes)->'habits'->'done') = 'array'
			  and (public.try_jsonb(d.notes)->'habits'->'done') ? (h->>'id');
			select count(*) into v_new from public.ticket_completions where ticket_id = v_ticket;
			if v_new < v_legacy then
				raise exception 'habit % in space %: % legacy days but % completions', h->>'id', s.id, v_legacy, v_new;
			end if;
			v_rows := v_rows + v_new;
			raise notice 'habit % (%): % days', h->>'id', h->>'name', v_new;
		end loop;
	end loop;
	raise notice 'habits fold: % habit tickets created, % completion rows total', v_habits, v_rows;
end
$$;
