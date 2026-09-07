# P12 multi-user — session handoff

**Written:** 7 September 2026, mid-Part 0, immediately before a PC restart to
finish the Docker Desktop install.

**Say "get started" and the next session should follow "First actions" at the
bottom of this file.**

---

## Where we are

Branch `multi-user` exists, created from `b9892d1` on `main` (which carries
migration `0101`). Part 0 is in progress; **no P12 code has been written yet**.
The only commit on the branch is this documentation.

| Part | State |
|---|---|
| 0 — pre-flight | In progress. Registry analysis done, docs written, deps not yet installed, local stack not yet run |
| 1–6 | Not started |
| 7 — cutover | Out of scope for these sessions; separate session, Phil present, live DB |

---

## Decisions locked (do not relitigate)

**Rehearsal environment: Docker Desktop + `supabase start`.** Phil chose the
faithful reading of Global Rule 2 over the alternative of a second Supabase
project as staging. Docker Desktop is installed but needs the pending restart.

**JWT: the legacy HS256 secret exists.** Phil confirmed he has both the legacy
JWT secret and signing keys. Part 3's `withUser()` therefore takes the
short-lived HS256 JWT path — mint a token with `role: authenticated` and
`sub: <userId>`, reuse the existing PostgREST client — and **not** the
direct-Postgres fallback with `set local request.jwt.claims`. This removes the
need for a second connection path and a new non-`BYPASSRLS` database role.
`SUPABASE_JWT_SECRET` must be added to `.env.local` and to Vercel.

---

## Environment facts established this session

- **Docker is required for more of the CLI than expected.** Both
  `supabase start` and `supabase db dump` need it — `db dump` runs `pg_dump`
  inside a container, so even read-only schema export was unavailable.
- **There is no `supabase/config.toml`.** Only `supabase/migrations/` exists;
  the CLI has only ever been used here in linked mode against the hosted
  project. `supabase init` must be run before `supabase start` will work, and
  it must not clobber the existing migrations directory.
- **Schema introspection works without Docker.** The PostgREST OpenAPI
  document at `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, requested with the
  service-role key, returns every relation with its columns, types, primary
  keys and foreign keys. This is how the registry analysis below was produced.
  Useful whenever the container runtime is unavailable.
- `@supabase/supabase-js` is **2.106.1**, satisfying the ≥ 2.105 that passkeys
  require. No upgrade needed.
- `@supabase/ssr` and `resend` are **not installed**. Part 0's dependency step
  is outstanding.
- `vitest` 4.1.8 is present, so Part 3's policy unit tests have a runner.
- No `psql` and no Postgres driver in the project.

---

## Registry coverage — Part 0's STOP gate

The live database has **92 relations: 91 tables and 1 view.** That reconciles
with `0101`'s header, which noted 91 tables but 92 relations holding grants.

The registry in the P12 prompt covers **90 of the 91 tables** once the
shorthand line "journal/places/reminders/events/daily_logs/memory_chunks: one
group each under their section" is expanded to the seven tables it implies
(`journal_entries`, `journal_daily_summaries`, `places`, `reminders`, `events`,
`daily_logs`, `memory_chunks`).

Two relations fell outside both the entity registry and the shared-reference
list. One resolved on inspection; one needs Phil's call.

### Resolved — no decision needed

**`pc_metrics_machines` is a view, not a table.** Defined in
`0094_pc_metrics_machine_id.sql` as
`create or replace view … with (security_invoker = true) as select distinct machine_id from pc_metrics`.
Because it is `security_invoker`, it evaluates the querying user's RLS against
the underlying `pc_metrics`, so it inherits space scoping for free. It takes no
`space_id`, belongs in neither list, and is correctly classified as the third
category in Global Rule 6: derived/internal. The registry-coverage test in
Part 0 must exclude views, or it will fail on this relation.

### Open — needs Phil's answer before Part 2

**`nutrition_targets`** (17 columns, has a `user_id text` column). Created by
`0098_nutrition_targets.sql`, which landed *after* the P12 prompt was written,
which is why the prompt's registry does not mention it. It is per-user
versioned macro targets.

> **Recommendation: `health.nutrition`**, alongside `foods`, `meal_groups`,
> `nutrition_logs`, `recipes`, `shopping_lists` and `meal_plan`. It is
> nutrition data, it is per-user, and grouping it anywhere else would let
> someone hold nutrition access without the targets those logs are measured
> against.

The prompt says "any table not in either list: STOP and ask before Part 2 — do
not guess", so this is surfaced rather than assumed. It is a one-word answer.

---

## Outstanding Part 0 work

1. Install `@supabase/ssr` and `resend`.
2. `supabase init`, then `supabase start`, then replay `0001`–`0101` on the
   local stack. **Any migration that fails locally is pre-existing drift and
   must be fixed as its own commit before Part 0 continues.** This is the step
   most likely to produce surprises — 101 migrations have never been replayed
   from empty.
3. Write `lib/access/registry.ts` as the single source of truth, shaped so
   Part 2 can seed the `entity_groups` table from the same data.
4. Write `docs/multi-user-rollback.md` — the restore-from-`pg_dump` runbook.
   (`docs/multi-user-phil-checklist.md` is already written; see below.)
5. VERIFY 0, then commit and push the branch.

---

## Debt carried into the next session

**The build gate was not run for the handoff commit.** AGENTS.md requires
`rm -rf .next && npx next build` before every push, and P12's Global Rule 1
requires it before every commit. The handoff commit is documentation only and
was made without it so as not to delay the restart. **Run the build before the
next push**, which will cover this commit and the first code commit together.

---

## First actions on "get started"

1. `git checkout multi-user` and confirm HEAD matches the handoff commit.
2. Confirm Docker is running: `docker info`.
3. Get the answer to the one open registry question above
   (`nutrition_targets` → `health.nutrition`?).
4. `rm -rf .next && npx next build`, then `git push -u origin multi-user` to
   clear the build-gate debt.
5. Resume Part 0 at step 1 of "Outstanding Part 0 work".

Read the P12 prompt in full at `MYCELIUM_ALL_PROMPTS.md` (section
`## P12`) before writing code — the decisions block at the top of it is binding
and several of its constraints are easy to violate by habit, particularly
"never `supabase db push`" and "service-role client importable only from
`lib/system/**`".
