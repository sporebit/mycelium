# P12 multi-user — session handoff

**Updated:** 10 September 2026, end of Part 2.

**Say "get started" and the next session should follow "First actions" at the
bottom of this file.**

---

## Where we are

Branch `multi-user`, created from `b9892d1` on `main` (which carries
migration `0101`). Parts 0, 1 and 2 are complete and pushed. Part 2's
second verification (replay against the live dump) waits on Phil.

| Part | State |
|---|---|
| 0 — pre-flight | **Done.** `80d02a0` (drift fix), `d08869a` (pre-flight) |
| 1 — identity | **Done.** Supabase Auth, profiles, middleware, break-glass. VERIFY 1: 59 automated checks green; Google untested (needs Phil's provider config) |
| 2 — spaces + ownership | **Done**, migrations `0103`–`0109`. VERIFY 2 half 1 (from-empty replay + verifier): 0 failures. Half 2 (replay against the live `pg_dump`): **blocked on checklist §4** |
| 3 — authorisation + client swap | Not started. Starts at migration **`0110_access.sql`** |
| 4–6 | Not started |
| 7 — cutover | Separate session, Phil present, live DB |

---

## Decisions locked (do not relitigate)

**Rehearsal environment: Docker Desktop + `supabase start`.** Full stack is
needed from Part 1 on (GoTrue, Kong, Mailpit), not just the database.

**JWT: the legacy HS256 secret exists.** Part 3's `withUser()` mints a
short-lived HS256 JWT (`role: authenticated`, `sub: <userId>`) with
`SUPABASE_JWT_SECRET`. Not the direct-Postgres fallback.

**Migration numbering.** `main` carries up to `0101`. This branch: Part 1 =
`0102`, Part 2 = `0103`–`0109`, Part 3 starts at `0110`. Renumber before
merge if `main` moves.

**Phil's auth uid is fixed, not generated:** `f218ed69-6cbf-49ea-908a-8826f2f1178a`.
Defined once in SQL (`app.legacy_user_uid('phil')`, migration 0102) and
mirrored in `lib/system/identity.ts`; `lib/system/identity.test.ts` proves
the two agree. Part 2's backfill casts through the SQL function. Part 7 must
create Phil's live auth user **with this id** (SQL insert into `auth.users`,
same shape as `supabase/seed.sql`) before he first signs in, or the mapping
breaks. If Phil signs up through the dashboard first, his uid will differ
and both the function and the constant must be updated together.

**Access-control tables carry no `space_id`.** `lib/access/registry.ts` has a
fourth list, `ACCESS_TABLES` (now `profiles`, `spaces`, `entity_groups`,
`teams`; `teams.space_id` is a reference to its own team space, which the
verifier knows). Part 3 adds `team_members`, `team_member_sections`,
`user_grants`; Part 4 `invites`; Part 5 `audit_events` and rate limits;
Part 6 the rundown tables. Each carries hand-written policies in its own
migration. The coverage test counts them and fails on anything unlisted.

**Break-glass is entered with `BREAK_GLASS_SECRET` itself**, posted to
`/api/auth/break-glass`, not with `DASHBOARD_PASSWORD` (which nothing reads
any more). The route answers 404 while `BREAK_GLASS_ENABLED !== "true"`, the
cookie lasts one hour, and it can never reach a sensitive route (`/admin`),
because it has no second factor.

**Middleware principal headers.** Route handlers learn who is calling from
`x-principal` (`system` | `user` | `break_glass`), `x-principal-user` (uid)
and `x-principal-aal`. The middleware strips any of these a client sends
before deciding, so they cannot be spoofed. `API_SECRET` → system acting as
Phil; `CRON_SECRET` → system with no user.

---

## What Part 1 built

| Area | Files |
|---|---|
| Migration | `supabase/migrations/0102_profiles.sql` — `app` schema, `profiles` (+ single-owner partial index, RLS, column-level update grant), `app.legacy_user_uid(text)`, `app.is_instance_owner()`, `on_auth_user_created` trigger, `public.my_sessions()` |
| Local seed | `supabase/seed.sql` — Phil's local auth user + identity, profile promoted to instance owner. Local-only; never pushed |
| Clients | `lib/system/serviceClient.ts` (service role, fenced), `lib/supabase/server.ts` (deprecated shim for the 255 call sites Part 3 replaces), `lib/supabase/user.ts` (`createUserClient()`, cookies), `lib/supabase/client.ts` (browser, `@supabase/ssr`, passkey flag) |
| Identity | `lib/system/identity.ts` + test |
| Gate | `middleware.ts` (order per prompt), `lib/auth/gate.ts` (pure helpers + test), `lib/auth/cookie.ts` (break-glass HMAC + test), `lib/auth/session.ts` (`getSessionUser`, `getOwnProfile`) |
| Routes | `app/api/auth/callback` (PKCE `code` and `token_hash` shapes), `app/api/auth/break-glass`, `app/api/auth/logout` (rewritten). `app/api/auth/login` **deleted** |
| UI | `app/login/page.tsx` (magic link / password / passkey, Google button, TOTP step, `?step=mfa`), `app/other/settings/security/page.tsx` (password, TOTP enrol/remove, passkeys add/remove, sessions), link from Settings and nav, `app/admin/page.tsx` placeholder |
| ESLint | `no-restricted-imports` fences `@/lib/system/serviceClient` to `lib/system/**` (+ the shim) |
| Config | `supabase/config.toml`: `site_url` = `http://localhost:3000`, TOTP enrol/verify on, `[auth.passkey]` on, `[auth.webauthn]` rp_id `localhost` |
| Registry | `ACCESS_TABLES` added; coverage test updated |

### VERIFY 1 results (local stack + `next dev`)

- **HTTP driver, flag off — 33/33.** Unauthenticated redirect and 401;
  spoofed principal headers ignored; `API_SECRET` and `CRON_SECRET` pass;
  password grant → aal1 cookie passes `/` and `/api/*`, `/admin` 403;
  TOTP enrol + verify → aal2 cookie, `/admin` 200; `my_sessions()` returns
  the caller's rows with `is_current`; profiles RLS (owner sees own row,
  anon sees nothing); magic link requested → Mailpit → `token_hash`
  callback 303 with session cookies; reused link bounces with
  `error=link`; callback never redirects off-origin; break-glass issuer
  404 and a valid cookie refused while disabled.
- **Browser (Playwright + CDP virtual authenticator) — 18/18.** Password
  sign-in through the UI; security page loads; TOTP enrol through the UI
  (QR + secret, code accepted, session becomes aal2, `/admin` opens);
  passkey registered, listed, used to sign in after sign-out, removed;
  magic link request reaches the sent state; unknown address refused
  ("Signups not allowed for otp" — invite-only holds); no page errors.
- **HTTP driver, flag on — 8/8.** Wrong secret 401; correct secret issues
  the cookie; cookie passes `/` and `/api/*`; `/admin` 403; expired and
  foreign-key cookies refused; logout clears it; the middleware's
  audit stub logged every use.
- **Google: untested.** No provider configured locally (checklist §1).
- Build clean, `npm test` 98/98, lint clean.

### Deviations from the prompt, and why

- Migration is `0102_profiles.sql`, not `0098` (numbering decision).
- `createServerClient` was not simply moved: the fenced function is
  `createServiceClient()` in `lib/system/serviceClient.ts`, and the old
  module re-exports it under the old name as a deprecated shim so the
  build stays green until Part 3 replaces every call site. The ESLint
  fence exempts only `lib/system/**` and that shim.
- The sessions list reads `auth.sessions` through `public.my_sessions()`
  (SECURITY DEFINER, filtered on `auth.uid()`) because the `auth` schema
  is not exposed to PostgREST and supabase-js has no user-facing sessions
  API. Part 5's remote sign-out should follow the same shape.
- Break-glass audit is a `console.warn` stub with a TODO; the middleware
  runs on the edge runtime and has no database client until Part 5's
  writer exists.
- The registry gained `ACCESS_TABLES` (see decisions).

### Debt for later parts

- **Part 3:** 255 imports of `@/lib/supabase/server` remain. `app/layout.tsx`
  also still reads `USER_ID` for ui prefs; it should read the session user.
- **Part 5:** replace `recordBreakGlassUse()`; add the re-auth cookie to the
  aal2 rule; extend `SENSITIVE_PREFIXES`; remote sign-out.
- The login page shows a 401 from `/api/settings/ui-prefs` in the console
  (the shell fetches prefs on the login page too). Pre-existing, harmless,
  worth fixing when the layout moves to the session user.

---

## What Part 2 built

| Migration | Content |
|---|---|
| `0103_spaces.sql` | `teams` scaffold (Part 4's shape), `spaces` (personal/team, one personal per user), `entity_groups` seeded with the registry's 85 rows, `app.personal_space()`, `app.personal_space_for_legacy(text)`, a before-insert trigger giving every profile a personal space, Phil's profile + space, **`app.adopt_table(table, parent_table, parent_col)`**, and read policies for the five shared-reference tables (`agent_memory` stays service-role only) |
| `0104`–`0109` | One per domain group: platform, organisation, fitness, health, finance, and studio/drops/ventures/media/journal/places/reminders. Each is a list of `adopt_table` calls, parents before children. `0109` ends with a check that every registered table has `space_id` + `created_by` and no public table still has `user_id` |

`adopt_table` adds `space_id` (from the parent row where one is named, else
Phil's personal space — the cutover rule), makes it NOT NULL with an FK and
index; adds `created_by` (from `app.legacy_user_uid(user_id)` where a text
`user_id` exists, else the space owner); rebuilds every primary key, unique
constraint and index that was keyed on `user_id` to key on `space_id`
(same shape, partial predicates kept); drops the eight legacy
`app.user_id` policies; drops `user_id`. It raises — the prompt's STOP —
if any `user_id` value maps to no auth user. It stays in the schema for
future tables.

### VERIFY 2 results

- **From-empty replay** (`supabase stop --no-backup`, `supabase start`
  with `0103`–`0109` held aside, snapshot, restore, `migration up`,
  verify): `scripts/verify-ownership.ts` reports **0 failures** over 85
  registered tables (space_id NOT NULL, 0 nulls, 0 orphans, FK present,
  user_id gone, row counts preserved), 11 shared/access tables, no
  unclassified table, `entity_groups` = registry, Phil's personal space
  present. 209 rows adopted (the seed data the migrations carry).
- **Incremental run** on the previously migrated local database: also 0
  failures; it exercised the other placeholder path (below).
- **PostgREST as Phil:** `spaces` 1 row, `entity_groups` 85, `teams` 0,
  `cook_guides` readable, `agent_memory` and every entity table denied
  (deny-all until Part 3), `profiles` own row. As anon: everything denied.
- `npm test` 100/100 (registry coverage with the new access tables,
  entity_groups = registry, identity mapping). Build clean.
- **Replay against the live dump: NOT DONE.** Needs checklist §4. This is
  the run that would surface real unmappable `user_id` values; the seed
  data had only `phil` and one `default`.

### Decisions taken in Part 2 that Phil should know about

- **`user_settings` had a `user_id = 'default'` row.** Migration 0075
  inserted it with `coalesce(current_setting('app.user_id'), 'default')`
  and the GUC was never set. The app creates the real `phil` row itself at
  runtime, so on the hosted project both exist. `0104` deletes the
  placeholder when a real row exists **and** it is untouched (no tokens,
  chat id, prefs, card orders); raises a STOP if it holds data; and when it
  is the only row (from-empty replay) adopts it as Phil's. Mapping it to
  Phil beside the real row is impossible: `user_settings` is now UNIQUE
  `(space_id)`. Reversible before Part 7 if Phil disagrees.
- `places` and `reminders` were folded into the last domain migration
  rather than given their own; the prompt listed five groups for six files
  and did not place them.
- The four SQL functions that took a `USER_ID` text argument
  (`search_memory_chunks`, `spend_by_category`, `spend_by_month`,
  `txn_agg`) now filter on `space_id = app.personal_space_for_legacy(p_user_id)`
  so their callers keep working. **Part 3 rewrites them to `auth.uid()` and
  drops the bridge function.**
- One rebuilt index is named `workouts_space_id_idx_legacy` (the partial
  `WHERE archived_at IS NULL` index; its natural name collided with the
  helper's plain index). Cosmetic.
- `teams` was created now, in Part 4's shape, because `spaces.team_id`
  needs something to reference.

### The app is runtime-broken on this branch until Part 3 lands

Every `user_id` column is gone. The 255 call sites that still filter on
`user_id` through the service-role shim will fail at runtime against the
local stack. That is expected: Part 3 replaces them with the user-scoped
client and RLS. Do not try to run the app against the local stack for
feature checks between Parts 2 and 3; tests and migrations are the
verification. `app/layout.tsx` (ui prefs by `USER_ID`) fails first.

---

## Environment facts

- **Docker Desktop is not running after a reboot.** Launch
  `C:\Program Files\Docker\Docker\Docker Desktop.exe`, wait ~30 s, then
  `supabase start`. Volumes persist; migrations and the seed survive.
- **`supabase db reset` is denied** by `.claude/settings.json`. From-empty
  equivalent: `supabase stop --no-backup` then `supabase start` (the CLI
  applies migrations and `supabase/seed.sql`). Incremental:
  `supabase migration up --local` then, if Phil's user is missing,
  `docker exec -i supabase_db_Mycelium psql -U postgres < supabase/seed.sql`.
- **Local credentials** (local stack only): `phil@mycelium.local` /
  `mycelium-local`. Magic links land in Mailpit; `supabase status` prints
  the URL. Its API: `GET /api/v1/messages`, `GET /api/v1/message/<ID>`.
- **Running the app against the local stack:** do NOT edit `.env.local`
  (it points at the hosted project). Export overrides in the shell from
  `supabase status -o env` — `NEXT_PUBLIC_SUPABASE_URL=$API_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY`, plus
  `BREAK_GLASS_ENABLED` / `BREAK_GLASS_SECRET` as needed — then
  `npx next dev`. Shell env wins over `.env.local`. `.env.local` still
  lacks `BREAK_GLASS_*` and `SUPABASE_JWT_SECRET` (checklist §3).
- **The ssr cookie name** for the local stack is `sb-127-auth-token`
  (derived from the API host). A session can be turned into cookies in a
  script with `@supabase/ssr`'s `createServerClient` over an in-memory jar
  and `auth.setSession()`; the Part 1 verify driver did this.
- **Playwright 1.61 with Chromium is installed** (`scripts/screenshot.mjs`
  uses it). A CDP virtual authenticator (`WebAuthn.addVirtualAuthenticator`)
  drives passkeys headlessly. The Part 1 drivers lived in the session
  scratchpad; a reusable `scripts/verify-identity.mjs` would be worth
  adding before Part 7 so the same checks run against a Vercel preview.
- `graphify` is not on PATH; use `npx --no-install graphify update .`.
- `next dev` and `next build` both write `.next`; stop dev before the
  build gate. The clean build takes ~5 minutes.
- `lib/access/introspect.ts` shells into the `supabase_db_Mycelium`
  container's `psql`; the registry and identity tests need the stack up
  and **fail, not skip**, without it.
- The `events` table has **no `user_id` column**; Part 2 sets its
  `created_by` from the space owner. There is **no `api_usage` table** in
  public; resolve what Part 3 means before writing that migration.

---

## Registry — `lib/access/registry.ts`

85 entity tables in 25 groups across 12 sections, 6 shared-reference
tables, 1 access table (`profiles`), 1 derived view. Placement notes from
Part 0 still apply (`events` → organisation, `daily_logs` → journal,
`memory_chunks` → platform.memory, `accounts` → finance.subscriptions).

### Still open — needs Phil before Part 2's migration touches it

**`nutrition_targets`** is placed in `health.nutrition`, marked PENDING.
One-word answer needed before Part 2 adds `space_id` to it.

---

## First actions on "get started"

1. `git checkout multi-user`; `git log -6` should show the Part 2 commit on
   top of Part 1.
2. Launch Docker Desktop if `docker info` fails, then `supabase start`.
   `npm test` must pass (stack up, chain at `0109`, Phil seeded with a
   personal space). If the chain is behind, `supabase migration up --local`.
3. If Phil has supplied the live dump (checklist §4): restore it into a
   fresh local database at chain position `0101`, apply `0102`–`0109`
   (`0103` needs Phil's auth user inserted first — `supabase/seed.sql`
   shape), run `npm run verify:ownership -- snapshot` before and
   `verify` after. Paste the output into the handoff. Any STOP is Phil's
   call. Keep the dump outside the repo.
4. Read Part 3 in `MYCELIUM_ALL_PROMPTS.md`. Start at `0110_access.sql`
   (`team_members`, `team_member_sections`, `user_grants` with the finance
   check, `app.accessible_spaces(group, verb)`), then `0111_policies.sql`
   generated over `entity_groups` (four permissive policies per non-finance
   table, `space_id = app.personal_space()` for finance, drop each
   deny-all). Add the new tables to `ACCESS_TABLES`. Rewrite the four
   bridged SQL functions to `auth.uid()`; drop `app.personal_space_for_legacy`.
5. Then the client swap: every `createServerClient()` outside `lib/system`
   → `createUserClient()`; system routes → `lib/system/withUser(userId, fn)`
   minting an HS256 JWT with `SUPABASE_JWT_SECRET` (locally: the stack's
   `JWT_SECRET` from `supabase status -o env`). Delete the shim and its
   ESLint exception. Note there is **no `api_usage` table**; decide what
   "api_usage gains user_id" means before writing it.
6. VERIFY 3 (the isolation test) needs a second local user: create one
   through GoTrue's admin API or a second seed row; its profile and
   personal space come from the triggers.
