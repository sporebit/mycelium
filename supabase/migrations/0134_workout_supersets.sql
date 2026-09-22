-- 0134 — Supersets in workouts (MYC-30).
--
-- Exercises that share a superset_group within a session (or a programme
-- session) are performed back to back; the rest is taken after the group,
-- not between its exercises. Groups are small integers assigned per
-- session; null means "on its own". The template value is copied onto the
-- session exercise at session start, like rest_seconds.

alter table public.workout_session_exercises
	add column if not exists superset_group smallint;
alter table public.workout_programme_exercises
	add column if not exists superset_group smallint;
