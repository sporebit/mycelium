# Overnight run — decision breakdown (2026-09-15)

*Autonomous session after the P12 cutover. Scope Phil set: run to completion,
do needed cleanup, my judgement, review the decisions in the morning. Nothing
unverified reached production; Tickets Part A is on its branch for a local
check.*

## Headline

- **P12 multi-user cutover is live and verified** (earlier in the session):
  0102–0115 applied to production, sign-in + TOTP, sections, PTP, Telegram
  capture and cron all confirmed; legacy auth env retired.
- **CI is green again on `main`** and now boots a Supabase stack, so the test
  suite runs and every migration replays from empty on each push — the
  backlog's "migration replay in CI" item, delivered.
- **Tickets Part A** (schema + `tasks`→`tickets` rename) is built on branch
  `tickets`, and **validated in CI** (full 0001–0116 replay + tests + build,
  green). Not applied to any database; verify locally, then promote.
- I did **not** blind-build Tickets Parts B–H, and did **not** touch the
  archived-programme bug. Reasons below.

## Decisions

### 1. CI: boot the Supabase stack (main: f8ca948, 1500fcd)
The P12 merge left CI red — the access/identity/teams/rundowns/security suites
shell into a local Supabase stack and fail without it. CI now runs
`supabase start` (db, auth, rest) before the tests, which also replays the
whole chain from empty and loads seed.sql. Node bumped 20→22 (the rundowns
suite needs a native WebSocket via realtime-js; pre-existing, surfaced once the
suite could run). Green run: 34923113166.
Rejected: making the DB tests skip without a stack — that hides coverage and
gives no replay gate.

### 2. Tickets Part A on branch `tickets` (validated by CI run 6b13c21)
Built local-first because the rename is the one change the build gate cannot
see (table names are strings) and it touches the core task system.
Reconciliations, each checked against the live schema:
- identifier column named `ticket_key` (a boolean `key` already exists);
- kept `parent_task_id` (spec said `parent_id`);
- `projects.status` widened, `completed`→`done`;
- `task_comments`/`task_activity` renamed, `task_id`→`ticket_id`, responses
  aliased so `/api/tasks/*` is unchanged;
- `habits`/`ui_prefs` don't exist — nothing folded.
Running CI on the branch caught the rename's long tail the build can't:
dynamic table references in export, export-preview, settings/stats, the
rundown renderer, `convert`, and the persisted `routed_to` label (migrated in
0116), plus four access-suite test fixtures. All fixed; the migration applied
cleanly every run. Full notes: `docs/tickets-partA-notes.md`.

### 3. Did NOT build Tickets Parts B–H
B–H is a full GTD app (Now view, clarify, weekly review, recurrence, LLM
rundowns, GitHub/Vercel webhooks, a CLI). Its behaviour verifies only
interactively, against a database, or against live LLM/webhook calls — none
possible from this session. Building it unverified would be bulk, not
progress. Recommendation: build Part B once Part A is confirmed live, or in a
Remote Control session on the PC where I can drive the local stack and verify
each part.

### 4. Cleanup done (main: 1500fcd)
`.env.example` gained the P12 names; `docs/tokens.md` inventories secrets by
name only.

### 5. Cleanup deliberately NOT done
- Archived-programme bug (`fitness/today` ignores `archived_at`): the fix is
  on the hottest page and any version I can't run risks hiding an active
  programme — worse than the bug. Proposed fix in `docs/tickets-partA-notes.md`
  history / below.
- Rest-timer and vision-scan bugs: need interactive reproduction.

## Your morning

1. **Tickets Part A** — verify locally per `docs/tickets-partA-notes.md`
   (bring up the local stack, `supabase migration up`, run the checks and
   `npm test`, click the Tasks pages), then promote to production. CI has
   already proven the migration replays, so this is confirmation, not
   discovery. Keep the local isolation-test step — CI doesn't run it.
2. Nothing else is required. CI is green; the cutover is done.

## Branches and commits
- `main`: cutover live, CI-with-stack, cleanup, this breakdown.
- `tickets`: Part A, CI-validated. Not merged to main. The temporary CI
  trigger added for validation has been reverted, so a future merge carries
  the normal workflow.

## Proposed archived-programme fix (later, needs the app run)
In `app/api/fitness/today/route.ts`, filter the phase query to non-archived
programmes via an inner embed:
`.select("...,workout_programmes!inner(archived_at)").is("workout_programmes.archived_at", null)`,
verified by archiving a programme and confirming Today falls back correctly.

## Follow-ups worth a session
- Add the per-route isolation test to CI (needs `next dev` + the stack) so
  route-level breaks are caught automatically, not just by the local run.
- Copy `claude/backlog.md`, `claude/context.md`, `claude/README.md` back into
  the Cowork project if it keeps its own copies — the repo copies are ahead.
