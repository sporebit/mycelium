-- 0055 — Seed four workout templates and a 3-day full-body programme for Luke.
--
-- Tables: workouts, workout_exercises, workout_programmes,
--         workout_programme_phases, workout_programme_sessions.
--
-- Schema notes:
--   workout_exercises.reps_per_set is TEXT (e.g. '8-12'), no duration_seconds
--   column exists — duration info goes in notes.
--   No reps_min/reps_max columns — ranges go in reps_per_set as '8-12'.

DO $$
DECLARE
  uid      text := 'phil';
  w_abs    uuid;
  w_fba    uuid;
  w_fbb    uuid;
  w_fbc    uuid;
  prog     uuid;
BEGIN

  -- ────────────────────────────────────────────────
  -- WORKOUT 1: Abs - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Abs - Luke', 'conditioning')
  RETURNING id INTO w_abs;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_abs, 'Alternate Arm Leg Plank Hold', 3, '1', null, true,  0, 'Warm up — hold 60s per set'),
    (w_abs, 'Hanging Leg Hip Raise',        3, '10', null, true,  1, null),
    (w_abs, 'Adductor Stretch',             3, '12', null, true,  2, null),
    (w_abs, '90 Degree Heel Touch',         3, '20', null, true,  3, null),
    (w_abs, 'Alternate Heel Touches',       3, '12', null, true,  4, null);

  -- ────────────────────────────────────────────────
  -- WORKOUT 2: Full Body A - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Full Body A - Luke', 'resistance')
  RETURNING id INTO w_fba;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_fba, 'Walking on a Treadmill',                1, '1',     null, false, 0, 'Warm up — 5-10 minutes'),
    (w_fba, 'Barbell Squat',                          3, '8-12',  120, false, 1, null),
    (w_fba, 'Barbell Bench Press',                    3, '8-12',  120, false, 2, null),
    (w_fba, 'Barbell Bent-over Row',                  3, '8-12',  120, false, 3, null),
    (w_fba, 'Dumbbell Shoulder Press',                3, '8-12',  120, false, 4, null),
    (w_fba, 'Dumbbell Lunge',                         3, '10-12', 120, false, 5, null),
    (w_fba, 'Alternate Bicep Curl Standing Dumbbells', 3, '10-12', 120, false, 6, null),
    (w_fba, 'Triceps Dips',                           3, '10-12', 120, true,  7, null),
    (w_fba, 'Plank',                                  3, '1',     null, true,  8, '3 sets of 30-60 seconds'),
    (w_fba, 'Static Stretching',                      1, '1',     null, true,  9, 'Cool down — 5-10 minutes of static stretching');

  -- ────────────────────────────────────────────────
  -- WORKOUT 3: Full Body B - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Full Body B - Luke', 'resistance')
  RETURNING id INTO w_fbb;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_fbb, 'Walking on a Treadmill',                  1, '1',     null, false, 0, 'Warm up — 5-10 minutes'),
    (w_fbb, 'Barbell Deadlift',                        3, '8-12',  120, false, 1, null),
    (w_fbb, 'Dumbbell Chest Press Incline Bench',      3, '8-12',  120, false, 2, null),
    (w_fbb, 'Dumbbell Lateral Raise',                  3, '10-12', 120, false, 3, null),
    (w_fbb, 'Dumbbell Hammer Curl',                    3, '10-12', 120, false, 4, null),
    (w_fbb, 'Hanging Straight Leg Raise',              3, '20',    null, true,  5, 'As many reps as possible for each set'),
    (w_fbb, 'Lying Abs Resistance Band',               4, '20',    null, false, 6, null),
    (w_fbb, 'Front Squats Kettlebell Over Shoulders',   3, '12',    null, false, 7, null),
    (w_fbb, 'Static Stretching',                       1, '1',     null, true,  8, 'Cool down — 5-10 minutes of static stretching');

  -- ────────────────────────────────────────────────
  -- WORKOUT 4: Full Body C - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Full Body C - Luke', 'resistance')
  RETURNING id INTO w_fbc;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_fbc, 'Walking on a Treadmill',        1, '1',     null, false, 0, 'Warm up — 5-10 minutes'),
    (w_fbc, 'Close-grip Push-up',            3, '10-15', 120, true,  1, null),
    (w_fbc, 'Arnold Press Dumbbell',         3, '10-12', 120, false, 2, null),
    (w_fbc, 'Bulgarian Split Squat',         3, '10-12', 120, false, 3, null),
    (w_fbc, 'Concentration Curls Dumbbell',  3, '10-12', 120, false, 4, null),
    (w_fbc, 'Dumbbell Tricep Kickback',      3, '10-12', 120, false, 5, null),
    (w_fbc, 'Bicycles Crunches',             3, '20',    120, true,  6, '3 sets of 20 reps (10 per side)'),
    (w_fbc, 'Good Mornings Kettlebell',      3, '12',    null, false, 7, null),
    (w_fbc, 'Hanging Leg Hip Raise',         4, '12',    null, true,  8, null),
    (w_fbc, 'Static Stretching',             1, '1',     null, true,  9, 'Cool down — 5-10 minutes of static stretching');

  -- ────────────────────────────────────────────────
  -- PROGRAMME: Home - Full Body 3 Day Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workout_programmes (user_id, name, description)
  VALUES (uid, 'Home - Full Body 3 Day Luke', 'Full body hypertrophy programme, 3 days per week')
  RETURNING id INTO prog;

  -- Single phase starting this week
  INSERT INTO workout_programme_phases (user_id, programme_id, start_week_iso)
  VALUES (uid, prog, '2026-W25');

  -- Sessions: Mon/Wed/Fri morning
  INSERT INTO workout_programme_sessions
    (programme_id, day_of_week, slot, kind, name, workout_id, position)
  VALUES
    (prog, 0, 'morning', 'resistance', 'Full Body A - Luke', w_fba, 0),
    (prog, 2, 'morning', 'resistance', 'Full Body B - Luke', w_fbb, 0),
    (prog, 4, 'morning', 'resistance', 'Full Body C - Luke', w_fbc, 0);

END $$;
