# Tickets — Part A build notes and local verification

*Built 2026-09-15 on branch `tickets` (off `main` at the post-cutover tip).
Part A is the schema + rename slice of `claude/tickets-spec.md`. It is built
but **not yet applied to any database**. Verify it on the local Supabase
stack first (this doc), then promote to production — never apply it straight
to prod, because the `tasks`→`tickets` rename is runtime-risky and the build
gate cannot catch a missed table reference.*

## What Part A delivers

- `supabase/migrations/0116_tickets_schema.sql` — renames `tasks`→`tickets`
  (and `task_comments`/`task_activity`, their `task_id`→`ticket_id`), extends
  `projects`, adds `areas`, `ticket_workflows`, `ticket_statuses`,
  `ticket_links`, `ticket_completions`, `ticket_dependencies`,
  `ticket_templates`, adopts them into spaces (P12), regenerates every
  organisation policy, seeds a default workflow + eight statuses per space,
  backfills a key (`MYC-<n>`) and a status onto every existing ticket, and
  installs a BEFORE INSERT key trigger.
- `lib/access/registry.ts` — `organisation.tasks` group replaced by
  `organisation.tickets` listing all eleven tables.
- Code rename — every `.from("tasks"|"task_comments"|"task_activity")` now
  targets the new names; the comment/activity `task_id` column reads/writes
  use `ticket_id`, with selects aliased `task_id:ticket_id` so the existing
  `/api/tasks/*` responses keep their shape. Those routes stay as the
  one-release compatibility surface.

Production build (`rm -rf .next && npx next build`) passes, ESLint included.
The DB-dependent tests (registry, isolation) could not run in the build
environment; they run in step 3 below.

## Reconciliations vs the spec (the live schema differed — each checked)

- Spec's `key text` identifier is named **`ticket_key`** — `tasks` already
  had a boolean `key` (the star flag) wired into blocker and activity logic.
- Spec's `parent_id` — kept the existing **`parent_task_id`** (0004).
- `projects.status` check widened `(active,archived,completed)` →
  `(active,paused,done,archived)`; existing `completed` rows became `done`.
- `task_comments`/`task_activity` exist (0027) and were renamed; their
  `task_id` became `ticket_id`.
- `people_mentions` has no `task_id` (polymorphic `source_type`/`source_id`);
  left untouched. `source_type = 'task'` rows keep their value.
- `habits` and `ui_prefs` tables do not exist — nothing folded; `now_context`
  deferred.

## Deferred to later parts (not in Part A)

- The reminders fold (`kind = 'reminder'`); `reminders` stays its own table
  and registry group for now.
- The bulk import (backlog.md / reminders / venture_steps / cutover run-book
  → tickets) and `0118_api_tokens.sql`.
- Per-project key sequences — Part A keys are **space-scoped** (`MYC-<n>` from
  `spaces.ticket_prefix`/`next_seq`). Project prefixes and per-project `seq`
  come with the project UI.
- Guard triggers the spec lists (project parent depth, sub-task depth,
  assignee-must-be-a-member, workflow-category-coverage) and the
  status→`completed_at` sync. None are needed for the rename to work.
- All new `/api/tickets/*` routes and pages (Now, Inbox, board) — Part B.

## CI now validates this migration (2026-09-15)

CI boots a Supabase stack and replays the whole chain from empty on every
push, so migration `0116` was proven to apply cleanly (run 6b13c21 on the
`tickets` branch: full 0001–0116 replay + tests + build, green). Running
CI on the branch also surfaced the long tail of the `tasks`→`tickets`
rename that the build cannot see — dynamic table references in export,
export-preview, settings/stats, the rundown renderer, `convert`, and the
persisted `routed_to` label, plus four access-suite test fixtures — all now
fixed. So the morning local run below is **confirmation, not discovery**;
the risky unknowns are already closed. The one thing CI does not exercise
is the per-route isolation script, so keep that step in your local run.

## Morning verification (local first, then promote)

Run on the PC in Git Bash, repo root, with Docker running. This mirrors the
multi-user replay: apply on local, prove it, then push.

```
git fetch origin
git checkout tickets
git pull --ff-only origin tickets

# 1. bring the local stack to the pre-Part-A state and apply 0116
supabase start
supabase migration up --local            # applies through 0116 on local
```

If `migration up` errors, paste the error — do not push. It rolls back the
file, so local stays at 0115 and nothing is lost.

```
# 2. prove the data survived and the shapes are right (local psql)
docker exec -i supabase_db_Mycelium psql -U postgres <<'SQL'
select count(*) as tickets from public.tickets;
select count(*) filter (where ticket_key is null) as missing_key,
       count(*) filter (where status_id is null) as missing_status from public.tickets;
select ticket_prefix, next_seq from public.spaces;
select category, count(*) from public.ticket_statuses group by category order by 1;
select table_name, entity_group from public.entity_groups where entity_group = 'tickets' order by 1;
SQL
```

Expect: tickets count equal to your old tasks count; `missing_key` and
`missing_status` both 0; one row per category (8); eleven `tickets` rows in
entity_groups.

```
# 3. the gates that need the stack
npm test                                  # registry + isolation + units
APP_URL=http://localhost:3000 npm run isolation-test   # with next dev running

# 4. click the app locally: existing Tasks pages still list, open, comment,
#    complete a task; a new task gets a MYC-<n> key.
```

Only when `npm test` is green, the isolation test reports 0 leaks, and the
Tasks pages work locally do you promote:

```
git checkout main && git pull --ff-only origin main
git merge --ff-only tickets            # if main has not moved; else merge
git push origin main
supabase db push                        # applies 0116 to production
supabase migration list                 # Local and Remote both end at 0116
```

If anything in step 2–4 is wrong, tell me with the output and I fix the
migration on the branch before you ever push.
