# P12 multi-user — session handoff

**Updated:** 8 September 2026, end of Part 0.

**Say "get started" and the next session should follow "First actions" at the
bottom of this file.**

---

## Where we are

Branch `multi-user`, created from `b9892d1` on `main` (which carries
migration `0101`). **Part 0 is complete and verified.** No P12 feature code
(Parts 1–6) exists yet.

| Part | State |
|---|---|
| 0 — pre-flight | **Done.** Local stack runs, chain replays clean from empty, registry + coverage test in place, rollback runbook written |
| 1–6 | Not started |
| 7 — cutover | Out of scope for these sessions; separate session, Phil present, live DB |

---

## Decisions locked (do not relitigate)

**Rehearsal environment: Docker Desktop + `supabase start`.** Installed and
working. `supabase/config.toml` is committed; `supabase/.temp` (the link to
the hosted project) is gitignored by the CLI's own `.gitignore`.

**JWT: the legacy HS256 secret exists.** Phil confirmed he has both the legacy
JWT secret and signing keys. Part 3's `withUser()` therefore takes the
short-lived HS256 JWT path — mint a token with `role: authenticated` and
`sub: <userId>`, reuse the existing PostgREST client — and **not** the
direct-Postgres fallback. `SUPABASE_JWT_SECRET` must be added to `.env.local`
and to Vercel (checklist §3).

**Migration numbering.** The prompt says "number from 0098" but `main` already
carries `0098`–`0101`. New migrations on this branch start at **`0102`**
(Part 1 profiles = `0102`, and so on). Renumber before merge if `main` moves.

---

## What Part 0 found: the chain did not replay

101 migrations had never been replayed from empty. Doing so failed twice and,
once it passed, a `supabase db dump --linked` of the hosted schema diffed
against a dump of the local replay showed further silent drift. All of it is
fixed in the migration files themselves, every fix guarded so it is a no-op
on the hosted project (which already records those versions as applied):

| File | What was wrong | Fix |
|---|---|---|
| `0003_journal.sql` | Two diagnostic `SELECT`s, no DDL. `journal_entries` and `journal_daily_summaries` were created on live by hand, so the file crashed at statement 0 | Replaced with the base DDL reconstructed from the live dump minus what 0029/0030 add later |
| `0055_luke_workouts_programme.sql` | Seed inserts `workout_programme_sessions.position`, a column that only reached the chain in 0097 | Guarded `ADD COLUMN IF NOT EXISTS` prepended |
| `0001_init.sql` | `create extension vector` without a schema; live has it in `extensions` | `with schema extensions` |
| `0097_fitness_schema_drift.sql` | `data_shape` declared NOT NULL but nullable on live; four columns, four indexes, two widened checks and one dropped unique constraint on live never reached the chain | Nullability aligned; new guarded section 6 |

After the fixes: 100 files apply, 91 tables + 1 view, and the schema diff
against live contains only column order, a Supabase-platform event-trigger
function (`rls_auto_enable`, installed by the dashboard, not app drift), and
two redundant duplicate check constraints live carries next to 0097's.

**How to re-run this check** (the local stack must be up):

```
supabase db dump --linked --schema public -f <scratch>/live_schema.sql
supabase db dump --local  --schema public -f <scratch>/local_schema.sql
```

then diff the two after stripping comments, `SET` lines and `OWNER TO`.
Keep the dumps outside the repo.

---

## Environment facts

- **`supabase db reset` is denied** by `.claude/settings.json` (a guard from
  the linked-only era). The from-empty equivalent is
  `supabase stop --no-backup` then `supabase db start` (database only,
  ~1 min) or `supabase start` (full stack, several minutes). Leave the rule.
- **`supabase migration up --local`** applies only pending migrations to a
  running local database. Fast loop when iterating on one migration.
- **Schema introspection:** `lib/access/introspect.ts` shells into the
  `supabase_db_Mycelium` container's `psql`. The registry test and Part 2's
  verifier both use it. Container name derives from `project_id` in
  `supabase/config.toml`; override with `MYCELIUM_DB_CONTAINER`.
- `@supabase/ssr` and `resend` are installed. `@supabase/supabase-js` is
  2.106.1 (≥ 2.105 required for passkeys). `vitest` 4.1.8 runs the tests;
  `npm test` was 70/70 green before Part 0 and is 80/80 with the registry
  test.
- `gh` (GitHub CLI 2.100) is installed at
  `C:\Program Files\GitHub CLI\gh.exe`; a new terminal is needed for it to be
  on PATH.
- No `psql` on the PC and no Postgres driver in the project. Docker is the
  route to both.
- The `events` table has **no `user_id` column**. Part 2's backfill must set
  its `created_by` from the space owner, not from a cast. Other tables
  without `user_id` are all child tables whose parent has one, or shared
  reference. `lib/access/registry.ts` notes the exception.
- There is **no `api_usage` table** in public. Part 3 says "api_usage gains
  user_id"; the `/other/api-usage` page reads from elsewhere. Resolve what
  Part 3 actually means before writing that migration.

---

## Registry — `lib/access/registry.ts`

85 tables in 25 entity groups across 12 sections, 6 shared-reference tables,
1 derived view. `lib/access/registry.test.ts` proves against the local stack
that every public base table is in exactly one list and that every view is
listed as derived; it **fails, not skips**, when the stack is down.

Placements the prompt left to judgement, and why:

- `events` → `organisation.events` (Calendar is an Organisation sub-page).
- `daily_logs` → `journal.daily_logs` (it is a dated notes-and-mood log).
- `memory_chunks` → `platform.memory` (embeddings of a user's own content).
- `accounts` → `finance.subscriptions` (it is the recurring-cost ledger, not
  bank accounts). Finance is three groups: `banking`, `investments`,
  `subscriptions`; all owner-only by Part 3's policy shape.
- `platform` is one group `core` plus `memory`.

### Still open — needs Phil before Part 2

**`nutrition_targets`** is placed in `health.nutrition` as recommended in
the previous handoff, marked PENDING in the registry note. The prompt's STOP
rule applies before Part 2 adds `space_id` to it, not before Part 1. One-word
answer: is `health.nutrition` right?

---

## First actions on "get started"

1. `git checkout multi-user`; `git log -3` should show the Part 0 commit on
   top of the drift-fix commit.
2. `docker info`, then `supabase start` (or `supabase db start` if only the
   database is needed). `npx vitest run lib/access` must pass.
3. Confirm the `nutrition_targets` answer if Phil has given it; if not, Part 1
   can proceed regardless.
4. Read the P12 prompt in full at `MYCELIUM_ALL_PROMPTS.md` (section
   `## P12`). Part 1 starts at migration **`0102_profiles.sql`**.
5. Part 1 needs, in `supabase/config.toml`: `[auth.mfa.totp]` enrol/verify
   enabled, `[auth.passkey]` uncommented with a local relying party, and
   Google left disabled locally (report untested). Check
   `node_modules/@supabase/ssr` docs before writing `createUserClient()`.
