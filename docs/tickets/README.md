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

- Keys: root project prefix + own sequence since 0122 (Mycelium `MYC-`, DropShipAuto `DSA-`, Home Improvement `GARDN-`, Surprise-Packs `CARDS-`, Madrid `MADRD-`, Selling `SELL-`); unprojected tickets are `PW-n`. Keys never change on move.
- Recurring reminders re-arm in place (mode null + RRULE) rather than spawning rows; `spawn` templates are hidden and drive scheduled tasks.
- The Vercel "commit in deployed range" check is approximated as "code evidence linked before the deploy" (pushes to main fast-forward).
- Issues sync outbound uses `GITHUB_TOKEN` (unset unless wanted); the GitHub App private-key flow is not wired. The repo webhook and the Vercel deployment webhook are registered and proven (MYC-134).
- The daily-log habit JSON is retired (2026-09-18): every reader is on `ticket_completions`; `daily_logs` is journal-only.
- No `api_usage` existed before 0119; the Day log should reuse it.
- Sprints (0123): a commitment layer over GTD — `tickets.sprint_id`, one active sprint per project, velocity on close, burndown from completions, ⚡ chip on Now. The Tasks/Tickets split (0121) is by the project's area kind.
- Any table adopted after 0116 needs the 0111 policy + grant loop re-run (0124); a policy-less table embedded in `TASK_SELECT` breaks every ticket read.
- The `reminders` table is gone (0125, after an in-migration count check against `meta.legacy_reminder_id`); `/api/reminders` reads tickets. The `reminders` section constant survives for old `user_grants` rows.
- `/api/tasks/*` and `/organisation/tasks` are the **Tasks surface** (life tasks, 0121), not just compat — they stay. Removing `/api/tasks/*` waits until `/organisation/tasks` reads `/api/tickets?surface=tasks` directly.
