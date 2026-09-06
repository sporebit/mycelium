-- 0097 — Reconcile fitness schema drift.
--
-- Seven columns are read and written by application code but were never
-- created by any migration. They exist in the production database because
-- they were added out-of-band. The consequence is that replaying
-- supabase/migrations from zero produces a database this application
-- cannot run against: /api/fitness/today selects data_shape and
-- with_weight by name (app/api/fitness/today/route.ts:24) and errors if
-- they are absent.
--
-- This migration is deliberately a no-op against production (every
-- statement is IF NOT EXISTS) and a builder against an empty database.
-- Defaults were chosen to reproduce the values production actually holds,
-- not to invent new ones:
--   * workout_programme_sessions.position is 0 for every existing row
--   * workout_programme_exercises.data_shape is 'sets_reps' for every row
--
-- default_hold_seconds is the one genuinely new column. It is read by
-- components/fitness/TodayView.tsx:60 and LogClient.tsx:1530 for the
-- data_shape='hold' path, and declared on MobilitySeedRow
-- (lib/fitness/seed-mobility.ts:14), but exists in neither the database
-- nor any migration — so the 'hold' rendering path has never had a value
-- to read. Adding it is additive and nullable. Note that the mobility
-- seeder builds its insert without the field
-- (app/api/fitness/seed-mobility/route.ts:67) so it still writes NULL;
-- that is a separate bug, left alone here.

-- 1. Template sessions: ordering within a (day, slot).
ALTER TABLE workout_programme_sessions
	ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- 2. Template exercises: logging shape + weight column visibility.
ALTER TABLE workout_programme_exercises
	ADD COLUMN IF NOT EXISTS data_shape text NOT NULL DEFAULT 'sets_reps',
	ADD COLUMN IF NOT EXISTS with_weight boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS default_hold_seconds integer;

-- 3. Logged exercises: same two shape columns, plus the skip flag and
--    per-exercise completion stamp the logger writes.
ALTER TABLE workout_session_exercises
	ADD COLUMN IF NOT EXISTS data_shape text NOT NULL DEFAULT 'sets_reps',
	ADD COLUMN IF NOT EXISTS with_weight boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false,
	ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 4. Constrain data_shape to the ExerciseDataShape union in
--    lib/fitness/types.ts:16. Guarded so reruns do not fail, and added
--    after the columns so a from-zero replay constrains them too.
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'workout_programme_exercises_data_shape_chk'
	) THEN
		ALTER TABLE workout_programme_exercises
			ADD CONSTRAINT workout_programme_exercises_data_shape_chk
			CHECK (data_shape IN ('sets_reps', 'hold', 'duration', 'distance'));
	END IF;
END $$;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'workout_session_exercises_data_shape_chk'
	) THEN
		ALTER TABLE workout_session_exercises
			ADD CONSTRAINT workout_session_exercises_data_shape_chk
			CHECK (data_shape IN ('sets_reps', 'hold', 'duration', 'distance'));
	END IF;
END $$;

-- 5. Guarantee that retiring a programme can never destroy logged history.
--
-- Three foreign keys point from the logged tables back into the programme
-- template tables. 0005 and 0009 declare all three ON DELETE SET NULL, but
-- given that seven columns on these same tables drifted out of migration
-- control, the declared rule is not evidence of the live rule. 14 of 38
-- workout_sessions and 47 of 103 workout_session_exercises currently hold
-- a non-null reference, so a CASCADE here would silently delete a third of
-- the training history the moment a programme row is removed.
--
-- This block reports what each rule actually is, then rewrites any that is
-- not SET NULL. It is a no-op when the rules are already correct.
-- confdeltype: a=no action, r=restrict, c=cascade, n=set null, d=set default.
DO $$
DECLARE
	fk RECORD;
	targets text[][] := ARRAY[
		ARRAY['workout_sessions', 'programme_session_id'],
		ARRAY['workout_sessions', 'swapped_from_programme_session_id'],
		ARRAY['workout_session_exercises', 'programme_exercise_id']
	];
	t text[];
BEGIN
	FOREACH t SLICE 1 IN ARRAY targets LOOP
		FOR fk IN
			SELECT c.conname, c.confdeltype, c.conrelid::regclass AS tbl
			FROM pg_constraint c
			JOIN pg_attribute a
			  ON a.attrelid = c.conrelid
			 AND a.attnum = c.conkey[1]
			WHERE c.contype = 'f'
			  AND c.conrelid = t[1]::regclass
			  AND a.attname = t[2]
		LOOP
			RAISE NOTICE 'FK % on %.%: on delete = %',
				fk.conname, fk.tbl, t[2],
				CASE fk.confdeltype
					WHEN 'c' THEN 'CASCADE'
					WHEN 'n' THEN 'SET NULL'
					WHEN 'r' THEN 'RESTRICT'
					WHEN 'd' THEN 'SET DEFAULT'
					ELSE 'NO ACTION'
				END;

			IF fk.confdeltype <> 'n' THEN
				RAISE NOTICE 'Rewriting % to ON DELETE SET NULL', fk.conname;
				EXECUTE format(
					'ALTER TABLE %s DROP CONSTRAINT %I',
					fk.tbl, fk.conname
				);
				EXECUTE format(
					'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) '
					|| 'REFERENCES %s(id) ON DELETE SET NULL',
					fk.tbl, fk.conname, t[2],
					CASE t[2]
						WHEN 'programme_exercise_id'
							THEN 'workout_programme_exercises'
						ELSE 'workout_programme_sessions'
					END
				);
			END IF;
		END LOOP;
	END LOOP;
END $$;
