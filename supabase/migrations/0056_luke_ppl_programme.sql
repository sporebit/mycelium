-- 0056 — Seed Push/Pull/Legs A+B workouts, a standalone Legs workout,
--        and a 6-day PPL programme for Luke.
--
-- Schema: workouts + workout_exercises (reps_per_set is TEXT, e.g. '8-12').

DO $$
DECLARE
  uid       text := 'phil';
  w_push_a  uuid;
  w_pull_a  uuid;
  w_legs_a  uuid;
  w_push_b  uuid;
  w_pull_b  uuid;
  w_legs_b  uuid;
  w_legs    uuid;
  prog      uuid;
BEGIN

  -- ────────────────────────────────────────────────
  -- Push A - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Push A - Luke', 'resistance')
  RETURNING id INTO w_push_a;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_push_a, 'Barbell Bench Press',       4, '8-12',  120, false, 0, null),
    (w_push_a, 'Military Press',            3, '8-12',   60, false, 1, '1-1.5 Minutes rest between sets'),
    (w_push_a, 'Dumbbell Incline Bench Press', 3, '8-12', 60, false, 2, '1-1.5 Minutes rest between sets'),
    (w_push_a, 'Cable Lateral Raise',       3, '12-15',  60, false, 3, null),
    (w_push_a, 'Triceps Dips',              3, '10-12',  60, true,  4, '1-1.5 Minutes rest between sets'),
    (w_push_a, 'Cable Triceps Pushdown',    3, '12-15',  60, false, 5, null);

  -- ────────────────────────────────────────────────
  -- Pull A - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Pull A - Luke', 'resistance')
  RETURNING id INTO w_pull_a;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_pull_a, 'Barbell Deadlift',       4, '6-8',   120, false, 0, '2-3 Minutes rest between sets'),
    (w_pull_a, 'Wide Grip Pull-up',      3, '8-12',  120, true,  1, null),
    (w_pull_a, 'Barbell Bent-over Row',  3, '8-12',  120, false, 2, null),
    (w_pull_a, 'Face Pulls',             3, '12-15',  60, false, 3, null),
    (w_pull_a, 'Barbell Curl',           3, '10-12',  60, false, 4, '1-1.5 Minutes rest between sets'),
    (w_pull_a, 'Dumbbell Hammer Curl',   3, '12-15',  60, false, 5, null);

  -- ────────────────────────────────────────────────
  -- Legs A - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Legs A - Luke', 'resistance')
  RETURNING id INTO w_legs_a;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_legs_a, 'Barbell Squat',              4, '8-12',  120, false, 0, '2-3 Minutes rest between sets'),
    (w_legs_a, 'Smith Machine Leg Press',    3, '10-15', 120, false, 1, null),
    (w_legs_a, 'Seated Leg Curl Machine',    3, '12-15',  60, false, 2, '1-1.5 Minutes rest between sets'),
    (w_legs_a, 'Leg Extension',              3, '12-15',  60, false, 3, '1-1.5 Minutes rest between sets'),
    (w_legs_a, 'Smith Machine Calf Raise',   4, '15',     60, false, 4, null),
    (w_legs_a, 'Walking Lunge',              3, '12-15', null, false, 5, '1-1.5 Minutes rest between sets');

  -- ────────────────────────────────────────────────
  -- Push B - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Push B - Luke', 'resistance')
  RETURNING id INTO w_push_b;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_push_b, 'Barbell Incline Bench Press',              4, '8-12',  120, false, 0, null),
    (w_push_b, 'Dumbbell Shoulder Press',                  3, '8-12',   60, false, 1, '1-1.5 Minutes rest between sets'),
    (w_push_b, 'Chest Dip',                                3, '8-12',   60, true,  2, '1-1.5 Minutes rest between sets'),
    (w_push_b, 'Cable Front Raise',                        3, '12-15',  60, false, 3, null),
    (w_push_b, 'EZ-bar Skull Crushers',                    3, '10-12',  60, false, 4, '1-1.5 Minutes rest between sets'),
    (w_push_b, 'Cable Rope Overhead Triceps Extension',    3, '12-15',  60, false, 5, null);

  -- ────────────────────────────────────────────────
  -- Pull B - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Pull B - Luke', 'resistance')
  RETURNING id INTO w_pull_b;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_pull_b, 'Barbell Upright Row',         4, '8-12',  120, false, 0, null),
    (w_pull_b, 'Lat Pulldown',                3, '8-12',   60, false, 1, '1-1.5 Minutes rest between sets'),
    (w_pull_b, 'T-bar Row',                   3, '8-12',  120, false, 2, null),
    (w_pull_b, 'Cable Rear Delt Fly',         3, '12-15',  60, false, 3, null),
    (w_pull_b, 'Concentration Curls Dumbbell', 3, '10-12', 60, false, 4, '1-1.5 Minutes rest between sets'),
    (w_pull_b, 'Cable Curl',                  3, '12-15',  60, false, 5, null);

  -- ────────────────────────────────────────────────
  -- Legs B - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Legs B - Luke', 'resistance')
  RETURNING id INTO w_legs_b;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_legs_b, 'Romanian Deadlift Barbell',  4, '8-12',  120, false, 0, '2-3 Minutes rest between sets'),
    (w_legs_b, 'Hack Squat',                 3, '10-15', 120, false, 1, null),
    (w_legs_b, 'Seated Leg Curl',            3, '12-15',  60, false, 2, '1-1.5 Minutes rest between sets'),
    (w_legs_b, 'Bulgarian Split Squat',      3, '12-15',  60, false, 3, '1-1.5 Minutes rest between sets'),
    (w_legs_b, 'Standing Calf Raise',        4, '12-15',  60, false, 4, null),
    (w_legs_b, 'Dumbbell Goblet Squat',      3, '12-15',  60, false, 5, '1-1.5 Minutes rest between sets');

  -- ────────────────────────────────────────────────
  -- Legs - Luke (standalone, not in programme)
  -- ────────────────────────────────────────────────
  INSERT INTO workouts (user_id, name, default_kind)
  VALUES (uid, 'Legs - Luke', 'resistance')
  RETURNING id INTO w_legs;

  INSERT INTO workout_exercises
    (workout_id, name, sets, reps_per_set, rest_seconds, is_bodyweight, position, notes)
  VALUES
    (w_legs, 'Barbell Deadlift',        4, '4-6',   120, false, 0, '2-3 Minutes rest between sets'),
    (w_legs, 'Barbell Front Squats',    4, '4-6',   120, false, 1, '2-3 Minutes rest between sets'),
    (w_legs, 'Bulgarian Split Squat',   3, '12-15',  60, false, 2, '1-1.5 Minutes rest between sets'),
    (w_legs, 'Leg Extension',           3, '12-15',  60, false, 3, '1-1.5 Minutes rest between sets'),
    (w_legs, 'Seated Leg Curl',         3, '12-15',  60, false, 4, '1-1.5 Minutes rest between sets'),
    (w_legs, 'Standing Calf Raise',     3, '15-20',  60, false, 5, null);

  -- ────────────────────────────────────────────────
  -- PROGRAMME: Push Pull Legs A B - Luke
  -- ────────────────────────────────────────────────
  INSERT INTO workout_programmes (user_id, name, description)
  VALUES (uid, 'Push Pull Legs A B - Luke', 'Push Pull Legs with 2 rotations (A/B), 6 workouts per week')
  RETURNING id INTO prog;

  INSERT INTO workout_programme_phases (user_id, programme_id, start_week_iso)
  VALUES (uid, prog, '2026-W25');

  -- Mon-Sat morning: Push A, Pull A, Legs A, Push B, Pull B, Legs B
  INSERT INTO workout_programme_sessions
    (programme_id, day_of_week, slot, kind, name, workout_id, position)
  VALUES
    (prog, 0, 'morning', 'resistance', 'Push A - Luke', w_push_a, 0),
    (prog, 1, 'morning', 'resistance', 'Pull A - Luke', w_pull_a, 0),
    (prog, 2, 'morning', 'resistance', 'Legs A - Luke', w_legs_a, 0),
    (prog, 3, 'morning', 'resistance', 'Push B - Luke', w_push_b, 0),
    (prog, 4, 'morning', 'resistance', 'Pull B - Luke', w_pull_b, 0),
    (prog, 5, 'morning', 'resistance', 'Legs B - Luke', w_legs_b, 0);

END $$;
