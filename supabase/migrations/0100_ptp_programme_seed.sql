-- 0100 — Seed "Philip's Training Plan (The PTP)".
--
-- Written by Kirsty September 2026, transcribed with two amendments by
-- Phil. docs/ptp-plan.md is the authoritative source; this migration is
-- that document expressed as rows. Follows the seed-by-migration pattern
-- of 0055/0056 so the programme survives a restore from migration
-- history rather than existing only in production.
--
-- The plan's three training blocks become three workout_programmes rows
-- sharing the strict prefix "PTP — ". They cannot be three phases of one
-- programme: workout_programme_sessions is UNIQUE (programme_id,
-- day_of_week, slot), so three blocks that each use Monday afternoon
-- collide. The prefix is what lets them be grouped later.
--
-- Only Phase 1 gets a workout_programme_phases row. end_week_iso is left
-- NULL: the Phase 1 -> Phase 2 exit is gated on being pain free, not on a
-- date, and this schema treats NULL as open-ended.
--
-- Depends on: 0097 (data_shape / with_weight / default_hold_seconds),
--             0099 (workout_programmes.guardrails).
-- Rollback:
--   DELETE FROM workout_programmes WHERE name LIKE 'PTP — %';
--   (cascades to phases, sessions and template exercises; logged sessions
--    are unaffected — their FKs are ON DELETE SET NULL, enforced by 0097)
--   UPDATE workout_programmes SET archived_at = NULL
--     WHERE id IN (...);  -- un-retire the pre-PTP programmes

DO $$
DECLARE
	uid   text := coalesce(current_setting('app.user_id', true), 'phil');
	guard text;
	p1    uuid;
	p2    uuid;
	p3    uuid;
	s     uuid;
	w     uuid;
BEGIN

-- ---------------------------------------------------------------------
-- 1. Retire the pre-PTP programmes.
--
-- Archived, never deleted. Their phase rows are deleted, though: the
-- Today phase query (app/api/fitness/today/route.ts:64) selects from
-- workout_programme_phases alone and never joins workout_programmes, and
-- the follow-up programme fetch does not filter on archived_at either.
-- So archiving a programme does NOT remove it from Today — only removing
-- its phase rows does. Four phase rows exist (W21, two at W25, W35);
-- Luke's PPL at W35 is currently the active programme and cannot coexist
-- with a rehab-led plan that says no ego lifting.
--
-- Nothing here touches workout_sessions, workout_session_exercises,
-- workout_sets or exercise_pain_logs.
-- ---------------------------------------------------------------------

UPDATE workout_programmes
	SET archived_at = now(), updated_at = now()
	WHERE user_id = uid
	  AND archived_at IS NULL
	  AND name NOT LIKE 'PTP — %';

DELETE FROM workout_programme_phases
	WHERE user_id = uid
	  AND programme_id IN (
		SELECT id FROM workout_programmes
		WHERE user_id = uid AND name NOT LIKE 'PTP — %'
	);

-- ---------------------------------------------------------------------
-- 2. The three programmes.
-- ---------------------------------------------------------------------

guard :=
	'Progression order — technique → pain response → reps → load. Load is the last thing that moves.' || chr(10) ||
	'Leave 2–3 reps in reserve on every set. No pushing. No "one more because I can".' || chr(10) ||
	'No ego lifting. No testing knees.' || chr(10) ||
	'Any clicking or pain → adapt or modify the movement. Do not push through it.' || chr(10) ||
	'Teach the body to move well before loading it.';

INSERT INTO workout_programmes (user_id, name, description, guardrails)
SELECT uid, 'PTP — Phase 1: Restore + Stabilise',
	'Phase 1 of 3. Pilates and rehab dominant: 3 purposeful sessions plus 2 gentle recovery/mobility days. Session shape is mobility → activation → controlled strength → light conditioning → mobility. Written by Kirsty, September 2026.',
	guard
WHERE NOT EXISTS (
	SELECT 1 FROM workout_programmes
	WHERE user_id = uid AND name = 'PTP — Phase 1: Restore + Stabilise'
);

INSERT INTO workout_programmes (user_id, name, description, guardrails)
SELECT uid, 'PTP — Phase 2: Rebuild',
	'Phase 2 of 3, 5–10 weeks depending on goals. Deliberately unscheduled: entry is gated on daily movement plus the Phase 1 exercises being consistently pain free or substantially improved, not on a date. Weights become prominent. Example week — Mon lower + core, Tue pilates/mobility, Wed upper + zone 2, Thu recovery/mobility, Fri full body, Sat family activity, Sun rest.',
	guard
WHERE NOT EXISTS (
	SELECT 1 FROM workout_programmes
	WHERE user_id = uid AND name = 'PTP — Phase 2: Rebuild'
);

INSERT INTO workout_programmes (user_id, name, description, guardrails)
SELECT uid, 'PTP — Phase 3: Hybrid',
	'Phase 3 of 3, the long-term goal. 3 strength sessions, 2 cardiovascular exposures, 1 pilates/mobility. Deliberately unscheduled: begins only once Phase 1 and half of Phase 2 are complete.',
	guard
WHERE NOT EXISTS (
	SELECT 1 FROM workout_programmes
	WHERE user_id = uid AND name = 'PTP — Phase 3: Hybrid'
);

SELECT id INTO p1 FROM workout_programmes
	WHERE user_id = uid AND name = 'PTP — Phase 1: Restore + Stabilise';
SELECT id INTO p2 FROM workout_programmes
	WHERE user_id = uid AND name = 'PTP — Phase 2: Rebuild';
SELECT id INTO p3 FROM workout_programmes
	WHERE user_id = uid AND name = 'PTP — Phase 3: Hybrid';

-- Phases 2 and 3 get no workout_programme_phases row on purpose; they are
-- visible at /fitness/programmes and are not schedulable.
INSERT INTO workout_programme_phases (user_id, programme_id, start_week_iso, end_week_iso)
SELECT uid, p1, '2026-W37', NULL
WHERE NOT EXISTS (
	SELECT 1 FROM workout_programme_phases
	WHERE user_id = uid AND programme_id = p1
);

-- If the programme already had sessions from a previous run of this
-- migration, clear them so the rebuild below is not duplicated. Logged
-- sessions keep their history: the FK is ON DELETE SET NULL (0097).
DELETE FROM workout_programme_sessions WHERE programme_id = p1;
DELETE FROM workouts
	WHERE user_id = uid AND name LIKE 'PTP Day % — %';

-- ---------------------------------------------------------------------
-- 3. Day 1 — Monday, lower.
-- ---------------------------------------------------------------------

INSERT INTO workouts (user_id, name, default_kind, default_slot, notes)
VALUES (uid, 'PTP Day 1 — Lower', 'resistance', 'afternoon',
	'3–4 sets, 8–10 reps, deliberately leaving 2–3 reps in reserve.')
RETURNING id INTO w;

INSERT INTO workout_programme_sessions
	(programme_id, day_of_week, slot, kind, name, notes, position, workout_id)
VALUES (p1, 0, 'afternoon', 'resistance', 'Day 1 — Lower',
	'3–4 sets, 8–10 reps, deliberately leaving 2–3 reps in reserve. No pushing. No testing knees.',
	0, w)
RETURNING id INTO s;

INSERT INTO workout_programme_exercises
	(programme_session_id, position, name, notes, default_sets, default_reps,
	 rest_seconds, default_duration_min, default_intensity, data_shape,
	 with_weight, default_hold_seconds)
VALUES
	(s, 0, 'Treadmill walk', 'Warm-up. 5–10 min at an easy pace.',
		NULL, NULL, NULL, 8, 'easy', 'duration', false, NULL),
	(s, 1, 'Mini band lateral squat walk', 'Activation. Band above the knees, stay low and controlled.',
		2, '12 each way', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 2, 'Glute bridge', 'Squeeze at the top, ribs down. No arching the lower back.',
		3, '10', 60, NULL, NULL, 'sets_reps', false, NULL),
	(s, 3, 'Dumbbell Goblet Squat', 'To 90% of comfortable depth only. Do not chase range.',
		3, '8-10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 4, 'Leg press — feet high and wide', 'Controlled throughout. Stop short of full lockout.',
		3, '8-10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 5, 'Seated leg curl machine', 'Slow eccentric.',
		3, '8-10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 6, 'Leg extension (light, pain-free range)', 'ONLY if symptom free. Light load, pain-free range. Stop at the first sign of knee pain.',
		3, '10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 7, 'Seated calf raise', 'Full range, pause at the top.',
		3, '12', 60, NULL, NULL, 'sets_reps', true, NULL),
	(s, 8, 'Dead bug', 'Ribs down, lower back flat to the floor throughout.',
		3, '8 each side', 45, NULL, NULL, 'sets_reps', false, NULL);

INSERT INTO workout_exercises (workout_id, name, sets, reps_per_set, rest_seconds, position, notes)
SELECT w, name, coalesce(default_sets, 3), coalesce(default_reps, '—'),
	coalesce(rest_seconds, 90), position, notes
FROM workout_programme_exercises WHERE programme_session_id = s;

-- ---------------------------------------------------------------------
-- 4. Day 2 — Tuesday, pilates / mobility.
-- ---------------------------------------------------------------------

INSERT INTO workouts (user_id, name, default_kind, default_slot, notes)
VALUES (uid, 'PTP Day 2 — Pilates / Mobility', 'mobility', 'afternoon',
	'Slow and controlled. Eccentrics and isometrics.')
RETURNING id INTO w;

INSERT INTO workout_programme_sessions
	(programme_id, day_of_week, slot, kind, name, notes, position, workout_id)
VALUES (p1, 1, 'afternoon', 'mobility', 'Day 2 — Pilates / Mobility',
	'Deeper control work. Slow and controlled throughout — eccentrics and isometrics, never speed.',
	0, w)
RETURNING id INTO s;

INSERT INTO workout_programme_exercises
	(programme_session_id, position, name, notes, default_sets, default_reps,
	 rest_seconds, default_duration_min, default_intensity, data_shape,
	 with_weight, default_hold_seconds)
VALUES
	(s, 0, 'Breathing + rib stacking', 'Lying. Exhale fully and feel the ribs stack down over the pelvis.',
		NULL, NULL, NULL, 3, 'easy', 'duration', false, NULL),
	(s, 1, 'Pelvic tilt', 'Small range, driven by the pelvis rather than the legs.',
		2, '10', 30, NULL, NULL, 'sets_reps', false, NULL),
	(s, 2, 'Dead bug', 'Ribs down, lower back flat throughout.',
		3, '8 each side', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 3, '90 Degree Heel Touch', 'Slow. Only lower as far as the back stays flat.',
		3, '10', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 4, 'Bird dog', 'Opposite arm and leg. Do not let the hips rotate.',
		3, '8 each side', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 5, 'Glute bridge', 'Slow up, slower down.',
		3, '12', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 6, 'Side-lying hip abduction', 'Top leg slightly behind the line of the body.',
		3, '12 each side', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 7, 'Adductor squeeze', 'Isometric. Ball or cushion between the knees.',
		3, NULL, 45, NULL, NULL, 'hold', false, 20),
	(s, 8, 'Thoracic rotation', 'Rotate from the mid-back, keep the pelvis still.',
		2, '8 each side', 30, NULL, NULL, 'sets_reps', false, NULL),
	(s, 9, 'Scapular retraction', 'Shoulder blades only — no bend at the elbow.',
		3, '10', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 10, 'Band external shoulder rotation', 'Elbow pinned to the side. Light band.',
		3, '12 each side', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 11, 'Hip mobility flow', '90/90 transitions and hip openers.',
		NULL, NULL, NULL, 5, 'easy', 'duration', false, NULL),
	(s, 12, 'Ankle + calf mobility', 'Knee-to-wall and calf stretch, both sides.',
		NULL, NULL, NULL, 4, 'easy', 'duration', false, NULL);

INSERT INTO workout_exercises (workout_id, name, sets, reps_per_set, rest_seconds, position, notes)
SELECT w, name, coalesce(default_sets, 3), coalesce(default_reps, '—'),
	coalesce(rest_seconds, 90), position, notes
FROM workout_programme_exercises WHERE programme_session_id = s;

-- ---------------------------------------------------------------------
-- 5. Day 3 — Wednesday, upper + shoulder rehab.
-- ---------------------------------------------------------------------

INSERT INTO workouts (user_id, name, default_kind, default_slot, notes)
VALUES (uid, 'PTP Day 3 — Upper + Shoulder Rehab', 'resistance', 'afternoon',
	'Any clicking or pain → adapt or modify.')
RETURNING id INTO w;

INSERT INTO workout_programme_sessions
	(programme_id, day_of_week, slot, kind, name, notes, position, workout_id)
VALUES (p1, 2, 'afternoon', 'resistance', 'Day 3 — Upper + Shoulder Rehab',
	'Neutral, comfortable grips throughout. Any clicking or pain → adapt or modify the movement.',
	0, w)
RETURNING id INTO s;

INSERT INTO workout_programme_exercises
	(programme_session_id, position, name, notes, default_sets, default_reps,
	 rest_seconds, default_duration_min, default_intensity, data_shape,
	 with_weight, default_hold_seconds)
VALUES
	(s, 0, 'Chest-supported row', 'Neutral or comfortable grip. Chest stays on the pad.',
		3, '10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 1, 'Scapular retraction', 'Warm-up for the pull. Shoulder blades only.',
		2, '12', 45, NULL, NULL, 'sets_reps', false, NULL),
	(s, 2, 'Dumbbell Shoulder Press', 'Light. Stop the set at the first sign of a shoulder pinch.',
		3, '8-10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 3, 'Push-up', 'Any variation that is comfortable — incline on a bench if needed.',
		3, '8-10', 90, NULL, NULL, 'sets_reps', false, NULL),
	(s, 4, 'Lat Pulldown', 'Comfortable grip width. Drive the elbows down, not back.',
		3, '10', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 5, 'Cable Triceps Pushdown', 'Elbows pinned. Light.',
		3, '12', 60, NULL, NULL, 'sets_reps', true, NULL),
	(s, 6, 'Cable Curl', 'Controlled, no swing.',
		3, '12', 60, NULL, NULL, 'sets_reps', true, NULL);

INSERT INTO workout_exercises (workout_id, name, sets, reps_per_set, rest_seconds, position, notes)
SELECT w, name, coalesce(default_sets, 3), coalesce(default_reps, '—'),
	coalesce(rest_seconds, 90), position, notes
FROM workout_programme_exercises WHERE programme_session_id = s;

-- ---------------------------------------------------------------------
-- 6. Day 4 — Thursday, conditioning.
-- ---------------------------------------------------------------------

INSERT INTO workouts (user_id, name, default_kind, default_slot, notes)
VALUES (uid, 'PTP Day 4 — Conditioning', 'cardio', 'afternoon',
	'Bike or cross trainer. Comfortable while building knee capacity.')
RETURNING id INTO w;

INSERT INTO workout_programme_sessions
	(programme_id, day_of_week, slot, kind, name, notes, position, workout_id)
VALUES (p1, 3, 'afternoon', 'cardio', 'Day 4 — Conditioning',
	'Bike or cross trainer — whichever is comfortable. Building knee capacity, not chasing fitness. Comfort decides both the machine and the duration.',
	0, w)
RETURNING id INTO s;

INSERT INTO workout_programme_exercises
	(programme_session_id, position, name, notes, default_sets, default_reps,
	 rest_seconds, default_duration_min, default_intensity, data_shape,
	 with_weight, default_hold_seconds)
VALUES
	(s, 0, 'Stationary bike', 'Saddle high enough that the knee never fully locks out. Comfortable resistance.',
		NULL, NULL, NULL, 20, 'easy-moderate', 'duration', false, NULL),
	(s, 1, 'Cross trainer', 'Alternative to the bike — do one or the other, not both.',
		NULL, NULL, NULL, 15, 'easy', 'duration', false, NULL);

INSERT INTO workout_exercises (workout_id, name, sets, reps_per_set, rest_seconds, position, notes)
SELECT w, name, coalesce(default_sets, 3), coalesce(default_reps, '—'),
	coalesce(rest_seconds, 90), position, notes
FROM workout_programme_exercises WHERE programme_session_id = s;

-- ---------------------------------------------------------------------
-- 7. Day 5 — Friday, full body.
-- ---------------------------------------------------------------------

INSERT INTO workouts (user_id, name, default_kind, default_slot, notes)
VALUES (uid, 'PTP Day 5 — Full Body', 'resistance', 'afternoon',
	'3 sets, 10–12 reps. Controlled loads, no ego lifting.')
RETURNING id INTO w;

INSERT INTO workout_programme_sessions
	(programme_id, day_of_week, slot, kind, name, notes, position, workout_id)
VALUES (p1, 4, 'afternoon', 'resistance', 'Day 5 — Full Body',
	'3 sets, 10–12 reps. Controlled loads, no ego lifting.',
	0, w)
RETURNING id INTO s;

INSERT INTO workout_programme_exercises
	(programme_session_id, position, name, notes, default_sets, default_reps,
	 rest_seconds, default_duration_min, default_intensity, data_shape,
	 with_weight, default_hold_seconds)
VALUES
	(s, 0, 'Dumbbell Goblet Squat', 'To 90% of comfortable depth only.',
		3, '10-12', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 1, 'Barbell hip thrust', 'Chin tucked, ribs down. Squeeze at the top.',
		3, '10-12', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 2, 'Chest-supported row', 'Supported throughout. Chest stays on the pad.',
		3, '10-12', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 3, 'Walking Lunge', 'Log currently states pain free — stop and log a pain entry if that changes.',
		3, '10-12 each leg', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 4, 'Seated leg curl machine', 'Slow eccentric.',
		3, '10-12', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 5, 'Push-up', 'Or a comfortable press variation.',
		3, '10-12', 90, NULL, NULL, 'sets_reps', false, NULL),
	(s, 6, 'Lat Pulldown', 'Comfortable grip width.',
		3, '10-12', 90, NULL, NULL, 'sets_reps', true, NULL),
	(s, 7, 'Farmer carry', 'Tall posture, ribs down. Stop before the grip fails.',
		3, NULL, 90, NULL, NULL, 'hold', true, 40),
	(s, 8, 'Overhead carry', 'Only if the shoulder is symptom free.',
		3, NULL, 90, NULL, NULL, 'hold', true, 30),
	(s, 9, 'Plank', 'Ribs down, glutes on. Quality over duration.',
		3, NULL, 60, NULL, NULL, 'hold', false, 30);

INSERT INTO workout_exercises (workout_id, name, sets, reps_per_set, rest_seconds, position, notes)
SELECT w, name, coalesce(default_sets, 3), coalesce(default_reps, '—'),
	coalesce(rest_seconds, 90), position, notes
FROM workout_programme_exercises WHERE programme_session_id = s;

-- ---------------------------------------------------------------------
-- 8. Exercise baselines.
--
-- exercise_baselines was empty. app/api/fitness/today/route.ts:180 reads
-- has_known_issues to flag exercises on the Today card, so seeding these
-- lights an existing code path rather than adding one.
-- ---------------------------------------------------------------------

INSERT INTO exercise_baselines
	(user_id, exercise_name, has_known_issues, typical_severity_min,
	 typical_severity_max, pain_regions, conditional_notes)
VALUES
	(uid, 'Dumbbell Goblet Squat', true, 0, 3, ARRAY['knee'], 'Cap at 90% of comfortable depth. Do not chase range.'),
	(uid, 'Leg press — feet high and wide', true, 0, 3, ARRAY['knee'], 'Feet high and wide keeps the knee angle friendly. Stop short of lockout.'),
	(uid, 'Leg extension (light, pain-free range)', true, 0, 4, ARRAY['knee'], 'Only if symptom free. Light load, pain-free range only.'),
	(uid, 'Seated leg curl machine', true, 0, 2, ARRAY['knee'], 'Slow eccentric. Usually well tolerated.'),
	(uid, 'Walking Lunge', true, 0, 3, ARRAY['knee'], 'Log currently states pain free. Re-log if that changes.'),
	(uid, 'Barbell hip thrust', true, 0, 2, ARRAY['knee','lower_back'], 'Chin tucked, ribs down, no lumbar extension at the top.'),
	(uid, 'Stationary bike', true, 0, 2, ARRAY['knee'], 'Saddle high enough that the knee never fully locks out.'),
	(uid, 'Cross trainer', true, 0, 2, ARRAY['knee'], 'Comfort decides the duration.'),
	(uid, 'Dumbbell Shoulder Press', true, 0, 4, ARRAY['shoulder'], 'Light. Stop at the first sign of a pinch.'),
	(uid, 'Lat Pulldown', true, 0, 3, ARRAY['shoulder'], 'Comfortable grip width, elbows down rather than back.'),
	(uid, 'Push-up', true, 0, 3, ARRAY['shoulder'], 'Incline variation if the floor version is uncomfortable.'),
	(uid, 'Chest-supported row', true, 0, 2, ARRAY['shoulder'], 'Neutral or comfortable grip.'),
	(uid, 'Overhead carry', true, 0, 4, ARRAY['shoulder'], 'Only if the shoulder is symptom free.'),
	(uid, 'Cable Triceps Pushdown', true, 0, 2, ARRAY['shoulder','elbow'], 'Elbows pinned to the side.'),
	(uid, 'Band external shoulder rotation', true, 0, 2, ARRAY['shoulder'], 'Rehab movement. Light band, elbow pinned.')
ON CONFLICT (user_id, exercise_name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 9. Daily movement habit.
--
-- Config only — habits live as JSON in daily_logs.notes at the goals
-- sentinel date (lib/types/goals.ts:10), read by /api/habits-config.
-- The live config already carries "Workout" and "Mobility"; the Phase 2
-- entry gate is specifically daily movement, which is neither.
-- Hydrate is already set to 3 L and is left alone.
-- ---------------------------------------------------------------------

UPDATE daily_logs
	SET notes = (
			(notes::jsonb) || jsonb_build_object(
				'habits_config',
				(notes::jsonb -> 'habits_config') || jsonb_build_array(
					jsonb_build_object(
						'id', 'daily-movement',
						'name', 'Daily Movement',
						'category', 'BODY',
						'target', 1
					)
				)
			)
		)::text,
		updated_at = now()
	WHERE user_id = uid
	  AND log_date = date '2000-01-01'
	  AND jsonb_typeof(notes::jsonb -> 'habits_config') = 'array'
	  AND NOT (notes::jsonb -> 'habits_config' @> '[{"id":"daily-movement"}]'::jsonb);

-- ---------------------------------------------------------------------
-- 10. Week-3 nutrition review, as a dated thing rather than a memory.
-- ---------------------------------------------------------------------

INSERT INTO reminders (user_id, message, due_at)
SELECT uid,
	'PTP nutrition targets — week 3 review. 2600 kcal / 200 P / 80 F / 270 C set on 7 Sep. Check weight trend, energy and training quality, then hold or adjust.',
	timestamptz '2026-09-28 09:00:00+01'
WHERE NOT EXISTS (
	SELECT 1 FROM reminders
	WHERE user_id = uid AND message LIKE 'PTP nutrition targets — week 3 review%'
);

INSERT INTO tasks (user_id, title, description, due_date)
SELECT uid,
	'PTP nutrition targets — week 3 review',
	'Targets are provisional and dated: 2600 kcal, 200 g protein, 80 g fat, 270 g carbs, 30–35 g fibre, 2.5–3 L water, effective 7 Sep 2026. Review weight trend, energy and training quality. Supersede by inserting a new nutrition_targets row with a later effective_from — never edit the existing row.',
	date '2026-09-28'
WHERE NOT EXISTS (
	SELECT 1 FROM tasks
	WHERE user_id = uid
	  AND title = 'PTP nutrition targets — week 3 review'
	  AND deleted_at IS NULL
);

END $$;
