# Dossier: E.tracker, Time allocation tracker (MYC)

*Written 2026-11-28 for the run's Stream T. Sources are numbered in section 6; each was checked on 2026-11-28.*

## 1. What Phil decided

Build Rob Dyrdek's time allocation system in Mycelium: calendar time colour-coded into categories (work, family, health, personal) against weekly targets, with a quarterly review. It is ticketed under MYC with a question round first: which categories, what targets, and where the hours come from. `[claude]` flagged once and not reopened: section 11b dropped "what next" as a 2027 priority and named "I kept building it instead of using it" as the risk; this is a new build.

## 2. His kit and constraints

- **Calendars:** Google Calendar sync into Mycelium exists but has been unproven since the token expired on 2026-06-24; the reconnect is MYC-181 (the `bad_state` fault was fixed on 2026-11-23) and the Google set-up checklist is MYC-207. The Family calendar on Google was built on 2026-11-22 (0184).
- **Four-Day Week tracker (MYC-176, live checks MYC-177):** `/organisation/hours`, tables `hours_*` (0156, 0157) under `organisation.hours`, in Phil's personal space and never shared by a team grant. Durations are logged without start or end times (integer minutes per entry, per date). It holds his employer hours against 37:30 Monday to Thursday. Every figure is derived, never stored.
- **PC worker:** the PC monitoring agent (MYC-187, `docs/pc-monitoring-plan.md`) can see active time on the PC; whether it should feed categories is a question for tracker.01.
- **Owner-only:** time by category touches family and health; Kirsty's planned direct grant covers Work/tickets, Fitness and Day log, not this. The tracker is not on the wall unless Phil says so in the question round.
- **Hosting:** Vercel Hobby (daily crons only), so any calendar pull is daily or on page load.

## 3. What the research found

### 3.1 The system as publicly described
- Dyrdek describes designing his time first and building work and money around it, with a yearly cadence that blocks time for essentials [1][2].
- He blocks every category of his life into his calendar and had a developer build a Google Calendar plug-in that shows the split on a dashboard [3][4].
- He scores how he feels about life, work and health from one to ten each day [3].
- The published split varies by source: roughly 30% sleep, 30% family, 30% work and 10% health in one telling; seven hours sleep, seven work, two on the body and seven with family and friends in another; "about 22% working" in a third [3][4][5]. These are his averages over time, not a prescription. UNVERIFIED against a primary source.
- No source confirms a colour scheme; colour-coding is Phil's own requirement.

### 3.2 Options for tracker.01 (where the hours come from)
1. **Calendar only:** events carry a category (by Google calendar, by colour, or by a keyword); the tracker sums event durations per category per week. Needs MYC-181. Simple; misses anything not on the calendar.
2. **Calendar plus the Four-Day Week log:** work hours come from `hours_entries` (already logged by hand), everything else from the calendar. Avoids double entry for work. The hours log has no start time, so it cannot sit on a timeline, only in the weekly totals.
3. **Calendar plus the PC worker:** active PC time fills the "work" or "personal" bucket automatically. Privacy and accuracy questions; more build.
4. **Sleep:** Dyrdek counts sleep; Phil's four categories do not. Whether sleep is a category, and whether it comes from the Apple Watch via the Health bridge, is a question for the round.

### 3.3 What already exists to reuse
- The derived-figures pattern and the spreadsheet-row editing in `lib/hours/` (Phil prefers in-place cells with Enter and Tab movement).
- The weekly-target and pace calculations (`lib/hours/calc`) generalise from one target to one per category.

## 4. Risks

| Risk | Mitigation the tickets carry |
|---|---|
| "I kept building it instead of using it" (Phil's own risk) | tracker.01 comes first and is one 15-minute sitting; tracker.02 is a single build slice; tracker.03 is a quarterly review that checks use, not features |
| The calendar feed is not working (token expired June 2026) | tracker.02 depends on MYC-181; the build reads the calendar only after a successful sync |
| Double counting work hours (calendar events and the hours log) | tracker.01 decides one source per category |
| Privacy: family and health time visible to others or on the wall | owner-only, personal space, not on the wall unless Phil says so |

## 5. Facts that differ from the plan

- **tracker.01:** the plan's sources list is calendar, the Four-Day Week tracker and the PC worker. Calendar sync has been unproven since 2026-06-24, so tracker.02 must wait for MYC-181 as well as tracker.01. Added as a dependency.
- **tracker.01:** Dyrdek's published split includes sleep; Phil's four categories do not. Raised as a question, not a change.
- **tracker.03:** the first quarterly review date is not set by the plan (correctly, Backlog). The audit's cadence starts when tracker.02 ships.

## 6. Sources

1. https://lewishowes.com/podcast/how-to-design-a-life-that-runs-without-you-rob-dyrdek/, School of Greatness: How to design a life that runs without you, checked 2026-11-28
2. https://www.shortform.com/podcast/episode/the-school-of-greatness-2026-07-31-episode-summary-how-to-design-a-life-that-runs-without-you-rob-dyrdek, episode summary, checked 2026-11-28
3. https://www.inc.com/bryan-elliott/behind-brand-with-rob-dyrdek.html, Inc.: Behind the brand with Rob Dyrdek, checked 2026-11-28
4. https://workweek.com/2022/12/14/what-does-your-calendar-say-about-your-priorities/, What does your calendar say about your priorities, checked 2026-11-28
5. https://www.aol.com/news/rob-dyrdek-cracked-code-human-161221924.html, Rob Dyrdek has cracked the code for human efficiency, checked 2026-11-28
