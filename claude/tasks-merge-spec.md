# Tasks + Tickets merge and the dates list (Phil, 2026-09-25)

Build the Tasks + Tickets merge and the dates list in the Mycelium repo. Do this BEFORE the 0137 statuses/When revision in claude/tickets-spec.md §18.

## Start
1. git pull. Read AGENTS.md and claude/tickets-spec.md (§4.4, §11, §12, §18). Commit the spec below as claude/tasks-merge-spec.md.
2. File it as a ticket: `tix new "Merge Tasks + Tickets into one surface; dates list" --project MYC`. Reference that key in every commit.
3. Confirm this branch owns supabase/migrations/**. Take the next free migration number. Check both the local chain and `supabase migration list` against hosted. If this takes 0137, renumber the §18 revision to follow it and update §18.

## Decisions (locked, don't reopen)
- **M1** One surface. Tasks and Tickets merge into one page, one sidebar entry, one org-index card and one ⌘K group. The UI label is "Tasks". The code name stays `tickets`: table, /api/tickets, keys, tix, the skill and the webhooks all stay as they are. No rename migration.
- **M2** The 0121 `surface=tickets|tasks` partition becomes a sticky Area chip: All · Technical · Life · a specific project. Default is All. The last choice is stored in ui_prefs.tickets (never localStorage). areas.kind stays, because it drives the chip.
- **M3** The sprint ⚡ chip only shows when filtered to a project that has an active sprint. Sprints are otherwise unchanged.
- **M4** A new sortable table tab covering every ticket, done and cancelled included. Columns: Key · Title · Project · Status · Raised · Started · Finished · Closed. Each date column gets a from–to filter, plus text search on key/title and the Area/project/status filters. Show dates as YYYY-MM-DD HH:MM:SS, Europe/London.
- **M5** Raised = created_at. Started = new tickets.started_at, set once, the first time the category enters `doing`, never overwritten.
- **M6** Finished = completed_at (Done). Closed = verified_at, in its own column. A cancelled ticket shows cancelled_at in Finished with a "Cancelled" marker.

## Build
1. Migration: `alter table tickets add column started_at timestamptz`. Extend the 0117 status-sync trigger to set it when the category becomes `doing` and started_at is null. Backfill from the earliest ticket_activity transition into a doing status. Check the activity data first and report how many were backfilled vs left null; never estimate a date. No new tables, so RLS is unchanged. Replay on the local stack first, then `supabase db push`.
2. API /api/tickets: add created_from/to, started_from/to, completed_from/to, closed_from/to, sort + dir (whitelisted columns), and a list value that includes done and cancelled. Add area/project filters and remove surface= from /api/tickets, /counts, /clarify and the Now query. Add started_at to TASK_SELECT and serializeTask (keep TASK_SELECT as one literal string).
3. UI: one route (pick whichever is less churn; the other redirects). Area chip on every tab. For the table tab, first check whether the old table view (one of the "seven views", opt-in in Settings) still exists, and extend it if it does rather than build a new one. Make the label "Tasks" everywhere users see it.
4. Retire the /api/tasks/* compat routes: grep for every caller, re-point them to /api/tickets, then delete the routes.
5. Tests: unit-test the date-filter parsing and the started_at trigger (first entry sets it; leaving and re-entering doing does not change it). npm test and npm run isolation-test must pass.
6. Build gate before every push: rm -rf .next && npx next build. Push to main and smoke-test on production.

## Finish
- Add a repo template smoke-test-tasks-merge (kind = test, house style, Fibonacci points) and instantiate it as Phil's live-check ticket. It should cover: one sidebar entry, the Area chip is sticky, sprint chip only on a project, the table's sort and each date filter, a ticket's Started date set on first In Progress and unchanged after bouncing back, Closed shown after Close, a cancelled row marked, and the old /organisation/tickets URL redirecting.
- Update claude/tickets-spec.md (§11 params, §12 pages, a note that the 0121 split was reversed), claude/spec-organisation.md, and claude/tasks-merge-spec.md (record the route you kept, the migration number and the backfill counts).
- Report with `tix comment <key>`: commit hashes, migration number, backfill counts, smoke result, anything you had to do differently from this spec. No code in the report. Move the ticket to Done with the deploy evidence; leave Closed for Phil.

## As built (2026-09-25, MYC-163)

- **Route kept: `/organisation/tasks`.** `/organisation/tickets` (the index only) redirects to it; `/organisation/tickets/[key]`, `/review`, `/sprints` and `/templates` keep their URLs because keys, Telegram replies, webhooks and `tix` link to them. The page is `components/tickets/TasksHome.tsx`; the classic client (`components/compost/TasksClient.tsx`) is its Board tab and still honours `?task=` `?focus=` `?view=` `?filter=`.
- **Migration: `0139_tickets_started_at.sql`** (the §18 revision had already shipped as 0137 on 2026-09-23 and the hosted DB was at 0138, so nothing was renumbered). Replayed on the local stack, then pushed. **Hosted backfill: 166 tickets; 28 `started_at` set from the earliest `ticket_activity` transition into doing (`status_id → doing` or legacy `status → in_progress`); 138 left null** — 73 never started (`new`), 53 completed and 10 cancelled before status moves were logged (May–June rows predate `ticket_activity` status logging), 2 in review that went from Next straight to Verify via the GitHub merge webhook. No date was estimated.
- **API:** `lib/tickets/dateFilters.ts` (ranges, sort whitelist, London formatting; 6 unit tests), `lib/tickets/area.ts` replaces `lib/tickets/surface.ts`; `/api/tickets` gains `list=all`, `status_id`, `area`, the eight date bounds, `sort` + `dir`; `surface=` is gone from `/api/tickets`, `/counts`, `/clarify`, the Now query and `/api/projects` (now `area=technical|life`). `started_at` is in `TASK_SELECT` (one literal) and `Task`. `GET /api/tickets/[key]` carries `linked_captures`; `POST /api/tickets` and `bulk` accept the classic views' legacy columns; `/api/tickets/smart`, `/top-today` and `[key]/comments/[commentId]` moved in from `/api/tasks`.
- **Table tab:** the old table view (`components/compost/TaskTableView.tsx`, one of the seven views, hidden from the switcher since 2026-09-23) was extended, not rebuilt: Raised · Started · Finished · Closed columns, a `columns` prop, server sort through `onSortChange`, sub-task rows. The Status filter is by category (the eight categories), since statuses are per-workflow rows.
- **Sprint chip (M3):** shown only when the Area chip is a project and the Now candidate set carries a ticket in an active sprint; the `now_sprint_only` preference only applies then.
- **Tests:** `lib/tickets/dateFilters.test.ts` (parsing, London day bounds incl. the clocks-change days, sort whitelist, formatting) and `lib/tickets/startedAt.test.ts` (trigger on the local stack: first entry sets it, leave-and-return keeps it, a legacy `in_progress` write also sets it). `npm test` 296/296; isolation test result in the ticket comment.
- **Deviations:** the ordering clause ("before 0137") could not apply; `ContextSwitcherGate` (the classic NOW bar) still keys on the `/organisation/tasks` path, so it shows above every tab, not only the Board; the `ideas`/`decisions` and dashboard links that pointed at `/organisation/tasks?task=` were already right and were left alone.
