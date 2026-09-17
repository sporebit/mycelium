# Tickets — how it fits together

Spec: `claude/tickets-spec.md`. Built 2026-09-16/17 in Parts A–H, straight to `main`, hosted DB migrations 0116–0120.

## The model in one breath

One `tickets` table (the old `tasks`, renamed) holds everything with a done state: tasks, habits (`kind = habit`, series recurrence with `ticket_completions`), reminders (`kind = reminder`, `remind_at`), run-books / tests / guides (`steps_definition` + `steps_state`), spawned recurrence occurrences and weekly-review records. Every ticket has a stable key (`MYC-42`), a `status_id` whose **category** (inbox → backlog → next → doing → waiting → verify → done / cancelled) is what every list and automation binds to, and three context facets (Where / Tool / Time window) plus Fibonacci points. The 0117 trigger keeps the legacy `status` column in step so the classic Tasks view still works.

## Surfaces

| Where | What |
|---|---|
| `/organisation/tickets` | Now (home tab, context chips) · Inbox (Clarify stack, Backlog triage) · Today · Upcoming · Next · Waiting · Someday · Logbook; Select / long-press = bulk |
| `/organisation/tickets/<KEY>` | the ticket: category, contexts, dates, steps (house-style page for run-book kinds), sub-tasks, links, rundown, comments, Verified live |
| `/organisation/tickets/templates` | templates (UI-saved and repo JSON from `docs/tickets/templates/`) |
| `/organisation/tickets/review` | the guided weekly review; a block on `/review/[isoWeek]` |
| Today surface / dashboard | Now block, Now card, Habits tile |
| Telegram | capture (key + guesses + buttons), photo/PDF captions → attachments, reminders, scheduled-day check-ins, weekly-review nudge, morning-briefing TICKETS block |
| Settings → Security | API tokens for `tix` and Claude Code |

## Automation

- `/api/cron/tickets-nightly` (02:00): spawn recurrence occurrences 7 days ahead, rundowns for tomorrow's life tickets (Sonnet + web search, £10/month cap, `api_usage`), repo template sync.
- `/api/cron/tickets-checkins` (every 15 min, afternoon–evening): due reminders, the check-in at `ui_prefs.tickets.checkin_time`, the weekly-review reminder at `review_day/review_time`.
- `/api/tickets/github` (HMAC): keys in commits / merged PRs → evidence links + Verify; issues opened → Inbox (opt-in per project).
- `/api/tickets/vercel` (HMAC): production deploy → smoke → Done with evidence. Phil's live check is the separate `verified_by`.

## For Claude (any project)

`scripts/tix.mjs` (`npm run tix -- …`) with `MYCELIUM_URL` + `MYCELIUM_TICKETS_TOKEN`; the `tickets` skill (`.claude/skills/tickets`, also installed at `~/.claude/skills/tickets`) says when and how. Session reports go in `tix comment`, never chat. `GET /api/tickets/export?project=MYC&format=backlog-md` regenerates `claude/backlog.md`.

## Deviations from the spec worth knowing

- Keys are space-scoped (`MYC-n` for everything) until per-project prefixes are wired into the key trigger; `projects.prefix` is stored and exposed.
- Recurring reminders re-arm in place (mode null + RRULE) rather than spawning rows; `spawn` templates are hidden and drive scheduled tasks.
- The Vercel "commit in deployed range" check is approximated as "code evidence linked before the deploy" (pushes to main fast-forward).
- Issues sync outbound uses `GITHUB_TOKEN`; the GitHub App private-key flow is not wired.
- The daily-log habit JSON is dual-written until its remaining readers (glance row, Operator card, briefings, headlines) move to completions.
- No `api_usage` existed before 0119; the Day log should reuse it.
