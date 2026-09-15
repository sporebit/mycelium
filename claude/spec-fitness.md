# Spec — Fitness

*Crawled 2026-08-29; reviewed with Phil same day. Corrected 2026-09-06 from a live-DB audit during the PTP import (migrations 0097–0100) — those corrections are marked **[2026-09-06]**. Set-logging is the highest-stakes mutation in the app. (?) = inferred.*

## Data model

Templates are the single source of truth; programmes reference templates with live sync; a day log is a snapshot at log time. Tables: `workout_programmes` + phases (`start_week_iso`/`end_week_iso`, 0005), `workout_programme_sessions` (day, 4 slots, kind: cardio/conditioning/resistance/mobility — UNIQUE dropped so multiple sessions per slot), `workout_programme_exercises`; logs in `workout_sessions`, `workout_session_exercises`, `workout_sets`; `workouts` library (0032); `exercise_baselines` (0007), `exercise_pain_logs` (0007/0022/0026 incl. standalone pain_log kind), `exercise_aliases` (0046, alias union at query time), session types (0023), session status (0016), scheduled_at (0058), archived_at (0057), bodyweight exercises (0031), client_uuid idempotency (0040). Seeded programmes: PPL, Luke's programmes (0055/0056), **the PTP (0100)**. Body metrics tables live with fitness pages but the record is owned by Health — see `claude/spec-health.md`.

**[2026-09-06] Live column list, verified against the remote DB rather than the migration files:**

- `workout_programmes` — id, user_id, name, description, created_at, updated_at, archived_at, **guardrails (0099)**
- `workout_programme_phases` — id, user_id, programme_id, start_week_iso, end_week_iso, created_at. `start_week_iso` is text NOT NULL and the phases API rejects anything that isn't `YYYY-Www`; `end_week_iso` nullable = open-ended. **A phase with dates unset is not representable.**
- `workout_programme_sessions` — …day_of_week, slot, kind, name, notes, position, workout_id, kind_override. `kind ∈ (cardio, conditioning, resistance, mobility)`, `slot ∈ (morning, afternoon, evening, extra)`, **UNIQUE (programme_id, day_of_week, slot)** — the 0033/0035/0054 note that UNIQUE was dropped is wrong.
- `workout_programme_exercises` — …notes, default_sets, default_reps (text, so "8-10" is valid), default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity, data_shape, with_weight, **default_hold_seconds (0097)**. There is no `default_rpe` despite `lib/fitness/types.ts:57` declaring one.

**[2026-09-06] `workout_programme_exercises` is NOT deprecated.** The header comment in `0032_workouts_library.sql` describes a read-only cut-over that never happened. `today/route.ts:139`, `sessions/route.ts:130`, `session-detail.ts:55`, `sessions/[id]/swap/route.ts:115` and the voice route all read it; `workouts`/`workout_exercises` is read only when a session is started from the library. **A programme seeded only into the workouts library renders an empty session on Today.**

**[2026-09-06] There is no canonical exercise table.** `/api/fitness/exercises` derives the library from distinct `workout_session_exercises.name` values. `exercise_aliases` (0046) had 0 rows; `exercise_baselines` was empty until the PTP seeded 15. A name only enters the library once logged, so a typo — especially via voice — becomes a permanent duplicate. Existing duplicate clusters: Seated Leg Curl ×3, Leg Extension ×2, Bicep Curl / EZ Bar Curl.

**[2026-09-06] FK delete rules, read from `pg_constraint`:** `workout_sessions.programme_session_id`, `.swapped_from_programme_session_id` and `workout_session_exercises.programme_exercise_id` are all SET NULL — deleting a template does not touch logs. `workout_programme_phases.programme_id`, `workout_session_exercises.session_id`, `workout_sets.session_exercise_id` and `exercise_pain_logs.session_id` / `.session_exercise_id` are CASCADE. **Consequence: deleting one logged session destroys its pain evidence.**

## Behaviour rules

Weights kg | lbs | stone per exercise (stone default for body metrics); default rest 90s; auto-save 500ms; save-to-template checkbox on ad-hoc sessions; finish modal accepts a duration override and back-calculates `completed_at`; rest-timer chime/vibration logic FROZEN; template↔programme live sync FROZEN.

**[2026-09-06] Prescription and guardrails.** Per-exercise prescription lives on `workout_programme_exercises` (`default_sets`, free-text `default_reps`, `rest_seconds`, `default_duration_min`, `default_intensity`, `default_hold_seconds`) with conditionals in `notes`; `sessions/route.ts:189` copies template notes → `workout_session_exercises.notes` and `LogClient.tsx:1412` renders them mid-workout. Programme-level guardrails live on `workout_programmes.guardrails` (0099) and render as a pinned banner in LogClient.

**[2026-09-06] Known footgun — an expired phase falls through silently.** The phase query filters `start_week_iso <= currentWeek AND (end_week_iso IS NULL OR end_week_iso >= currentWeek)`. Once the end week passes with no later phase, zero rows match, `activePhase` is null and the handler returns `programme_name: null` with empty slots. There is no "programme ended" state and nothing distinguishes finished from never-had-one. The PTP therefore runs with `end_week_iso` NULL.

**[2026-09-06] Archiving a programme does nothing** — `today/route.ts:64` selects from `workout_programme_phases` alone and never filters `archived_at` on either query, so an archived programme with a live phase row still drives Today. Open bug.

## Pages & routes

Pages: `/fitness` (Today, day-swap, add extra session, drag-reorder), `/fitness/programmes` (+editor), `/fitness/workouts` (+new/detail), `/fitness/history` (+per-exercise, pain-coloured progression charts + pain-over-time), `/fitness/body` (legacy location — Health-owned record), `/fitness/calendar`, `/fitness/phases`, `/fitness/exercises` (+detail), `/fitness/coach` — **AI coach chat surface** (fitness-scoped agent conversation, same family as The Boys), `/fitness/overview`, `/fitness/log/[id]`, `/fitness/shortcut-setup` (linked from Settings, not nav), `/workout-now` (offline-first PWA, IndexedDB queue + Background Sync). ~40 `/api/fitness/*` + `/api/workouts/*` routes: programmes/sessions CRUD, today + swap, week-summary, baselines, pain-logs, exercise history/aliases, pending-routes resolve (voice), seed endpoints.

## Voice / Shortcuts

Workout voice logging (0008), pain voice logging + iOS Shortcut, ambiguity → picker; `/api/fitness/pending-routes/[id]/resolve`. Body metrics via Apple Health bridge + manual fallback; iOS body shortcut setup at `/the-boys/integrations/body-shortcut`.

## Current programme state (2026-09-06)

`PTP — Phase 1: Restore + Stabilise` active from 2026-W37, `end_week_iso` NULL, five sessions Mon–Fri afternoon, 41 template exercises. `PTP — Phase 2: Rebuild` and `PTP — Phase 3: Hybrid` exist as programme records with descriptions and no phase row — visible, not schedulable; the three-programme split is forced by the NOT NULL `start_week_iso` and the day/slot UNIQUE, so "The PTP" exists only as a naming convention. All pre-PTP programmes archived and their phase rows deleted. Authoritative plan: repo `docs/ptp-plan.md`.

## Loam & Glow state

P5 Parts 1 (localStorage → `ui_prefs.fitness_ui`) and 4 (restyle, 26 components, PR glow-pulse via existing `isPR`) shipped. **Pending: Part 2 (optimistic set-logging — UI advances immediately, rest timer starts on optimistic save) and Part 3 (live-session focus mode with confirm-to-exit)** — both need real in-workout verification. LogClient deliberately left on raw fetch until Part 2. Known bug: rest-timer minimise state not persisting (P5 Part 1 was supposed to migrate it — verify whether the bug predates or survived the migration).
