# PTP import — implementation report

*Written 2026-10-29 from the decision record (`claude/ptp-import-prompt.md`), the plan (`docs/ptp-plan.md`), the migrations and git history. The decision record had pointed at this file since 2026-09-06; it was never written.*

## What shipped

Pushed to `main` on 2026-09-06 as commits `d866dbf` → `94d756e` (four commits, one per concern), migrations **0097–0100**, deployed by Vercel the same evening.

| Commit | Migration | Concern |
| --- | --- | --- |
| `d866dbf` | 0097 `fitness_schema_drift` | Seven columns the app read and wrote that no migration had ever created, plus `default_hold_seconds`. No-op against production, builder against an empty database. The today route and session log select the shape columns by name from here on. |
| `9c6d2fc` | 0099 `programme_guardrails` | `workout_programmes.guardrails` text, rendered as a pinned banner at the top of the live session log so the rules are read mid-workout. |
| `7db8ce1` | 0098 `nutrition_targets` | Daily macro targets versioned by `effective_from` with an optional `review_on`; `getNutritionTargets()` resolves the row in force on a date and falls back to the hard-coded defaults when none matches. |
| `94d756e` | 0100 `ptp_programme_seed` | The three PTP programmes, Phase 1's sessions and exercises, the Phase 1 phase row from 2026-W37 with no end week, the guardrails, the 2600 kcal / 200 g protein / 80 g fat / 270 g carbs targets effective 2026-09-07 with a review on 2026-09-28, and the source photos under `docs/ptp-source/`. |

The plan as modelled, the weekday mapping, the guardrails text and the canonical exercise names are in `docs/ptp-plan.md` and are not repeated here.

## Verification

- Claude Code verified against a local production build on 2026-09-06.
- The multi-user cutover on 2026-09-15 recorded PTP Today as verified live (the Today surface showed the Phase 1 session for the day on the hosted site).
- The week-3 review reminder fired on 2026-09-28. Its outcome is unrecorded; the targets row still carries that review date, and the nutritionist's live context now surfaces it on every turn until a newer targets row supersedes it.
- The 2026-10-29 live-context smoke against production read the programme as "PTP — Phase 1: Restore + Stabilise, week 8", today's plan as Day 4 Conditioning, and no sessions logged in the previous seven days.

## What the work turned up, and where each item stands

The decision record listed four findings beyond the drift itself. All but one are closed.

| Finding (2026-09-06) | Status |
| --- | --- |
| Archiving a programme did nothing: the today route never filtered `archived_at`. | **Fixed 2026-10-29** (`191b6fd`): `lib/fitness/active-phase.ts` is the one query for live phases and excludes archived programmes everywhere (today, swap, week summary, voice, headlines, calendar). |
| `exercise_pain_logs` cascaded off `workout_sessions`, so deleting a logged session destroyed the evidence the phase gate depends on. | **Fixed 2026-10-29** (0153): both session foreign keys are SET NULL; a deleted session leaves its pain logs as standalone entries. |
| The `0032_workouts_library.sql` header said `workout_programme_exercises` was deprecated; it is the live programme table. | **Corrected 2026-10-29** (`dc7f485`). |
| Supabase `.select()` strings are invisible to TypeScript and had already produced two live rendering bugs. | **Open.** Options on the backlog: a lint rule against `select("*")` and bare strings, or shared field-list constants per table (the pattern `LISTING_SELECT` / `LOG_SELECT` / `LIVE_PHASE_SELECT` already follow). |

The drift finding itself led to the CI step that replays every migration from an empty database, runs the suite against it and boots a cold build (`.github/workflows/ci.yml`), which is what the DB-backup item needed before a restore test could mean anything.

## Deferred on 2026-09-06, done since

- **Agent live context** was deferred off the first push because widening the prompts touched all seven agents. Shipped 2026-10-29 (`a2e9b84`) as a per-agent block in `lib/agents/live-context.ts`, appended on a fresh turn for the fitness and nutrition agents only, read-only.
- **`default_hold_seconds`** was declared in 0097 but the mobility seeder still wrote NULL. Fixed 2026-10-29 (`0ccb99e`).

## Still open

- Phil to confirm the 2026-09-15 live verification and record the week-3 review outcome, then close the PTP item (`claude/backlog.md`, PTP section).
- The Phase 1 → 2 exit is a judgement call (pain-free), not a date. When it happens: insert a `workout_programme_phases` row for the Phase 2 programme starting that ISO week, and set Phase 1's `end_week_iso` to the week before. Do not set an end week without the next phase row in place, or Today goes empty (the footgun in `docs/ptp-plan.md`).
- Water tracking, a phase-gate readiness view and exercise-library deduplication remain ideas.
