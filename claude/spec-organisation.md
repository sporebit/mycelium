# Spec — Organisation (Compost)

*Crawled 2026-08-29. The daily driver — highest-traffic surface; component dirs still named `compost/`. (?) = inferred. Quotes section added 2026-09-14 (planned, not built). Day-log touchpoints on People and Captures added 2026-09-14 (planned, not built — spec `claude/daylog-spec.md`).*

## Tasks (`/organisation/tasks`)

Seven views (list, smart, category, kanban, table, calendar, +1) via SegmentedControl in a scroll wrapper; split-pane detail (Sheet), TaskDrawer (bottom sheet on mobile), comments + activity log, subtasks (0004), task quality (0027), status machine (0024), keyboard shortcuts (TaskShortcutHelp lists them — FROZEN), URL param sync (wins over ui_prefs hydration), drag-to-schedule, NOW filter (`lib/compost/now-filter.ts` — FROZEN scoring), bulk actions via `/api/tasks/bulk` (whitelists status/urgency/due_date/project_id, all-or-nothing, logs activity). Mobile: swipe right = done, swipe left = reschedule Sheet, long-press = bulk. Routes: `/api/tasks` (+`[id]`, `[id]/comments`, `bulk`, `smart`, `top-today`). `rebuildTaskMentions()` maintains people-mentions.

## Projects, People, Decisions, Purchases

- **Projects** (0014): `/organisation/projects`, `/api/projects`.
- **People** (overhaul 0010): profiles, aliases, mentions, review queue, import (Excel supported via shared `isExcel`/`excelToCsv`), migrate. `/api/people/*`. **Planned:** a Quotes tab on the detail page and a quote count on list rows (see Quotes below). **Planned (Day log):** a **Days** tab on the detail page — `people_daylog_stats` view (days together, first/last seen), scene timeline, facts + preferences learned in passing, places + food together, milestones — via `/api/people/[id]/days`; a `days_together` count on list rows; `people.linked_user_id` + `/api/people/[id]/link` (only a user who shares a team with the caller) so that user sees scene basics they were part of. Quotes spoken during a day route into the Quotes pipeline as pending kind `quote`.
- **Decisions**: `/organisation/decisions` (table from 0001 or captures kind (?)).
- **Purchases** (0017/0018): shopping vs wishlist `list_type`, want/need, urgency, project link, category (0085), kind-conversion + soft delete (0029), context fields (0030). `/organisation/purchases`.

## Receipts (NEW — built w/c 2026-08-24)

Tables `receipts`, `receipt_images`, `receipt_lines` (0092; title 0093); private `receipts` storage bucket, signed URLs. Upload (drag-drop/multi-image) → Claude vision parse (`lib/receipts/parse.ts`) → editable line table; statuses parsed / needs_review / no_total / total_mismatch; reconciliation rule extracted to `lib/receipts/reconcile.ts` (pure, unit-testable); reparse endpoint. Amounts render via `<Num>` (masking differs slightly from Spending's `<Money>` — flagged, accepted). Page `/organisation/receipts`; routes `/api/receipts` (+`[id]`, `[id]/lines/[lineId]`, `[id]/reparse`). Known caveats (phase 2 report): no edit-guard during `parsing`; no runtime tests; **whether 0092 was ever `db push`ed is uncertain** — pcmon session later repaired migration drift, so probably applied by 2026-08-29 (verify).

## Captures & review

`raw_captures` (?) + capture review page (0015), pending-count badge, per-capture resolve. See spec-platform for the pipeline. **Planned:** pending-entity kind `quote` with a near-duplicate warning (see Quotes). **Planned (Day log):** pending kinds `daylog_person_link` (scene + matched person or picker), `daylog_new_person` (name + Phil's in-chat answer as the note), `daylog_fact` (kind chip + text + subject), `daylog_place` (text + Places search); generated once per day at close; approval writes `daylog_scene_people` / `daylog_facts`, creates the person via the existing People path, links the place. The Telegram webhook gains a routing rule: while a day-log conversation is open, inbound text/voice/photos go to the day log; `/c ` prefix forces the capture path.

## Habits

`/organisation/habits`: toggle tiles, 1-year heatmap (CSS grid column-flow), streak/30d/90d table; reads `daily_logs.notes` JSON — no dedicated table. Config via `/api/habits-config`, history `/api/habits-history`, streak `/api/streak`.

## Media (`/organisation/media`)

`media_items` (0059) + streaming/owned (0060) + episodes/reviews (0065): combined watchlist/readlist grouped by status with ratings; JustWatch/Amazon links. A Day-log seed source (status changes today).

## Quotes (`/organisation/quotes`) — PLANNED 2026-09-14, builds after cutover

Full spec: `claude/quotes-spec.md`. Summary: table `quotes` (migration after 0115; `space_id`/`created_by`; entity group `organisation.quotes`) — `text`, `raw_text`, `said_by_person_id` → People, `is_own`, `speaker_confidence`, `context`, `source` (free text), `said_at` + `created_at`, `merch` boolean, `attributed_to`, `research_status` + `research` jsonb. Capture via Shortcut + Telegram through `classifyCapture` intent `quote` → pending entity through the review queue (never auto-creates people; near-duplicate warning) → on approval, background web-search-grounded research (Sonnet + Anthropic web search; `after()` + cron sweeper; always shown with a confidence label; overridable). Routes `/api/quotes` (+`[id]`, `[id]/research`, `export`), `/api/people/[id]/quotes`, `/api/cron/quotes-research`. Views: newest + search, by person (incl. Mine), merch filter, by month. Merch v1 = flag + filter + export; v1.1 = Higgsfield image generation + Telegram send to Phil's own chat.

## Calendar, Assistant, Review

- `/organisation/calendar` — merged view (Google events 0067/0088-89, weather (?)). Events are a Day-log seed source.
- `/organisation/assistant` — added P1.5 (?).
- `/review` + `/review/[isoWeek]`: weekly review with seal/unseal, archive (`/api/review/*`). **Planned (Day log):** a "Days" block listing the week's day summaries and score averages.

## Dashboard cards

Card grid ("Everything" view) with dnd + size picker, layout in `ui_prefs.dashboard_layout` (migrated off localStorage in P2); registry includes Goals, Journal, Glossary, KeyBlockers, Session, Operator, Habits, NowBlock-adjacent cards; Fuel + Tickers removed in P2. Morning briefing `/api/briefings/morning`; daily log `/api/daily-log/today`; goals `/api/goals`; blockers `/api/blockers`. **Planned (Day log):** the Journal card is re-pointed at the new day rows when 0003 is replaced.

## Tickets (replaces Tasks; Habits and Reminders folded) — 2026-09-17

Tasks, Habits and Reminders are now one `tickets` table (migrations 0116–0120). The full model, routes and pages are in `claude/tickets-spec.md` and the build notes in `docs/tickets/README.md`. Habits = `kind = habit` series tickets with `ticket_completions` (the tile, heatmap and streak read those); Reminders = `kind = reminder` with `remind_at` (the `/reminders` page and `/api/reminders` keep their shape over tickets). `/api/tasks/*` remain as compatibility routes for one release.
