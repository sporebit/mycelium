# PTP import — decision record

*Created 2026-09-06; closed out the same evening. The authoritative plan now lives in the repo at `docs/ptp-plan.md`; the implementation report is `docs/ptp-report.md`. The original import prompt has been dropped from this doc — it was superseded by what actually shipped. Source photos: `C:\Users\Phil\Pictures\Fitness Plan From Kirsty` → repo `docs/ptp-source/`.*

## Status

**Shipped to main 2026-09-06**, migrations 0097–0100, commits `c0cb0f7..7e18236`. Awaiting Phil's verification on the deployed site — Claude Code verified against a local production build only, so nothing here is `done` by the project's definition yet.

## Decisions

**The plan itself**

- Day 5 (full body) belongs to **Phase 1**, not Phase 2. The notebook's day list and its "3 purposeful + 2 gentle" line disagree; resolved in favour of the day list.
- Protein raised to **200 g** from Kirsty's 150 g, calories held at 2600, so carbs drop to **270 g** (fat held at 80 g). 200 g at ~80 kg is 2.5 g/kg — above Kirsty's own stated 1.6–2.0 range. Expect it to be queried at the week-3 review.
- Targets are provisional: hold 3–6 weeks, review 2026-09-28. Stored versioned, not as constants.
- Start **2026-W37 (Mon 7 Sep)**. Mon=Day 1 lower, Tue=Day 2 pilates, Wed=Day 3 upper, Thu=Day 4 conditioning, Fri=Day 5 full body.
- Phase 1 `end_week_iso` left **NULL**. The Phase 1 → 2 exit is gated on being pain-free, not on a date, and an expired phase falls through to an empty Today with no "programme ended" state.
- **Old programmes scrapped, not closed** (Phil, mid-session). All pre-PTP programmes archived and their 4 phase rows deleted; every logged session, set and pain log kept and count-verified before/after.

**Design calls made during review, against Claude Code's proposals**

- **Rejected** a new `programme_guardrails` table — a column on `workout_programmes` carries five lines of static text just as well, and the render path into LogClient was the real work either way.
- **Rejected** one combined migration — split by concern into four (drift · guardrails · nutrition targets · PTP seed).
- **Rejected** backdating `nutrition_targets.effective_from` so the numbers show a day early. Backdating a versioned target to before the decision existed defeats the audit trail the table exists for.
- **Deferred** the agent live-context work off the first push: widening `AGENT_SYSTEM_PROMPTS` touches all seven agents and changes cache_control on a prompt already under the 1024-token minimum. Highest blast radius, lowest day-one value. Design intact on the backlog.
- **Accepted** three programmes rather than one with three phases — forced by the NOT NULL `start_week_iso` and `UNIQUE (programme_id, day_of_week, slot)`. "The PTP" survives only as a name prefix.
- **Accepted** a fourth migration for the data seed (precedent: 0055/0056 seed Luke's programmes the same way, and seeding by migration is what makes the programme survive a restore).

## What the work turned up

Detail is in `claude/spec-fitness.md`, `claude/spec-health.md` and the schema-integrity section of `claude/backlog.md`. The headline:

**`supabase/migrations` did not describe a runnable database.** Eight columns read and written by application code were created by no migration; a restore from history would have produced a schema where `/api/fitness/today` 400s on its first query. 0097 closes the fitness-table instance only. This means the DB backup item and P10's Part 0 gate were both resting on an artefact that had never been proven to reconstruct a working system — the gate was measuring whether a dump existed, not whether replaying it works. Fix on the backlog: a CI step that replays from zero into a scratch DB and boots the app.

Also found: archiving a programme does nothing (Today never filters `archived_at`); `exercise_pain_logs` cascades off `workout_sessions`, so deleting a logged session destroys the evidence the phase gate depends on; `0032_workouts_library.sql`'s "deprecated" comment about `workout_programme_exercises` is false and cost real time; Supabase `.select()` strings are invisible to TypeScript, which had already produced two live rendering bugs.

## Process notes for next time

- The Phase 0 recon-then-propose split was worth it — it caught the drift, the FK rules and the archive behaviour before anything was written, and every one of those changed the plan.
- Don't use migration pushes as a query channel. The FK audit was done by pushing a migration that deliberately raised an exception carrying the result, then deleting it. It worked and cleaned up, but a half-applied push lands in `supabase_migrations.schema_migrations`; the read-only service-role path used earlier in the same session answers the same questions safely.
- Claude Code cannot read this project's docs, so any prompt sent to it must be self-contained.
