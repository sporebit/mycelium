-- 0032 — Workouts library + programme→workout indirection.
--
-- Previously, programme sessions held their exercise list inline via
-- workout_programme_exercises. This migration introduces a reusable
-- `workouts` table (with its own exercise rows in `workout_exercises`)
-- and a workout_id pointer on workout_programme_sessions so editing
-- one workout cascades to every programme that schedules it.
--
-- Existing programme sessions are backfilled into workouts in a DO
-- block at the end so /fitness/programmes keeps rendering through the
-- transition. The legacy workout_programme_exercises table stays
-- around for now (read-only) until the UI fully cuts over.

CREATE TABLE IF NOT EXISTS workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  name text NOT NULL,
  default_kind text
    CHECK (default_kind IS NULL OR default_kind IN ('cardio','conditioning','resistance','mobility')),
  default_slot text
    CHECK (default_slot IS NULL OR default_slot IN ('morning','afternoon','evening','extra')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON workouts;
CREATE POLICY "deny all" ON workouts AS RESTRICTIVE USING (false);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  name text NOT NULL,
  sets integer NOT NULL DEFAULT 3,
  reps_per_set text NOT NULL DEFAULT '8-12',
  rest_seconds integer DEFAULT 90,
  weight_kg numeric,
  is_bodyweight boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny all" ON workout_exercises;
CREATE POLICY "deny all" ON workout_exercises AS RESTRICTIVE USING (false);

CREATE INDEX IF NOT EXISTS workouts_user_id_idx
  ON workouts (user_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS workout_exercises_workout_id_idx
  ON workout_exercises (workout_id, position);

ALTER TABLE workout_programme_sessions
  ADD COLUMN IF NOT EXISTS workout_id uuid REFERENCES workouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind_override text;

-- Loosen the kind constraint on the workout_programme_sessions kind
-- column so the override can land any of the four canonical kinds.
-- We use a guarded DO block so reruns don't fail.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workout_programme_sessions_kind_override_chk'
  ) THEN
    ALTER TABLE workout_programme_sessions
      ADD CONSTRAINT workout_programme_sessions_kind_override_chk
      CHECK (
        kind_override IS NULL
        OR kind_override IN ('cardio','conditioning','resistance','mobility')
      );
  END IF;
END $$;

-- Backfill: for every existing programme session that hasn't already
-- been migrated (workout_id IS NULL), create a workouts row using the
-- programme's user_id, copy its exercises into workout_exercises, and
-- point the programme session at the new workouts row.
DO $$
DECLARE
  sess RECORD;
  new_workout_id uuid;
  ex RECORD;
  pos int;
BEGIN
  FOR sess IN
    SELECT
      wps.id              AS programme_session_id,
      wps.name            AS name,
      wps.kind            AS kind,
      wps.slot            AS slot,
      wps.notes           AS notes,
      wp.user_id          AS user_id
    FROM workout_programme_sessions wps
    JOIN workout_programmes wp ON wp.id = wps.programme_id
    WHERE wps.workout_id IS NULL
  LOOP
    INSERT INTO workouts (user_id, name, default_kind, default_slot, notes)
    VALUES (
      sess.user_id,
      sess.name,
      CASE
        WHEN sess.kind IN ('cardio','conditioning','resistance','mobility')
          THEN sess.kind
        ELSE NULL
      END,
      CASE
        WHEN sess.slot IN ('morning','afternoon','evening','extra')
          THEN sess.slot
        ELSE NULL
      END,
      sess.notes
    )
    RETURNING id INTO new_workout_id;

    pos := 0;
    FOR ex IN
      SELECT *
      FROM workout_programme_exercises
      WHERE programme_session_id = sess.programme_session_id
      ORDER BY position ASC
    LOOP
      INSERT INTO workout_exercises (
        workout_id, name, sets, reps_per_set, rest_seconds,
        weight_kg, is_bodyweight, position, notes
      )
      VALUES (
        new_workout_id,
        ex.name,
        COALESCE(ex.default_sets, 3),
        COALESCE(ex.default_reps, '8-12'),
        COALESCE(ex.rest_seconds, 90),
        ex.default_weight,
        COALESCE(ex.is_bodyweight, false),
        pos,
        ex.notes
      );
      pos := pos + 1;
    END LOOP;

    UPDATE workout_programme_sessions
    SET workout_id = new_workout_id
    WHERE id = sess.programme_session_id;
  END LOOP;
END $$;
