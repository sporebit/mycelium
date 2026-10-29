-- 0153 — Pain logs outlive the session they were logged in.
--
-- exercise_pain_logs carried `on delete cascade` from its session exercise
-- (0007) and its session (0022), so deleting a workout session silently
-- deleted the pain history logged during it. Since 0022 the log is
-- denormalised (exercise_name, logged_at) and since 0026 a log may stand
-- alone with no session at all, so a log whose session goes away is just
-- a standalone log — the UI already shows those. Decision (backlog
-- "SET NULL vs cascade"): SET NULL. Pain is a health record; a session is
-- bookkeeping.
--
-- The constraints were created with Postgres' default names; look them
-- up rather than assume, and leave columns untouched if a name differs.
do $$
declare
	c record;
begin
	for c in
		select con.conname, att.attname
		from pg_constraint con
		join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
		where con.conrelid = 'public.exercise_pain_logs'::regclass
		  and con.contype = 'f'
		  and att.attname in ('session_exercise_id', 'session_id')
	loop
		execute format('alter table public.exercise_pain_logs drop constraint %I', c.conname);
		if c.attname = 'session_exercise_id' then
			execute 'alter table public.exercise_pain_logs add constraint exercise_pain_logs_session_exercise_id_fkey foreign key (session_exercise_id) references public.workout_session_exercises(id) on delete set null';
		else
			execute 'alter table public.exercise_pain_logs add constraint exercise_pain_logs_session_id_fkey foreign key (session_id) references public.workout_sessions(id) on delete set null';
		end if;
	end loop;
end $$;

comment on column public.exercise_pain_logs.session_id is
	'The session this was logged in, or null once that session is deleted (0153: the log is kept as a standalone entry).';
