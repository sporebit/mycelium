# P12 multi-user — session handoff

**Updated:** 10 September 2026, end of Part 6.

**Say "get started" and the next session should follow "First actions" at the
bottom of this file.**

---

## Where we are

Branch `multi-user`, created from `b9892d1` on `main` (which carries
migration `0101`). Parts 0–6 are complete and pushed. What remains is
Phil's: Part 2's replay against the live dump (checklist §4), the hosted
configuration (§1–§3), a Vercel preview of the branch, and Part 7.

| Part | State |
|---|---|
| 0 — pre-flight | **Done.** `80d02a0` (drift fix), `d08869a` (pre-flight) |
| 1 — identity | **Done.** Supabase Auth, profiles, middleware, break-glass. VERIFY 1: 59 automated checks green; Google untested (needs Phil's provider config) |
| 2 — spaces + ownership | **Done**, migrations `0103`–`0109`. VERIFY 2 half 1 (from-empty replay + verifier): 0 failures. Half 2 (replay against the live `pg_dump`): **done 2026-09-11**, 0 failures, no unmappable `user_id` |
| 3 — authorisation + client swap | **Done**, migrations `0110`–`0111`, 277 files swapped, shim deleted. VERIFY 3: isolation test 0 leaks over 138 endpoints × 2 users and 85 tables; 15 policy tests |
| 4 — teams, invites, grants UI | **Done**, migration `0112`. VERIFY 4: 27 matrix/flow tests, 15 browser checks, isolation gate clean. Invite email needs Resend (checklist §2); locally the link is shown instead |
| 5 — security operations + admin | **Done**, migrations `0113`–`0114`. VERIFY 5: 9 database/static tests, 31 + 1 HTTP checks (incl. break-glass audit), isolation gate clean |
| 6 — rundowns | **Done**, migration `0115`. VERIFY 6: 3 render tests, 11 HTTP checks |
| 7 — cutover | Separate session, Phil present, live DB |

---

## Decisions locked (do not relitigate)

**Rehearsal environment: Docker Desktop + `supabase start`.** Full stack is
needed from Part 1 on (GoTrue, Kong, Mailpit), not just the database.

**JWT: the legacy HS256 secret exists.** Part 3's `withUser()` mints a
short-lived HS256 JWT (`role: authenticated`, `sub: <userId>`) with
`SUPABASE_JWT_SECRET`. Not the direct-Postgres fallback.

**Never rotate or migrate the legacy JWT secret.** Supabase's asymmetric
signing keys expose no private key, so once the project is migrated to them
nothing can mint the tokens `withUser()` depends on and every system route
(cron, Telegram, health-import, pc-metrics) stops running as a user. Read
it (Project Settings → JWT Keys → Legacy → Reveal), never Rotate, never
Migrate. The Management API does not expose it either, so any new project
(staging, a rollback target) needs one manual Reveal → Vercel paste.

**Migration numbering.** `main` carries up to `0101`. This branch: Part 1 =
`0102`, Part 2 = `0103`–`0109`, Part 3 = `0110`–`0111`, Part 4 = `0112`,
Part 5 = `0113`–`0114`, Part 6 = `0115`. Renumber before merge if `main`
moves.

**Phil's auth uid is fixed, not generated:** `f218ed69-6cbf-49ea-908a-8826f2f1178a`.
Defined once in SQL (`app.legacy_user_uid('phil')`, migration 0102) and
mirrored in `lib/system/identity.ts`; `lib/system/identity.test.ts` proves
the two agree. Part 2's backfill casts through the SQL function. Part 7
should insert Phil's live auth user **with this id and his real email**
(SQL insert into `auth.users` + `auth.identities`, same shape as
`supabase/seed.sql`) before `supabase db push`. If it is missing, `0103`
creates it itself with the placeholder email `phil@mycelium.local` and no
password (needed for the from-empty local replay, where migrations run
before the seed); Phil then changes the email from the dashboard. If Phil
signs up through the dashboard with a different uid first, the mapping
breaks and both the function and the constant must be updated together.

**Access-control tables carry no `space_id`.** `lib/access/registry.ts` has a
fourth list, `ACCESS_TABLES` (now `profiles`, `spaces`, `entity_groups`,
`teams`, `team_members`, `team_member_sections`, `user_grants`, `invites`,
`audit_events`, `rate_limits`, `second_factor_failures`, `rundown_settings`,
`rundown_subscriptions`, `rundown_issues`;
`teams.space_id` is a reference to its own team space, which the verifier
knows). Part 3 added `team_members`, `team_member_sections`,
`user_grants`; Part 4 `invites`; Part 5 `audit_events` and rate limits;
Part 6 the rundown tables. Each carries hand-written policies in its own
migration. The coverage test counts them and fails on anything unlisted.

**Break-glass is entered with `BREAK_GLASS_SECRET` itself**, posted to
`/api/auth/break-glass`, not with `DASHBOARD_PASSWORD` (which nothing reads
any more). The route answers 404 while `BREAK_GLASS_ENABLED !== "true"`, the
cookie lasts one hour, and it can never reach a sensitive route (`/admin`),
because it has no second factor.

**Owner-only sections: finance AND platform.** `OWNER_ONLY_SECTIONS` in the
registry; policies use `space_id = app.personal_space()` and never the
helper; `user_grants` refuses both by check constraint. See Part 3's
decisions for why platform joined finance.

**Sign-up is invite-only at the database.** A BEFORE INSERT trigger on
`auth.users` (0112) refuses any email without a live invite, Phil excepted.
Tests and seeds that need a user set `app.allow_uninvited = 'on'` in the
same transaction. Every write to the access tables goes through a
SECURITY DEFINER function in 0112 that checks the caller's role; the tables
are read-only through PostgREST.

**Sensitive routes need aal2 AND a fresh re-auth.** `/admin`, `/api/admin`,
`/api/account`: the middleware checks the ten-minute `reauth` cookie
(HMAC keyed on `SUPABASE_JWT_SECRET`) set by `POST /api/auth/reauth` after a
TOTP verify. A prefix in `SENSITIVE_PREFIXES` matches itself and its
children whether or not it is written with a trailing slash — the Part 5
driver caught a first-factor session deleting an account through
`/api/account/delete` before that was fixed.

**Audit is trigger-first.** Sign-in/out, MFA, invites, membership, grants,
successor and ownership changes are written by database triggers; the API
layer adds break-glass requests, cross-user reads and exports through
`lib/system/audit.ts`. `audit_events` is append-only.

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
- **Replay against the live dump: DONE 2026-09-11** (Claude Code, local
  stack). Dump `A:\Backups\mycelium\2026-09-11\` (91 tables, 4,970 rows,
  row-for-row equal to live through PostgREST) restored into a fresh local
  stack with the migration files held aside, history repaired to 0101,
  Phil's auth user inserted with the fixed uid exactly as Part 7 step 4.3
  will, 0102 applied, snapshot, 0103–0115 applied: exit 0, no STOP.
  Verifier: **0 failures over 85 registered tables**, counts preserved
  (tasks 87, raw_captures 185, workout_sessions 38), profile promoted to
  instance owner with a personal space. Every `user_id` in the live data
  is `phil` (3,913 rows); the one `default` row in `user_settings` was
  the untouched placeholder and 0104 removed it. The verifier itself
  needed a fix first: its access-table rule (Part 2) flagged the `uuid`
  `user_id` columns Parts 4–6 added and `audit_events.space_id`; it now
  keys on the column type and lists `audit_events` as a space reference.
  Same-day regression gate on that restored data: `npm test` 156/156,
  isolation test 0 leaks (152 endpoints × 2 users, 105 tables), 0 count
  mismatches, 0 5xx as Tess; 4 5xx as Phil in `/api/google/sync` and the
  three `/api/spotify/*` read routes, because the real data carries live
  OAuth tokens and the local shell has no `GOOGLE_CLIENT_*` /
  `SPOTIFY_CLIENT_*` (they exist on Vercel) — environment, not P12.

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

### (Historical) the app was runtime-broken between Parts 2 and 3

Every `user_id` column went in Part 2; Part 3 replaced all 255 call sites.
The app runs against the local stack again — `npm run isolation-test`
proves every API route as two users.

---

## What Part 3 built

| Area | Content |
|---|---|
| `0110_access.sql` | `team_members` (one owner per team), `team_member_sections` (toggles that only narrow), `user_grants` (check: never finance, never platform), `app.role_allows()`, **`app.accessible_spaces(entity_group, verb)`** (STABLE, SECURITY DEFINER: own personal space ∪ team spaces by role and toggle ∪ grantors' personal spaces by active grant), `app.visible_spaces()`, policies on the access tables, `spaces`/`teams` select widened to visible spaces |
| `0111_policies.sql` | Generated over `entity_groups`: drop deny-all, four permissive policies per table (`select`/`insert`/`update`/`delete` keyed on `accessible_spaces` with `view`/`create_delete`/`edit`/`create_delete`), owner-only shape `space_id = app.personal_space()` for **finance and platform**, `select/insert/update/delete` granted to `authenticated`, column defaults `space_id = app.personal_space()` and `created_by = auth.uid()`; the four SQL functions lose `p_user_id` and run as invoker; the Part 2 bridge is dropped; AI capture features default off for new users |
| System helpers | `lib/system/jwt.ts` (HS256 mint, WebCrypto), `lib/system/withUser.ts` (`withUser(uid, fn)`, `clientForUser(uid)`), `lib/system/bindings.ts` (integration → user, all Phil today), `lib/system/admin.ts` (instance-owner feature flags via the fenced service client) |
| Client | `createUserClient()` now honours the middleware principal: session cookies for `user`; a minted JWT for `system` + `x-principal-user` (API_SECRET) and `break_glass`. Routes need no per-route code for that. Public-prefix and cron routes use `withUser(boundUser(…))` explicitly |
| The swap | 277 files rewritten by codemod, then finished by six agents: every `createServerClient()` gone, `lib/supabase/server.ts` **deleted**, ESLint fence has no exception left, every `user_id` filter/insert/select/`onConflict`/type/ownership-check removed. 0 references to `process.env.USER_ID` remain in app/lib |
| Admin | `app/api/admin/users/[id]/features` GET/PATCH (instance owner, aal2 by middleware) |
| Scripts | `scripts/isolation-test.ts` (`npm run isolation-test`), `lib/access/policies.test.ts`, `lib/system/jwt.test.ts` |

### VERIFY 3 results

- **Isolation test** (`next dev` + local stack, Phil vs a second user "Tess" with an empty space): **138 endpoints × 2 users. Leaks: 0 routes, 0 tables. Tess 5xx: 0. Phil 5xx: 0. Count mismatches: 0** over 85 registered tables (231 of Phil's rows visible to him through PostgREST = SQL count per table). Dynamic segments were filled with Phil's real ids; as Tess every such route answered 404 or an empty list. Three routes 500 for both users because their API keys are not set locally (`/api/google/auth`, `/api/spotify/authorize`, `/api/weather`) — classified ENV, not failures. GETs with side effects created rows in Tess's own space (`meal_groups` 4, `daily_logs` 3, `user_settings` 1); listed, not leaks.
- **Policy unit tests** (`lib/access/policies.test.ts`, PostgREST with minted JWTs): 15 passing — personal (+/−), team by role (member edits, viewer read-only, no membership no access), team by toggle (view off hides, edit off is read-only, a toggle cannot widen a viewer, owner ignores toggles), direct grant (view exposes, missing verb denied, other group hidden, revoked/expired dead, empty group list = whole section), finance (own rows visible; team admin sees nothing; owner cannot write finance into a team space; a finance grant is refused by constraint).
- Part 1 suites rerun on the swapped code: HTTP 33/33, browser 18/18.
- `npm test` 117/117; `tsc` 0 errors; `eslint` clean; build clean. From-empty replay of `0001`–`0111` re-run at the end of the session.

### Decisions taken in Part 3 that Phil should know about

- **`platform` is owner-only like finance.** The prompt hard-excludes only finance. `user_settings` carries Google OAuth tokens and `push_subscriptions` are per device, so team or grant sharing of `platform.core` would have exposed credentials. `user_grants` refuses `platform` by constraint; policies use the personal-space shape. Widening it later is a one-line policy change.
- **Column defaults instead of per-insert `space_id`.** `space_id default app.personal_space()` and `created_by default auth.uid()` on every registered table, so the hundreds of insert sites needed no change. Writing into a team space means setting `space_id` explicitly; nothing does yet (Part 4).
- **`api_usage` does not exist.** `/api/other/api-usage` reads the Anthropic and OpenAI account usage APIs; there was nothing to add `user_id` to. The route is now instance-owner-only.
- **Integrations with global credentials are instance-owner-only from a session**: `finance/paypal/sync` and `finance/snapshot` (Google Sheet). The isolation test found the PayPal sync importing Phil's payments into Tess's space before this fix. `health-import` GET now needs its secret like POST; `cron/drops-monitor` and `cron/google-sync` fail closed when `CRON_SECRET` is unset; `briefings/morning` accepts only the cron principal or the instance owner; the calendar cache is keyed per user.
- Where a route still needs the caller's uid for something real (task `owner` default, the capture-rules cache key), it reads `x-principal-user` from the middleware, which works for sessions, API_SECRET and break-glass alike.
- A CRON_SECRET bearer on a non-cron route now yields a principal with no user; such a route gets no rows (and `/api/settings` 500s on its auto-insert). Cron only ever calls cron routes, so this is left as is.

### Debt for later parts

- `foods` upserts target partial unique indexes (`WHERE off_id IS NOT NULL`) which PostgREST's `on_conflict` cannot name; the barcode path may fail at runtime. Pre-existing; check when nutrition is next touched.
- `app/api/settings` GET seeds `display_name: "Phil"` for any new user; Part 4's onboarding should set the real name.
- `app/api/agents/[agentId]` calls `txn_agg` with only two of six defaulted arguments; if PostgREST refuses, spend shows "unknown" (it is inside a try/catch).
- `app/api/capture-audio` constructs the client five times per request; hoist.
- `lib/router/rules.ts` still caches per user id supplied by the caller; fine, but the Telegram path supplies the bound uid.
- **Part 4** adds `invites` to `ACCESS_TABLES`; **Part 5** replaces `recordBreakGlassUse`, adds re-auth, remote sign-out (same `my_sessions` shape), audit writer, and should audit the admin feature-flag endpoint.

---

## What Part 4 built

| Area | Content |
|---|---|
| `0112_teams_invites.sql` | `invites` (email, team, role, sha256 token hash, 7-day expiry, single use); **invite-only sign-up** enforced by a BEFORE INSERT trigger on `auth.users` (only Phil, or an email with a live invite, or a session that set `app.allow_uninvited` — tests and seeds); SECURITY DEFINER functions for every operation: `create_team`, `rename_team`, `set_team_member_role`, `set_team_member_sections`, `remove_team_member`, `set_team_successor`, `transfer_team_ownership`, `appoint_team_successor` (instance owner, only when the owner is gone), `leave_team`, `create_user_grant`, `revoke_user_grant`, `find_user_by_email`, `create_invite`, `invite_preview` (anon), `accept_invite`, `requires_totp`; teammates and grant parties can read each other's profile names |
| `0110` fix | The `team_members` select policy joined `team_members` (Postgres: infinite recursion the first time a user read it). Replaced with `app.is_team_member()`, a definer check. Found by the browser flow, not the SQL tests, because those read membership as superuser |
| API | `/api/teams` (list, create), `/api/teams/[id]` (detail, rename, successor, transfer, appoint), `/api/teams/[id]/members/[userId]` (role, section toggles, remove), `/api/teams/[id]/leave`, `/api/invites` (create + email), `/api/invites/[token]` (public preview, accept), `/api/grants` (given/received, create), `/api/grants/[id]` (revoke/decline), `/api/users/lookup` (exact email only) |
| UI | Settings → **People & teams** (`/other/settings/people`): teams, members with role select and a per-section verb grid, invites with the link shown when Resend is absent, successor, leave; "Share with a person" (grants; finance and platform absent); "Shared with me" (decline). `/invite/[token]`: public landing, magic link / password / Google, accept, welcome, TOTP hand-off for admins and owners |
| Mandatory TOTP | `requires_totp()` is true for the instance owner and every team owner/admin. The login page sends such a user with no verified factor to Security with `?enrol=totp`; the invite welcome does the same for admin/owner roles |
| Email | `lib/system/email.ts` (Resend; without `RESEND_API_KEY` the invite is logged and the link returned to the inviter's UI) |
| Registry | `ACCESS_TABLES` gains `invites` |
| Tests | `lib/access/teams.test.ts` (27); vitest now runs files serially — the access suites share fixtures on one database |

### VERIFY 4 results

- **Role × section × verb matrix** (team space, PostgREST as the second user): admin and member get view/edit/create on organisation, fitness and health; viewer gets view only; no membership gets nothing. **Toggles**: fitness edit off narrows a member to view; other sections unaffected; a viewer given every toggle still cannot edit; an admin cannot narrow another admin; nobody narrows the owner.
- **Direct-grant matrix** (personal space): `view` → read only; `view,edit` → edit, no create; `view,create_delete` → create, no edit; a grant on another group hides the row; empty group list = whole section; the grantee can decline; a revoked grant is dead.
- **Finance** absent from `SHAREABLE_SECTIONS` / `GROUPS_BY_SECTION` and refused by `user_grants` constraint; platform likewise.
- **One-owner index** refuses a second owner; the access tables are read-only through PostgREST.
- **Successor flow**: owner cannot leave without a member successor; a non-member cannot be successor; leaving transfers ownership, clears the successor, keeps the old owner's rows in the team space (contributions stay).
- **Invites**: token is hex-64 and only its hash is stored; preview works anonymously; the wrong email cannot accept; accepting joins the team, seeds `ui_prefs.hidden_sections = [finance, studio, ventures, drops, the-boys]` with AI features off, and spends the token; a second accept and an expired invite are refused; an admin may invite member/viewer but not admin; a viewer cannot invite; **the database refuses an uninvited sign-up**.
- **Browser flow** (Playwright, 15/15): the instance owner without an authenticator is sent to enrol and enrols; creates a team and an invite from the People page (link shown, Resend absent); a fresh browser opens the link, sees team and role anonymously, creates a password account for the invited address, accepts, sees a welcome, lands on a first screen with Organisation, Fitness and Health and without Finance, Studio, Ventures or Drops; the link is then single-use; the new member sees the team and none of Phil's personal tasks; Phil sees the new member.
- `npm test` 144/144 (serial), isolation test re-run after Part 4 (below), build clean.

### Decisions taken in Part 4

- Invite-only is enforced **in the database**, not only in the UI: the trigger on `auth.users` means neither the dashboard, GoTrue sign-up, a magic link nor Google can create an account without a live invite for that exact email.
- Invite links use the request origin in development and `PUBLIC_BASE_URL` in production. The email fallback (no Resend key) returns the link to the inviter; production must have the key.
- Admin/owner TOTP is "forced" at the two entry points (login after first factor; invite welcome) plus `requires_totp()` for the UI. It is not yet enforced per request by the middleware — Part 5's re-auth rule is the place to make sensitive routes demand aal2 for those roles.
- The instance-owner "appoint successor" only works when the owner's profile is gone (deleted user). Part 5's "disable user" should extend `appoint_team_successor` to disabled owners.

### Debt

- The People page does its own `fetch` wrapper; the settings page has a similar one — fine for now, consolidate when a third appears.
- `find_user_by_email` requires the exact address; there is deliberately no search.
- `app/api/settings` still seeds `display_name: "Phil"` when a user has no settings row; `accept_invite` now seeds the row first for invited users, so only Phil ever hits that path.

---

## What Part 5 built

| Area | Content |
|---|---|
| `0113_audit.sql` | `audit_events` (append-only; no FK on actor so history survives deletion); **triggers** on `auth.sessions` (sign_in/sign_out), `auth.mfa_factors` (mfa_enrol_started/enrolled/removed), `invites`, `team_members`, `team_member_sections`, `teams` (ownership_transferred, successor_changed), `user_grants`; `app.audit()` for functions; `profiles.disabled_at` with `app.personal_space()`/`accessible_spaces()` returning nothing for a disabled user; `end_session()` (remote sign-out); `app.delete_user()` + `delete_my_account()`; `admin_users/teams/memberships/grants/invites/audit()` (instance owner, access tables only), `admin_set_user_disabled()`, `admin_delete_user()`, `admin_get/set_feature_flags()` (the one sanctioned write to a content table, confined to three columns); `my_personal_space()` |
| `0114_rate_limits.sql` | Postgres token bucket `rate_limit_take(key, capacity, refill/min, cost)` shared by every instance; `second_factor_failed/locked/succeeded()` — ten failures in fifteen minutes lock, success clears, lock audited |
| Audit writer | `lib/system/audit.ts` (service role, fire-and-forget) for break-glass requests, cross-user reads, exports; `lib/system/readAudit.ts` `auditListRead(req, rows, section, group)` wired into the list routes of every shareable section (one event per foreign space per request, never per row) |
| Break-glass | Part 1's TODO resolved: middleware passes `x-principal-path`; `createUserClient()` writes one `break_glass_request` row per request |
| Re-auth | `lib/auth/reauth.ts` (HMAC over {sub, iat}, keyed on `SUPABASE_JWT_SECRET`, ten minutes); middleware demands aal2 **and** the cookie on `/admin`, `/api/admin`, `/api/account`; `POST /api/auth/reauth` sets it after a fresh TOTP verify; the security page prompts with `?reauth=1&next=` |
| Rate-limited auth | `POST /api/auth/password` (per IP and per email), `/api/auth/magic-link` (per IP and per email, never creates a user), `/api/auth/mfa/verify` (lockout + per IP), invite creation (per user). The login page uses these; passkey stays client-side (WebAuthn) |
| Sessions | `DELETE /api/auth/sessions/[id]` (remote sign-out, audited); the security page has a button per session |
| Account | `GET /api/account/access-log` ("who has seen my data"), `POST /api/account/delete` (aal2 + re-auth + typed email; instance owner refused), `GET /api/export/space` (zip of the personal space by entity group, JSON + CSV per table, audited) with a button on `/other/export` |
| Admin | `/admin` (users: disable/enable; teams with "owner gone" → appoint successor; grants; invites; audit with actor/subject/team/section/action/date filters) over `/api/admin/*`, all through the `admin_*` functions; `lib/access/admin.test.ts` proves no admin code path names a content table, statically and in the SQL sources |
| Registry | `ACCESS_TABLES` gains `audit_events`, `rate_limits`, `second_factor_failures` |

### VERIFY 5 results

- **Database suite** (`lib/access/security.test.ts`): an audit row exists for team_created, invite_created, invite_accepted, member_added, role_changed, sections_changed, successor_changed, grant_created, grant_revoked, member_removed, sign_in (real GoTrue password grant), mfa_enrol_started, mfa_enrolled, mfa_removed, session_revoked, sign_out, second_factor_locked, user_disabled, account_deleted; the subject sees their rows, a third user does not; the bucket trips at capacity and refills by elapsed time; ten failures lock, the eleventh after fifteen minutes does not, success clears; a disabled member sees nothing and cannot write, enabling restores; deleting a user leaves **zero** rows in their personal space (all 85 tables), removes the space, profile, memberships and grants, and keeps their team row with `created_by = null`; the instance owner cannot delete themselves.
- **Admin suite** (`lib/access/admin.test.ts`): no `.from("<content table>")` under `app/api/admin`, `app/admin`, `lib/system/admin.ts`; no `admin_*` SQL function names a registered table, except the feature-flag pair naming `user_settings` and only its three flag columns.
- **HTTP driver** (dev server): see the run below.
- `npm test` 156/156, isolation gate, build clean.

### Decisions taken in Part 5

- Sign-in, sign-out and MFA events come from **triggers on the auth tables**, not from the app: they fire for every code path (dashboard, GoTrue REST, browser), and the app cannot forget to log them.
- The feature flags stay on `user_settings` (Part 3 put them there); the admin write goes through a SQL function confined to three columns rather than moving the columns, and the admin test names that as the single exception.
- Re-auth uses TOTP only for now. Passkey re-auth needs a browser-side WebAuthn round-trip through a dedicated endpoint; noted as debt.
- A CRON_SECRET bearer on a non-cron route still yields a userless principal (Part 3 note); unchanged.
- Cross-user reads are audited from the list routes (the API layer), one row per foreign space per request; single-row GETs are not audited (the list that led there was).

### Debt

- Passkey re-auth; per-request enforcement of "TOTP mandatory" for owners/admins (today: login and invite entry points + re-auth on sensitive routes).
- The admin audit table is unpaginated beyond the 1000-row cap.
- `lib/system/readAudit.ts` caches personal spaces for five minutes per process; a user deleted in that window could still be attributed a read.

---

## What Part 6 built

| Area | Content |
|---|---|
| `0115_rundowns.sql` | `rundown_settings` (per team: enabled, content blocks, sections, day/hour UTC), `rundown_subscriptions` (per member: channels, opt-out, slot override), `rundown_issues` (per team, recipient, ISO week, channel: rendered html/text, sent_at, error); `set_rundown_settings()` (owner), `set_rundown_subscription()` (member); recipients read only their own issues |
| Renderer | `lib/rundowns/render.ts` — runs with the recipient's client, so RLS decides content: changed rows this week, upcoming in the next seven days, totals per table, who did what (names via teammate-visible profiles). Column probes keep it safe across tables |
| Delivery | `lib/system/rundowns.ts` `runRundowns()` — service role reads only who gets one (settings, members, subscriptions, profiles), renders **once per recipient under `withUser(recipient)`**, stores an issue per channel, delivers by email (Resend), web push (the recipient's own subscriptions, read as them), in-app, and Telegram **only for Phil**; idempotent per (team, recipient, week, channel) |
| Routes | `GET /api/cron/rundowns` (hourly, CRON_SECRET; instance owner may `?force=1&team=`), `GET/PATCH /api/rundowns` (settings for owners, subscription for members) |
| UI | People & teams → team card → "Weekly rundown": owner switches on, picks blocks, sections and slot; every member picks channels, opt-out and their own slot. `/rundowns/[team]/[week]` shows the recipient's stored copy |
| Registry | `ACCESS_TABLES` gains the three rundown tables |

### VERIFY 6 results

- `lib/rundowns/rundowns.test.ts`: a team with Tess (admin) and Vic (member, organisation toggled off) and Phil (opted out): Tess's issue contains the team task and the workout and names Phil as contributor; Vic's contains the workout only — no task, no organisation heading, no organisation totals; the opted-out owner gets no issue; a second run renders nothing and stores nothing new.
- HTTP driver (dev server): cron refused without the secret; with CRON_SECRET renders one issue for the subscribed member and skips the opted-out one; the member opens `/rundowns/[team]/[week]` and sees the task; a non-member and the opted-out owner get 404; a non-owner cannot change team settings; a member can opt out and read their own settings/issues.
- Email and push deliveries fail closed locally (no Resend key, no push subscriptions) and are recorded on the issue row with the error; in-app always succeeds.

### Decisions taken in Part 6

- Rendering is by the recipient's RLS, not by re-implementing toggles in the renderer. That is the whole point: the renderer cannot leak what the policies would not show.
- The cron is hourly; each team has a UTC day and hour and each member may override theirs. Vercel's cron entry for `/api/cron/rundowns` still needs adding to `vercel.json` (hourly) — see the checklist.
- Issues store the rendered HTML/text so the in-app page and any resend show exactly what was sent.

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
  `SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY`,
  **`SUPABASE_JWT_SECRET=$JWT_SECRET`** (from Part 3 on: withUser and the
  API_SECRET/break-glass principals mint tokens with it), plus
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
- **Port 54322 "forbidden by its access permissions" on `supabase start`**
  (seen 2026-09-11 right after `supabase stop`): Windows had put
  54233–54332 into a Hyper-V dynamic reservation. Fix, from an admin shell:
  `net stop winnat`, `net start winnat`, then
  `netsh int ipv4 add excludedportrange protocol=tcp startport=54321 numberofports=12`
  so the stack's ports are reserved for it permanently (that entry is now
  in place). The other project's stack (`PhirstMaxxing`, ports 553xx) is
  unaffected.
- **Vercel CLI** (`npm i -g vercel`, 59.x) is logged in on this PC as
  `sporebit`; team slug `sporebit-s-projects`, project `mycelium`,
  `.vercel/repo.json` links the repo. The team is on **Pro** (hourly cron
  allowed). `vercel env ls` shows Production + Preview targets only — no
  Development values exist.
- `supabase storage cp -r` is unsupported in CLI 2.116; use the Storage
  API (see the rollback doc §1.3).
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

Parts 0–6 are done. The next session is either Phil's Part 7 (see below)
or maintenance on the branch. For either:

1. `git checkout multi-user`; `git log -10` shows one commit per Part.
2. Launch Docker Desktop if `docker info` fails, then `supabase start`.
   `npm test` must pass (chain at `0115`; 156 tests, serial). Start
   `next dev` with the env overrides above (including
   `SUPABASE_JWT_SECRET=$JWT_SECRET`) and run `npm run isolation-test`;
   it must end with 0 leaks. That is the regression gate.
3. The cutover run-book (the "Mycelium Cutover" checklist page, v3) now
   drives Part 7: Claude Code runs every step with an API or CLI once Phil
   mints the tokens in its step 0.4. Done without tokens on 2026-09-11:
   checklist §4 (dump + replay), §4b (plan is Pro), and the run-book's
   4.2 gate on the restored data (tests, isolation, clean build,
   `db push --dry-run` = exactly 0102–0115). Still needing tokens or
   Phil: §1 (auth config — one Management API call), §2 (Resend + IONOS
   DNS), §3 (env vars), the Google OAuth client, the staging rehearsal if
   chosen, and the gate itself.
4. Part 7 (cutover) is a separate session with Phil present: renumber if
   `main` moved; merge; insert Phil's live auth user with the fixed id and
   his real email BEFORE `supabase db push`; push; `supabase migration
   list`; run `scripts/verify-ownership.ts` and `scripts/isolation-test.ts`
   against production; Phil spot-checks every section; delete `USER_ID`,
   `DASHBOARD_PASSWORD`, `AUTH_SECRET` from Vercel; keep the dump a week.
   Rollback is `docs/multi-user-rollback.md`.
