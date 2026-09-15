-- Migration: space_id + created_by on the fitness section. P12 Part 2.
-- See 0104 for what app.adopt_table does. Parents before children.
--
-- workout_exercises is NOT adopted: it is the shared read-only catalogue
-- (decision B in the P12 prompt) and carries no space_id.
--
-- Depends on: 0103.
-- Rollback: restore from the pre-cutover dump.

-- programmes
select app.adopt_table('workout_programmes');
select app.adopt_table('workout_programme_phases');
select app.adopt_table('workouts');
select app.adopt_table('workout_programme_sessions', 'workout_programmes', 'programme_id');
select app.adopt_table('workout_programme_exercises', 'workout_programme_sessions', 'programme_session_id');

-- sessions
select app.adopt_table('workout_sessions');
select app.adopt_table('workout_session_exercises', 'workout_sessions', 'session_id');
select app.adopt_table('workout_sets', 'workout_session_exercises', 'session_exercise_id');
select app.adopt_table('workout_session_types');
select app.adopt_table('pending_workout_routes');

-- body
select app.adopt_table('body_metrics');
select app.adopt_table('health_metrics');
select app.adopt_table('health_workouts');
select app.adopt_table('exercise_baselines');
select app.adopt_table('exercise_pain_logs');
select app.adopt_table('exercise_aliases');
