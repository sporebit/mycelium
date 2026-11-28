# Dossier: E.fit, Fitness and health (MYC)

*Written 2026-11-28 for the run's Stream T. Health threads beyond the ones Round 3 (H5) names are not ticketed. Nothing in this dossier is medical advice. One ticket in this epic is owner-only and private; this dossier describes it only by its handling rules (section 2, last bullet).*

## 1. What Phil decided

The PTP (the programme planned with Kirsty) is paused or stopped: one ticket to restart it with her from wherever makes sense. Tickets also for: the supplements schedule, whose first step is Phil giving his list; one settled set of nutrition targets and the review that is due (September's figures replaced the earlier trainer's and stand); Joe's rehab sessions and the excluded lifts saved into Fitness so the only copy is not an old chat. The May workout logger page is retired; one ticket checks whether its rest timer and Apple Watch interval lists are worth copying first. One private habit, owner-only, never on the wall, never shared, not in any shared export. The existing ticket PW-23 (write the review for Joe PT) is linked, not recreated.

## 2. His kit and constraints

- **Fitness in Mycelium** (`claude/spec-fitness.md`): programmes, phases and sessions; Today, history, pain logs, the coach chat, the offline `/workout-now` page, voice logging, an Apple Health bridge for body metrics. The rest timer (chime and vibration logic frozen) and supersets exist.
- **PTP state (2026-10-29):** `PTP, Phase 1: Restore and Stabilise` active since 2026-W37 with an open end week, five sessions Monday to Friday afternoon, 41 template exercises; no sessions in the seven days before 2026-10-29. Phases 2 and 3 exist as programme records without phase rows. Authoritative plan: `docs/ptp-plan.md`; the Phase 1 to 2 procedure is in `docs/ptp-report.md`. The backlog still carries "confirm and close" for the 09-15 cutover and an unrecorded week-3 review.
- **Nutrition targets** (`claude/spec-health.md`, 0098): one versioned row effective 2026-09-07 with a review date of 2026-09-28: 2600 kcal, 200 g protein, 80 g fat, 270 g carbs, 30 to 35 g fibre, 2.5 to 3 L water, from Kirsty's plan with Phil's protein amendment. The nutritionist agent sees the past review date on every turn until a newer row supersedes it. Water is not logged anywhere.
- **Supplements** (`/health/supplements`, 0041, 0080, 0081, 0084): a seeded schedule and a daily checklist exist; the list itself is Phil's to give.
- **Pain and rehab:** `exercise_pain_logs` exist; there is no store for a physio's session notes or an "excluded lifts" list other than programme notes and `workout_programmes.guardrails` (0099), which renders as a pinned banner in the log.
- **Sharing:** Kirsty's planned direct grant (after the UI rebuild) covers Work/tickets, Fitness and Day log as view. So anything in Fitness, and any MYC ticket, will be visible to her once the grant exists. Finance and platform are the only sections a grant can never cover (`claude/spec-access.md`).
- **Exports:** the MYC backlog export (`/api/tickets/export?project=MYC&format=backlog-md`) is written into `claude/backlog.md` in the git repository by the weekly run; the space export at `/other/export` is Phil's own.
- **The private ticket (fit.06):** its ticket text stays neutral because MYC tickets are visible to the planned grant and are exported to the repo. The build keeps the habit out of every surface listed above: no Fitness or Health page, no tile, no wall panel, no briefing line, no shared or team export, no backlog export beyond the neutral title, no agent memory shared with another person. Details live only in Phil's head and in the private store the build creates.

## 3. What the research found

- **Restart after a break (fit.01):** the repo's own procedure (`docs/ptp-report.md`) covers moving phases. The safe default when restarting after weeks off is to resume at Phase 1 rather than step up (general training practice, UNVERIFIED as a source in this run; the ticket asks Kirsty and Phil to choose).
- **Expired targets (fit.03):** the targets table supports a new row with a new `effective_from` and `review_on`; backdating was ruled out on 2026-09-06 and stays ruled out.
- **Rehab record (fit.04):** two places fit without a new table: the programme's `guardrails` (shown as a pinned banner while logging) for the excluded lifts, and a Docs page or the programme description for the session notes. A per-exercise "excluded" flag would be a new build; written as an option, not chosen.
- **The May logger (fit.05):** Mycelium's rest timer already exists (default 90 s, minimise state remembered); the check is whether the May page's interval lists for the Apple Watch add anything.
- No web research was needed for this epic: every ticket is about Phil's own data and the app.

## 4. Risks

| Risk | Mitigation the tickets carry |
|---|---|
| Injury: restarting at the old intensity | fit.01 restarts from wherever makes sense, chosen by Phil and Kirsty; fit.04 puts the excluded lifts where the log shows them |
| Data loss: the rehab notes exist only in an old chat | fit.04 copies them into the app first; the chat is not deleted in this run |
| Privacy: the private habit reaches Kirsty, the wall, the repo or an export | fit.06 neutral title and description; owner-only store outside Fitness and Health; checked against each surface in its Done list |
| The nutritionist keeps quoting a past review date | fit.03 writes a new row with a new review date |

## 5. Facts that differ from the plan

- **fit.06:** the plan's title names the habit, and the plan sits in the repo. The ticket is written with a neutral title. Suggest the integrator rewrites the plan line to the neutral title too, and that the create script does not copy plan notes into the ticket.
- **fit.06:** Kirsty's planned grant covers Fitness and Work/tickets, so "owner-only" means a store that grants cannot reach (the same shape as Finance), not a flag on a Fitness or ticket row. The ticket says so.
- **fit.03:** the review date on the current targets row is 2026-09-28. The plan's wording is accurate; the ticket says "due since 28 September" to keep to the brief's wording rules.
- **fit.01:** the backlog's open "confirm and close" for the 09-15 PTP cutover and the unrecorded week-3 review are folded into fit.01's What.

## 6. Sources

No external sources were needed. Repo files read: `claude/spec-fitness.md`, `claude/spec-health.md`, `claude/spec-access.md`, `claude/backlog.md` (Fitness, PTP import), all checked 2026-11-28.
