# Four-Day Week Tracker — build spec

*Written 2026-11-19 (Cowork, Everlight project) from Phil's Excel tracker and the chats that built it (Sep–Nov 2026). Status: **§8 answered 2026-11-19; parts 1–4 built and live by 2026-11-20 (MYC-176, live checks MYC-177); see §12. Part 5 (the parallel run, D4) is Phil's.** Decisions below are Phil's unless marked recommended.*

Private companions, gitignored and absent from worktrees, read by absolute path:
- `A:\Projects\Mycelium\imports\private\four-day-week\seed.json` — every log entry, absences, bank holidays, settings, check figures
- `A:\Projects\Mycelium\imports\private\four-day-week\data-notes.md` — acceptance table and known problems in the source data

Nothing from those two files goes into a migration, a fixture, a test snapshot or any other committed file.

## 0. Decisions taken 2026-11-19

| # | Decision |
|---|---|
| D1 | **Exception to tickets-spec decision 3 ("Everlight work stays out").** Hours tracking for Phil's Everlight job comes into Mycelium. The exception covers hours, a free-text description and a ticket key per entry. Everlight tickets are still not imported into Work, and no Everlight system is connected. Record this in the decision log. |
| D2 | **No Jira connection in v1.** Not cleared with Everlight. If it ever happens it is read-only. Design notes parked in §9. |
| D3 | **Ticket keys are still hyperlinks.** Key + a configurable base URL (value in the seed). Link only, no fetch. |
| D4 | **The workbook retires**, after Phil has run both in parallel and is happy the figures agree. Until then the workbook stays the record. |
| D5 | **Export and import are in scope** (§6). |

## 1. What this is

Phil works a compressed week: contracted 37:30 worked Monday to Thursday, Friday off. The tracker (a) tells him at any moment how much is left and when to stop, (b) decides at Wednesday lunchtime whether to confirm Friday off to his team, and (c) evidences his hours to his team lead.

He logs the same time in his employer's Jira by hand. This tracker is his own running record; "Logged" on an entry is his tick that he has also put it into Jira.

## 2. The rules (agreed Sep 2026)

| Rule | Detail |
|---|---|
| Weekly target | 37:30, Mon–Thu. Breaks not counted. Configurable. |
| When | Fully flexible (e.g. 05:00–08:00, then later blocks). Only the total matters. Durations are logged without start/end times. |
| Friday | Off if the target is met by close of Thursday. Standing expectation, not a weekly request. |
| Surplus | Lost. No rollover, no TOIL. Resets Monday. |
| Shortfall | Friday owes the remainder only, never a full day. Worked Friday morning. |
| Bank holiday / annual leave / sick | Credits a standard day (7:30) on that date. Bank holidays automatic; absences entered by hand. |
| Wednesday 13:00 checkpoint | Send the Friday block-out only if banked hours ≥ threshold (25:00, configurable). |
| Non-ticket time | Goes on a catch-all ticket (keys in the seed), so every entry should carry a ticket. |
| Review | A review date = tracking start + N weeks (6). Informational. |

## 3. Calculations

All values in minutes. `target` = contracted minutes per week (2250). `stdDay` = 450. Display convention: `h:mm (0.00h)`, e.g. `33:40 (33.67h)`. Daily boundaries Europe/London, as everywhere else in the app.

**Per day `d`**
- `logged(d)` = Σ minutes of entries dated `d`
- `credited(d)` = (`stdDay` if `d` is a bank holiday) + Σ absence minutes on `d`
- `dayTotal(d)` = `logged(d)` + `credited(d)`
- `dayTotalLogged(d)` = Σ minutes of entries on `d` ticked Logged; `notYetLogged(d)` = Σ of those not ticked
- `fourDayPct(d)` = `dayTotal / (target/4)`; `fiveDayPct(d)` = `dayTotal / (target/5)`

**Per week (Monday `w`)**
- `banked` = Σ `dayTotal` Mon–Thu; `weeklyPct` = `banked/target`
- `remaining` = max(0, `target − banked`); `surplusLost` = max(0, `banked − target`)
- `friWorked` = `logged(Fri)`; `fridayOwed` = `remaining`; `stillOutstanding` = max(0, `fridayOwed − friWorked`)
- History status: future week blank; `In progress` while `w+3 ≥ today`; else `Met` if `banked ≥ target` else `Short` (see open decision O2)

**Banner**
- `banked ≥ target` → `STOP - 37:30 MET, FRIDAY IS CLEAR`
- `remaining ≤ 60` → `ALMOST THERE - <remaining> LEFT THIS WEEK`
- else `<remaining> LEFT TO WORK THIS WEEK`

**Today panel**
- `flatDailyTarget` = `target/4` (562.5 minutes, shown as 9:22; keep the half minute in percentage maths)
- `daysLeftInclToday` = 0 after Thursday, 4 before Monday, else `Thu − today + 1`
- `evenPaceToday` = 0 if `daysLeftInclToday` = 0, else max(0, (`target` − Σ `dayTotal` of Mon–Thu days before today) / `daysLeftInclToday`)
- `leftToday` = max(0, `evenPaceToday − dayTotal(today)`). The workbook used `logged(today)` here, which told him to keep going on a leave day; do not copy that.
- Pill: week met → `WEEK COMPLETE - STOP`; outside Mon–Thu → `OUTSIDE MON-THU`; `leftToday` = 0 → `TODAY DONE - <remaining> LEFT THIS WEEK`; else `KEEP GOING - <leftToday> LEFT TODAY`

**Wednesday checkpoint**: `shortfall` = max(0, `threshold − banked`). Pill `SEND BLOCK-OUT` when `banked ≥ threshold`, else `HOLD - <shortfall> SHORT`. No clock logic: he reads it at the moment he decides.

**Friday panel**: `fridayOwed` = 0 → `FRIDAY IS CLEAR`; `stillOutstanding` = 0 → `SHORTFALL COVERED`; else `WORK <stillOutstanding> ON FRIDAY`.

**Pace**: to Thursday = `remaining` / days from tomorrow to Thursday (`-` on Thursday). Including Friday = max(0, `target` − Σ `dayTotal` Mon–Fri) / days from tomorrow to Friday.

**Checkpoint trade-off table** (Settings): for thresholds 20:00, 22:30, 25:00 → Mon and Tue each = (`threshold` − 210)/2; Thursday = `target − threshold − 300`. Assumes 3:30 worked Wednesday before 13:00 and 5:00 after.

**By ticket**: entries with a key, grouped by key, Σ minutes, sorted descending; `% of week` = minutes/`target`; per-ticket not-yet-logged. Two scopes: current week, and any From/To range (blank = all time, `%` is of the range total). Description = the first entry description for that key. The weekly view ends with a `No ticket` total for entries with time and no key.

**Backlog (open work)**: any entry with a description or ticket and no Time Spent. Optional Estimate. May have no date. Dashboard shows open items, total estimated, count without an estimate. Filling in Time Spent turns it into a normal entry.

**Entry state**
- Green: time, description and ticket present, ticked Logged
- Red: started and (no description or no ticket). Phil's call: an entry with no ticket is unfilled.
- Amber: has time, not ticked Logged
- Open (no time): neutral, its own state

**Ticket field and links**: accepts a URL or a key. If it contains `browse/`, the key is what follows, up to any `?`. Otherwise the trimmed text is the key. Display the key as a link: the original URL when one was pasted, else `ticketBaseUrl + key`. A URL with no `browse/` (one exists in the data) is shown as a plain "link" and excluded from by-ticket grouping by key.

## 4. Data model

Follow the repo: `app.register_table`, the 0111 policy and grant loop, `created_by`/`space_id`, `useApi`/`mutateApi`, `ui_prefs`, next free migration number. This data sits in Phil's personal space and is never shared by a team grant.

**Naming:** do not use the `work_` prefix or sit under `/work`. Work is the Jira-style issues section and already owns `work_*`; this is a different thing. Suggested prefix `hours_`. Backlog line "v1.1 work logging + estimates" is about Mycelium's own issues and is not this feature; note the overlap, do not merge them.

Principle carried over from the workbook: **data is entered in one place; every figure is derived, never stored.** Integer minutes.

- `hours_settings` (one row): `contracted_minutes_per_week`, `standard_day_minutes`, `checkpoint_threshold_minutes`, `tracking_start`, `review_length_weeks`, `wed_minutes_before_1300`, `wed_minutes_after_1300`, `ticket_base_url`, block-out recipients / subject template / body lines
- `hours_entries`: `entry_date` date null, `minutes` int null, `estimate_minutes` int null, `description`, `ticket_raw`, `ticket_key` null, `logged` bool, `source` (manual / import), `source_row` int null, soft delete
- `hours_absences`: `absence_date`, `type` (Annual leave / Sick / Other), `minutes`
- `hours_bank_holidays`: `holiday_date`, `name`. England and Wales; refreshable from `https://www.gov.uk/bank-holidays.json` (division `england-and-wales`)
- `hours_import_runs`: when, file, counts, enough to undo the last import

Validation: Time Spent and Estimate between 0 and 24 hours. New entry date defaults to the date of the last entry made, else today.

## 5. Screens

| Workbook tab | In Mycelium |
|---|---|
| Dashboard | Landing view: banner, This week, Today, Wednesday checkpoint, Friday, By day, Pace, Open backlog |
| Log | The only data-entry surface: fast add, inline edit, entry states, filter/sort, Logged tick, ticket link |
| Backlog | Filter of the Log (no time yet), with Estimate |
| Daily | This week and last week by day: Logged, Credited, Day total, Day total logged, 4 day %, 5 day %, Cumulative, Not yet logged |
| History | One row per week since tracking start: Mon–Thu by day, weekly %, surplus lost, shortfall, Fri worked, not yet logged, status |
| Tickets | By ticket: this week, and any date range |
| Settings | Targets, absences, bank holidays, ticket base URL, block-out text, week picker for old weeks |
| Rules | Static help: §2 |

Speed of entry matters more than anything else on the Log: he averages about 10 entries a day (over 20 on a busy one) and wants it usable from the phone.

**Do not port** (Excel workarounds): row caps, hidden helper columns, sheet protection, the "week override" cell (use a week picker), the Jira Paste / Jira Archive / Jira Check tabs and their macro, Daily's Jira reported and Variance columns, the Outlook macros.

## 6. Export and import

The risk to design against: if an export can be edited in Excel and imported back, there are two masters again. So:

- Database is the master. Export is for evidence and backup. Import is for the migration, restores and bulk edits.
- Every exported row carries its `Entry ID`. Import upserts by that id. A row with no id is inserted unless an identical row (date, minutes, description, ticket) already exists.
- Import never deletes because a row is missing from the file.
- Always a dry run first: added / changed / unchanged / conflicts, then confirm. One transaction. Recorded in `hours_import_runs`. Undo last import.
- Conflict = the row changed in Mycelium after the file was exported. Show both, let Phil pick.

Formats:
- `.xlsx`: tabs Log, Absences, Bank Holidays, Settings, Weekly History. Plain values. Headers in Title Case with no underscores (`Time Spent`, `Entry ID`). Dates `YYYY-MM-DD`, datetimes `YYYY-MM-DD HH:MM:SS`. Durations as both `Time Spent` (h:mm) and `Minutes`; import trusts `Minutes` when present.
- `.json`: lossless full backup, same shape as the seed.
- First load: the seed, through the same import path (so the dry run is exercised on real data). `sourceRow` is the workbook row and makes that load idempotent.
- Parallel run (D4): while the workbook is still the record, Phil needs to bring a week of workbook entries across without retyping. Accept a paste or upload of the workbook's Log columns: Date, Time Spent, Estimate, Description, Ticket, Logged (`x`).

## 7. Decisions already made in the workbook (do not re-litigate)

- The Log stays plain: Date, Time Spent, Description, Ticket, Logged. Phil rejected a visible ID column, a Status/Voided column and typing worklog ids. Database ids are invisible, so that still holds.
- Durations only, no start/end times.
- Hours, not entry counts.
- An entry with no ticket is an error state.
- Credited is one figure (bank holiday + absence), not two columns.
- No separate "Review" view; History covers it.
- Backlog is derived from entries with no Time Spent, not a separate list.

## 8. Open decisions — answered by Phil 2026-11-19

| # | Question | Recommended | **Decided** |
|---|---|---|---|
| O1 | Where does it live in the nav and what is the route? | Own top-level entry, not under Work | **Under Organisation: `/organisation/hours`, nav entry "Hours" in the Organisation section.** Access group `organisation.hours`. |
| O2 | History when Friday covers a shortfall: the workbook says `Short` regardless | Add `Covered on Friday` when `friWorked ≥ shortfall` | **Add `Covered on Friday`** when `friWorked ≥ shortfall`. |
| O3 | Friday block-out from a web page (the workbook drove desktop Outlook) | mailto link built fresh each time, plus a downloadable `.ics` for the calendar entry; or leave the block-out in the workbook for now | **mailto link built fresh each time, plus a downloadable `.ics`.** Nothing is sent by Mycelium. |
| O4 | Does the Today tile / home surface show the banner? | Yes, Mon–Thu only | **Yes, Mon–Thu only** (a Glance tile on the Today surface). |
| O5 | Capture by Telegram (e.g. `/h 0:45 ABC-123 description`) | Later, after the parallel run | **Later, after the parallel run.** Follow-up ticket once the workbook has retired. |

## 9. Parked: Jira (D2)

Not in v1 and not to be started without Phil saying Everlight has agreed. If revived: read-only, server-side token, worklogs matched to entries at date + ticket level, a derived "In Jira" state (Yes / Partial / No) alongside the manual Logged tick, and Jira reported + Variance columns on Daily. Leave room for it (`ticket_key` is already the join); build none of it.

## 10. Acceptance

`data-notes.md` holds the per-week figures the History view must reproduce from the seed, to the minute, for every completed week, plus the totals. They were recomputed independently and match the workbook's own History tab for all 11 weeks.

## 11. Build order

1. ✅ Migration, register tables, import path with dry run, seed load, History view. Stop and check §10.
2. ✅ Log: add, edit, states, ticket links, Backlog filter.
3. ✅ Dashboard, Daily, Tickets, Settings (+ Rules, the Today glance tile).
4. ✅ Export; workbook-column paste/upload for the parallel run.
5. Parallel run by Phil. Workbook retires on his say (D4).

## 12. As built

- **2026-11-19, part 1 (MYC-176):** migration `0156_hours.sql` (five `hours_*` tables under `organisation.hours`, `hours_apply_import` / `hours_undo_import`, self-check), `lib/hours/` (types, ticket parsing, every derived figure, the import planner; 35 unit tests on synthetic data), `/api/hours/bundle`, `/api/hours/import` (+ `/undo`), `scripts/hours-import.mjs`, pages `/organisation/hours/history` and `/organisation/hours/settings` (Import card), nav entry under Organisation. Not-yet-logged on History counts every unlogged entry dated in the week (Mon–Sun); the check figures agree with all three readings. The Confluence-URL row keeps no key (§3 rule) so the distinct-key count is 135.
- **2026-11-19/20, parts 2–4 (MYC-176, commits `8c82d6c`, `e69f939` and the import commit after):** the seed was applied to hosted through the import route (run `2c729286`, 460 rows). Then, in the order of §11:
  - **Log** `/organisation/hours/log` (`components/hours/LogView.tsx`): fast-add bar (date defaults to the last entry's date, Time accepts `0:45` / `45` / `1.5h`, Enter adds, cursor returns to Time), rows grouped by day newest first with the day total and credit, state pip (green / amber / red / open per §3), Logged tick in place, ticket link (D3), click-to-edit in place with Estimate and Delete (soft). Filters: This week / Last week / Week of… (any date) / All, state (All / Not logged / Incomplete / Open), search, sort. `POST /api/hours/entries`, `PATCH|DELETE /api/hours/entries/[id]`; `lib/hours/entry.ts` reads both (ticket key derived server-side, never trusted). **Backlog** `/backlog`: the open-item filter with Estimate and totals.
  - **Dashboard** `/organisation/hours` (`DashboardView.tsx`): banner, This week, Today (pill, even pace, left today), the checkpoint card with **OPEN BLOCK-OUT EMAIL** (mailto built fresh, `lib/hours/blockout.ts`) and **CALENDAR .ICS** (all-day, free, stable UID per Friday) — O3; Friday card; By day (Mon–Fri with 4-day and 5-day %); Pace; Open backlog. **Daily** `/daily`: this week and last week by day with cumulative Mon–Thu. **Tickets** `/tickets`: this week (% of target, No ticket row) and any From/To range. **Rules** `/rules`: §2 with live figures. **Today glance tile** (O4): `GET /api/hours/glance`, Mon–Thu only, hidden where no tracker exists.
  - **Settings** (`SettingsView.tsx`): targets and checkpoint with the trade-off table (`PATCH /api/hours/settings`, `lib/hours/settings.ts`); absences (`POST /api/hours/absences`, `DELETE …/[id]`, one row per date, default a standard day); bank holidays with **REFRESH FROM GOV.UK** (`POST /api/hours/bank-holidays/refresh`, England and Wales from the tracking start's year, never overwrites) and manual add/remove; ticket base URL and catch-all tickets (offered as suggestions in the Log's Ticket field); block-out recipients / subject (`{dd/mm/yyyy}`) / body; Export; Import.
  - **Export** `GET /api/hours/export?format=xlsx|json` (`lib/hours/export.ts`, exceljs): xlsx tabs Log (with Minutes and Entry ID), Absences, Bank Holidays, Settings, Weekly History; JSON is the lossless import shape with ids and `exportedAt`.
  - **Import** now takes three sources through the one planner: JSON backup, **paste of the workbook's Log columns** (Excel copy = tab-separated; header row optional; dates `19/11/2026` or ISO; Logged `x`) and an **.xlsx** (Log sheet or first sheet; the export's Entry ID column makes it an upsert). `lib/hours/paste.ts` reads both by header alias; unreadable rows are listed by row number and block APPLY like any rejected row.
  - Tests: 62 unit tests over `lib/hours` (calc, import, ticket, entry, settings, blockout, paste). `isDateKey` now refuses rolled-over dates (31 Feb).
  - **2026-11-20, spreadsheet rows (Phil: "click and edit each row like it's an Excel sheet"):** `EntryRow.tsx` rebuilt so every cell is an input that reads as text until focused — Date, Time, (Estimate on Backlog), Description, Ticket, Logged. A cell saves when it loses focus or on Enter; Enter / Shift+Enter move down / up the same column across day groups, Tab moves across, Esc reverts; a refused value (bad duration) stays red and is not saved. Column header above the list; delete is the × at the row end. The separate edit form is gone.
  - Not built, by decision: Jira (D2, §9), Telegram capture (O5, after the parallel run), a visible ID or status column (§7).
