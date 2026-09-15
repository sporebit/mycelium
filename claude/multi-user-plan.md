# Multi-user / Teams — Plan and Decision Record

*Written 2026-09-06 from Phil's 29 answers (Q1–Q25 plus splits) and a crawl of the repo at `A:\Projects\Mycelium` (migrations 0001–0096, `middleware.ts`, `lib/supabase/*`, `lib/auth/cookie.ts`, `MYCELIUM_ALL_PROMPTS.md` P10, `package.json`). Supersedes the P10 prompt in `MYCELIUM_ALL_PROMPTS.md`; P10's branch-only rule and isolation-test requirement carry over. Status: **plan agreed in principle, not started.** Open items at the end need a nod before Phase 1.*

---

## 0. What the repo actually looks like (facts the plan rests on)

| Fact | Evidence | Consequence |
|---|---|---|
| Single user identified by `USER_ID` env, stored as `user_id text` on 45 tables | `0001_init.sql`, `.env.example`, P10 prompt ("implicit via USER_ID env") | Ownership already exists as a column on half the schema; the other half needs it. Type is `text`, not `uuid`. |
| 88 tables in migrations; **45 with `user_id`, 43 without** | migration crawl (list in §4) | The 43 split into child tables (scoped through a parent, e.g. `workout_sets`) and standalone tables with no owner at all (e.g. `investments`, `blood_test_results`, `recipes`, `ventures`). |
| **32 tables have no RLS at all** per the migration files — everything created 0051–0090 except `media_items`, plus `user_settings` (0075, which holds the Google OAuth token columns from 0088) | no `enable row level security` in 0051, 0053, 0061–0071, 0075, 0076, 0087, 0090 | Supabase grants `anon` and `authenticated` full CRUD on `public` tables by default. A table with no RLS is readable and writable by anyone holding the anon key, which ships in the browser bundle. This includes `spotify_tokens` (OAuth refresh tokens), `user_settings` (Google tokens, Telegram chat id), `blood_test_results`, `investments`, `accounts`, `eye_prescriptions`, `gut_health_logs`, `ventures`, `drops`. **Verify in the dashboard's Security Advisor; if confirmed, this is Phase 0 and does not wait for multi-user.** |
| All server data access is `createServerClient()` = service role (bypasses RLS) | `lib/supabase/server.ts`; ~238 references per graphify | Authorisation today is "whoever is past middleware sees everything". Multi-user means replacing this call at every site with a user-scoped client, and confining the service-role client to system code. |
| Auth = HMAC cookie (`AUTH_SECRET`, 30-day), plus `API_SECRET`, `CRON_SECRET`, path-scoped `PC_METRICS_SECRET` | `middleware.ts`, `lib/auth/cookie.ts` | No `@supabase/ssr`, no Supabase Auth in use. `push_subscriptions.user_id` is `uuid references auth.users(id)` — the only table already shaped for Supabase Auth. |
| `reminders` uses a `current_setting('app.user_id')` policy; everything else with RLS is deny-all restrictive + service_role grant | 0044 vs 0092/0094 | Two policy styles exist; both get replaced. |
| Agent memory is global per agent, not per user | 0053 `agent_memory(agent_id pk)` | Confirms Q4 (agents Phil-only in v1). |
| OAuth tokens stored in plaintext: `spotify_tokens` table, `google_*_token` columns on `user_settings` | 0069, 0088 | Both single-account. Stay Phil-only in v1 (Q3). |
| `user_settings.telegram_chat_id` already exists per user | 0075 | Future per-user Telegram linking has a home; not built in v1 (Q3, Q20c). |
| Supabase **Free** plan | Q2b | **No backups of any kind** (not daily, not PITR), no branching, projects pause after 7 idle days, basic TOTP MFA included, 50k MAU. I said "Free's daily backup" in Q2c — wrong; Free has none. The one-off `pg_dump` (Q2c) is the only safety net. |
| `@supabase/supabase-js ^2.106.1`; no email library; `web-push` present | `package.json` | Passkeys need ≥2.105 (met) plus `experimental: { passkey: true }`. Email needs a provider (Resend) — for Supabase Auth's own emails too, since the built-in sender is rate-limited to a handful per hour and unsuitable for production. |
| Spec drift found: 96 migrations (spec said 95; `0096_receipt_splits.sql` added w/c 31 Aug); `vercel.json` crons are `briefings/morning` ×2 and `finance/paypal/sync`, not the reminders/google-sync/drops-monitor list | repo | Corrected in `spec-index.md` / `spec-platform.md` this session. |

---

## 1. Decision record (Phil, 2026-09-06)

| # | Decision | Notes |
|---|---|---|
| 1 | ≤5 users in the first year | Hand-holding is fine; no cost controls beyond feature defaults. |
| 2a | **No gate** on P10 Part 0 / off-site backup | Phil's call. Flagged once (§2). |
| 2b | Supabase Free | See §0. |
| 2c | One-off `pg_dump` to the PC immediately before the cutover migration | Kept until live site verified. |
| 3 | Non-Phil users: web + push only | Integrations (Google, Spotify, Apple Health, Telegram, PC agent) stay Phil-only. |
| 4 | Agents (The Boys, coach, advisor): Phil-only | Memory and tools not scoped in v1. |
| 5 | Auth methods: passkeys, magic link, password + TOTP, Google/Apple | All four. Build order and caveats in §2/§5. |
| 6a | HMAC cookie kept as **break-glass** | Dormant by default (§3.6). |
| 6b | Crons/secret callers = system principal that iterates users; inbound secrets map to a bound user | `HEALTH_IMPORT_SECRET`, `PC_METRICS_SECRET` bind to Phil via config. |
| 7 | Instance owner manages access only; **cannot read content** without a grant | Admin panel filters grants/activity, never data. RLS has no instance-owner bypass. |
| 8 | **Personal + team spaces**, both first-class | Every record has one `space_id`. |
| 9 | Grain: **section + entity type** | No per-record sharing. |
| 10 | Verbs: view, edit, create+delete, share | Share = manage grants; owner/admin only by default. |
| 11 | Trainer/buddy link = **separate user→user grant** (not a 2-person team) | Two grant sources, one enforcement path (§3.4). |
| 12 | **Finance hard-excluded** from sharing | Enforced by constraint and by policy shape, not by convention. |
| 13a | Owner leaves → transfers to a **named successor**; instance owner can appoint if the owner vanishes (audited) | |
| 13b | Member leaves → contributions **stay with the team** | |
| 14 | Cutover: everything → Phil's personal space; teams start empty | |
| 15 | Roles: **owner / admin / member / viewer** (fixed) + per-member section toggles | No custom roles in v1. |
| 16 | **Invite-only**; owner + admins invite; email, single-use, 7-day expiry; account exists only on acceptance | |
| 17 | Audit **includes cross-user reads**, visible to the data owner | |
| 18 | Device list + remote sign-out; re-auth for sensitive actions; rate limiting + lockout on auth | Short admin sessions not chosen. |
| 19 | **Export + full delete** on request | Self-service. |
| 20a | Rundown channels: email, push, in-app, Telegram | Telegram Phil-only (20c). |
| 20b | Owner enables per team; recipients can opt out and pick day/time | |
| 20d | Rundown content: what changed, what's coming, stats, per-person highlights — each toggleable per team | |
| 21 | KB audience: both, with visibility levels (instance / team / all users) | |
| 22 | KB is **separate content** from project docs; no mirroring | Project docs remain Claude's working record. |
| 23 | KB: Markdown, textarea + preview, **full version history** with diff and revert | |
| 24 | KB: **any team member** can edit team pages; instance pages Phil only | History makes this safe. |
| 25 | KB: tree + `[[wiki-links]]` + per-feature "i" hooks; ⌘K search | |

---

## 2. Flags (raised once; complied with unless Phil reopens)

1. **No backup gate on a plan with zero backups.** Free has no backups at all, and the cutover rewrites ownership on every table. The one-off dump (2c) is the whole safety net. The plan puts that dump *inside* the cutover runbook so it cannot be skipped by accident, and rehearses the full migration chain on a local Supabase stack (`supabase start`, free) before it touches the live DB. If Phil ever moves to Pro (£20-ish/month), daily backups come with it and this flag closes.
2. **Four sign-in methods for five users.** Each method is attack surface and maintenance. Passkeys are a **beta, explicitly experimental API** (announced 2026-05-28, may change without notice). Apple sign-in needs an Apple Developer Program membership (~£79/yr) and Google needs an OAuth consent screen. Build order therefore: magic link + password/TOTP first (stable, needed for admin MFA anyway) → passkeys behind the experimental flag → Google → Apple last, only when Phil confirms the developer account. TOTP is **mandatory** for instance owner, team owners and admins regardless of how they sign in.
3. **Separate direct-grant primitive (Q11).** Accepted, with one condition that keeps it safe: both team membership and direct grants resolve through the *same* SQL function (`app.accessible_spaces(entity_group, verb)`). There is one policy per table and one code path; the two grant *sources* are rows in two tables, not two enforcement mechanisms.
4. **Any member edits team KB pages (Q24).** Fine given full history; edits are attributed and revertible. No flag beyond noting it.
5. **AI-backed features for other users** (not asked, needs a decision): voice capture (Whisper), AI categorisation, vision scan and capture classification all bill Phil's keys and are switched on by default in `user_settings`. Proposed default: **off for non-Phil users**, instance owner can enable per user, `api_usage` gains `user_id`. Listed as open item A.

---

## 3. Security architecture

### 3.1 Identity
Supabase Auth. `auth.users(id uuid)` is the identity; a `profiles` table (id = auth uid, display name, `is_instance_owner boolean`, `personal_space_id`) carries app data. Exactly one profile has `is_instance_owner = true` (partial unique index). Existing `user_id text` columns are **converted to `uuid`** with FK to `auth.users` (Phil's `USER_ID` string maps to his new auth uid in the backfill; if `USER_ID` already is a uuid present in `auth.users` — `push_subscriptions` suggests it might be — the mapping is the identity). `USER_ID` and `DASHBOARD_PASSWORD` env vars are deleted after cutover.

### 3.2 Spaces
`spaces(id, kind personal|team, owner_user_id null, team_id null)`. One personal space per user (created on account creation); one space per team. **Every user-data table gets `space_id uuid not null references spaces(id) on delete cascade`**, including child tables (denormalised, so policies never join). `user_id` is renamed `created_by uuid null` (on delete set null) so team contributions survive a member leaving (13b).

### 3.3 Entity registry
A code constant and a SQL table `entity_groups(table_name, section, entity_group)` map every table to a section (organisation, fitness, health, finance, studio, drops, ventures, journal, places, reminders, media, platform) and an entity group (e.g. `fitness.sessions` = `workout_sessions` + `workout_session_exercises` + `workout_sets`; `fitness.body_metrics` = `body_metrics` + `health_metrics`). Grants name entity groups. The registry is the single list used by RLS, the grant UI, the export tool, the delete cascade and the rundown generator. Adding a table without registering it fails a test.

### 3.4 Authorisation (one path)
```
app.accessible_spaces(entity_group text, verb text) returns setof uuid
  = the caller's personal space
  ∪ team spaces where the caller is a member whose role/section toggles allow (entity_group, verb)
  ∪ personal spaces of users who have granted the caller (entity_group, verb) directly (unexpired, unrevoked)
```
Per-table policies for `authenticated`:
`for select using (space_id in (select app.accessible_spaces('<group>','view')))`, and likewise `insert`/`update`/`delete` with `create`/`edit`/`delete`. `STABLE`, `SECURITY DEFINER`, evaluated once per statement. The restrictive deny-all policies are dropped on tables that receive real policies; `anon` is revoked from every table.

**Finance tables** never call the helper: `using (space_id = app.personal_space())`. There is no grant path, so no misconfiguration can open it (Q12). `user_grants` additionally carries `check (section <> 'finance')`.

**Instance owner** has no policy exception anywhere (Q7).

### 3.5 Clients
- `createUserClient()` (via `@supabase/ssr`, session cookie) — the only client in pages and `/api/*`. RLS is the wall; app code adds UX, not security.
- `createServerClient()` (service role) moves to `lib/system/` and is importable only from there (ESLint `no-restricted-imports`). Used by: cron routes, webhooks, invite acceptance, account deletion, audit writer, admin panel (reads of membership/grant/audit tables only).
- `withUser(userId, fn)` — system code that must read *content* (rundowns, reminders, briefings) does so **as that user**: mint a short-lived HS256 JWT (`role: authenticated`, `sub: userId`) with the project's JWT secret and call PostgREST with it, so RLS filters exactly as it would in the browser. Pre-flight check: confirm the legacy JWT secret is active in the dashboard; if the project has moved to asymmetric signing keys only, fall back to a dedicated non-bypass Postgres role via a direct `pg` connection with `set local app.acting_user`.

### 3.6 Middleware order
1. Public prefixes (login, auth callbacks, Telegram webhook, health import, cron endpoints) — unchanged list, each route validating its own secret.
2. Path-scoped secrets (`PC_METRICS_SECRET`) — unchanged.
3. `CRON_SECRET` / `API_SECRET` → request tagged `principal: system` (API_SECRET acts as Phil only; no acting-user header).
4. Supabase session (refresh via `@supabase/ssr`).
5. Break-glass: `BREAK_GLASS_ENABLED=true` **and** valid HMAC cookie signed with a new `BREAK_GLASS_SECRET` → acts as Phil, writes an audit event on every request. Flag is `false` in Vercel by default; Phil flips it only when Supabase Auth is down. `AUTH_SECRET` is retired.
6. `/admin/*` and every "sensitive action" route additionally require `aal2` (MFA) and a re-auth timestamp under 10 minutes old (signed server cookie set by a fresh TOTP/passkey verify).

### 3.7 Teams, roles, grants
- `teams(id, name, slug, space_id, owner_user_id, successor_user_id null, created_at)`; **one owner** = `team_members` partial unique index on `(team_id) where role = 'owner'`.
- `team_members(team_id, user_id, role owner|admin|member|viewer, joined_at)`; `team_member_sections(team_id, user_id, section, can_view, can_edit, can_create_delete, can_share)` — role sets defaults, toggles narrow (never widen beyond role).
- Role defaults: owner = everything incl. share and settings; admin = view/edit/create/delete all sections + invite + share; member = view/edit/create/delete in enabled sections; viewer = view in enabled sections.
- `user_grants(id, grantor_id, grantee_id, section, entity_groups text[], verbs text[], expires_at null, revoked_at null, created_at, reason text)` — grantor's personal space only; creating one requires re-auth; grantee sees it under Settings → "Shared with me". Trainer case: Fitness + Health, view (+ edit on `fitness.programmes` if the trainer writes the plan).
- Team membership grants access to the **team space only**, never to members' personal spaces (that needs a direct grant). This is the rule that keeps "a team uses Organisation" from becoming "the team sees my tasks".
- Leaving/removal: membership row deleted; contributions stay (`created_by` retained). Owner leaving must name a successor first (UI blocks otherwise); if the owner is deleted or disabled, the instance owner appoints one — audited.
- `invites(id, email, team_id null, role, token_hash, expires_at, accepted_at, invited_by, created_at)`; 7 days, single use, hash-only at rest; accepting creates the auth user (`inviteUserByEmail` → onboarding sets auth method), the profile, the personal space, and the membership. No invite, no account.

### 3.8 Audit
`audit_events(id, at, actor_id, principal user|system|break_glass, action, section, entity_group, entity_id, subject_user_id, space_id, team_id, ip, user_agent, meta jsonb)`. Written for: sign-in/out, MFA changes, invites, membership and role changes, grants created/revoked, successor changes, exports, deletions, break-glass use, and **cross-user reads** — one event per request where the resolved space owner ≠ actor (written in the API layer, not per row). Owner-visible page: Settings → Security → "Who has seen my data". Instance owner sees the whole log, filterable by actor / subject / team / section / action / date. Retention 12 months.

### 3.9 Sessions, rate limits, data rights
- Device list = `auth.sessions` rows for the current user (via system client); remote sign-out = delete the session row / `auth.admin.signOut(scope)`.
- Rate limiting: Postgres-backed token bucket (`rate_limits(key, window_start, count)` + one function) applied to login, magic-link request, invite creation, TOTP verify; lockout after 10 failed second-factor attempts in 15 minutes. No new vendor. Supabase Auth's own limits stay on as a second layer.
- Export: extend `/other/export` to dump the caller's personal space by entity group (JSON + CSV zip).
- Delete account: `app.delete_user(uuid)` — deletes the personal space (cascade takes every row), memberships, grants (both directions), invites, push subscriptions, audit rows where the user is actor *and* subject older than 30 days; then `auth.admin.deleteUser`. Team contributions remain with `created_by = null`. Requires re-auth and a typed confirmation.

---

## 4. Table classification (from migration files — Phil to confirm, replaces the P10 Part 0 gate)

**Already carry `user_id` (45):** entities, raw_captures, tasks, daily_logs, memory_chunks, audit_log, workout_programmes, workout_programme_phases, workout_sessions, body_metrics, exercise_baselines, exercise_pain_logs, pending_workout_routes, workout_session_types, people, people_mentions, dashboard_layouts, projects, purchases, routing_rules, task_comments, task_activity, foods, meal_groups, nutrition_logs, context_options, workouts, entity_review_rules, pending_entities, bank_accounts, transactions, paypal_payments, push_subscriptions, supplements, supplement_logs, pc_components, places, reminders, health_metrics, health_workouts, exercise_aliases, media_items, user_settings, receipts, receipt_settlements. → get `space_id` (= owner's personal space), `user_id` → `created_by uuid`.

**Child tables, scoped via parent (14):** workout_programme_sessions, workout_programme_exercises, workout_session_exercises, workout_sets, people_aliases, media_episodes, venture_steps, venture_ads, venture_inspiration, receipt_images, receipt_lines, receipt_participants, receipt_line_shares, pc_metrics_hourly. → `space_id` denormalised from parent in the backfill.

**Standalone with no owner today (23; must be assigned to Phil's personal space):** blood_test_sessions, blood_test_results, gut_health_logs, eye_prescriptions, recipes, shopping_lists, meal_plan, events, investments, accounts, ventures, drops, wishlist_items, raffle_entries, drop_monitors, agent_conversations, agent_messages, spotify_tokens, spotify_plays, pc_metrics, bin_schedule_config, bin_garden_seasons, bin_google_events.

**Shared reference (6; no `space_id`; read-only policy for `authenticated`):** agents, agent_memory (Phil-only feature — keep service-role only), workout_exercises (exercise library), blood_test_markers, cook_guides, weather_cache. **Question for Phil:** is `workout_exercises` a shared catalogue or personal? It has no owner column, so today it's effectively shared.

`pc_metrics` is a special case: owned by Phil's space, but the Pi/agent path uses `PC_METRICS_SECRET` → bound to Phil (6b).

---

## 5. Phases

Each phase ends with its verification, a build (`rm -rf .next && npx next build`), and a commit on branch `multi-user`. Migrations are authored on that branch only (one worktree owns `supabase/migrations/**`) and are **not pushed to the live DB until cutover**; they are exercised against a local stack. Sizes are rough Claude Code session counts.

### Phase 0 — Close the anon-key exposure (main branch, this week, S)
Migration `0097_rls_everywhere.sql`: for every table in the "no RLS" list (the 32 in §0, `user_settings` included) — `enable row level security`, `deny all` restrictive policy, `grant all ... to service_role` (the 0092/0094 pattern); `revoke all on all tables in schema public from anon, authenticated`; `alter default privileges ... revoke ... from anon`. Push with `supabase db push`.
**Verify:** dashboard Security Advisor shows zero "RLS disabled" findings; a `curl` against `/rest/v1/spotify_tokens` (and `user_settings`) with the anon key returns an empty set or 401 for every table in the list. This is independent of multi-user and must not wait for it.

### Phase 1 — Pre-flight (S)
Branch `multi-user` + worktree. Resend account; `sporebit.com` SPF/DKIM/DMARC; Resend as **custom SMTP in Supabase Auth** and as the app's mailer. Supabase Auth config: email + magic link on, TOTP MFA on, passkeys experimental flag noted, Google provider (client id/secret), Apple deferred. Confirm legacy JWT secret availability (3.5). `supabase start` locally and replay 0001–0097 to prove the chain is clean. Confirm §4 classification with Phil. Write the rollback command sequence (restore dump into a fresh project, repoint env). Record all of it here.

### Phase 2 — Identity (M)
`@supabase/ssr`; `profiles`; Phil's auth user created and linked; new `middleware.ts` (§3.6); login page restyled with v2 primitives (magic link, password, TOTP enrol/verify, passkey register/sign-in behind the flag); `/other/settings/security` (auth methods, TOTP, passkeys, device list). Break-glass path with new secret and flag. Old `AUTH_SECRET` cookie path removed.
**Verify:** Phil signs in every enabled way on a preview deploy; MFA enforced on `/admin`; break-glass works only when flag is on and writes an audit event.

### Phase 3 — Ownership migration (L, the risky one)
Migrations by domain group (platform, organisation, fitness, health, finance, studio/drops/ventures): `spaces`, `teams` scaffold, `entity_groups`; add `space_id` everywhere per §4; convert `user_id text → created_by uuid`; backfill to Phil's personal space; `not null`; FKs; indexes on `space_id`. Reference tables get read-only policies.
**Verify:** per-table row counts identical before and after; `select count(*) where space_id is null` = 0 everywhere; every FK valid; replayed clean on the local stack twice (once from the pg_dump of live).

### Phase 4 — Authorisation + client swap (L)
`app.accessible_spaces` and friends; real policies on every table (§3.4); finance owner-only; `createUserClient()`; replace every `createServerClient()` outside `lib/system/`; cron/webhook/import routes moved to `withUser`/system helpers with explicit user resolution; ESLint restriction; `api_usage.user_id`.
**Verify (the P10 isolation test, unchanged in importance):** a second test user, a script that enumerates every `app/api/**/route.ts` and calls it as that user, asserting zero rows of Phil's data — reported endpoint by endpoint; plus a PostgREST probe per table with the test user's JWT expecting zero rows. RLS unit tests (pgTAP or vitest against local stack) for each policy shape. Phil's own data still fully visible to Phil through every page.

### Phase 5 — Teams, roles, invites, direct grants (M)
Tables and APIs; Settings → "People & teams" (create team, members, roles, section toggles, successor, leave/remove); invite email + accept flow + onboarding (auth method choice, TOTP if admin); "Share with a person" (direct grants, re-auth gated, expiry); "Shared with me"; new-user seeding (`ui_prefs.hidden_sections` = everything except Organisation/Fitness/Health; AI features per open item A).
**Verify:** role × section × verb matrix test (automated) for team spaces; direct-grant matrix for personal spaces; finance never appears in any grant UI or policy; one-owner constraint holds; successor flow.

### Phase 6 — Security operations + admin panel (M)
Audit writer and cross-user read events; owner-visible access log; instance-owner admin panel (`/admin`: users, teams, memberships, grants, invites, audit — all filterable; disable user; appoint successor; **no content**); rate limiting + lockout; re-auth cookie; export; delete account.
**Verify:** audit rows for every action in the list; admin panel returns no content-table data (test hits every admin endpoint and asserts no entity-group tables are touched — via `pg_stat_statements` or policy); rate limits trip.

### Phase 7 — Rundowns (M)
`rundown_settings(team_id, enabled, sections jsonb, content flags, day, hour)`, `rundown_subscriptions(user_id, team_id, channels[], opted_out, day, hour)`, `rundown_issues(team_id, user_id, week, rendered_html, sent_at, channel)`. Generator runs weekly (cron-job.org → `/api/cron/rundowns`), **renders once per recipient under `withUser(recipient)`** so RLS filters each copy; delivers via Resend, web-push, in-app `/rundowns/[team]/[week]`, Telegram for Phil only. Content blocks per 20d.
**Verify:** two recipients on one team with different section toggles receive different content; a member with no access to a section never sees its items; unsubscribed users receive nothing.

### Phase 8 — Knowledge base (backlogged; spec below, M)
`kb_pages(id, scope instance|team|all, team_id null, parent_id null, slug, title, body_md, updated_by, updated_at)`, `kb_page_versions(page_id, version, body_md, edited_by, edited_at, summary)`; `[[slug]]` links resolved at render; `<KbHint page="…">` component for feature hooks; ⌘K indexes titles + headings; editing per Q24; diff view + revert. Separate content from project docs (Q22): project docs stay Claude's record; KB pages are written for humans. Seeded with pages explaining the permission model, spaces, roles, rundowns, and "why finance can't be shared".

### Cutover runbook (after Phase 6 verified on a preview deploy)
1. **`pg_dump` to the PC** (2c) — verify file size against dashboard DB size. 2. Merge `multi-user` → `main`; Vercel deploys with `BREAK_GLASS_ENABLED=false`. 3. `supabase db push` (0098+). 4. Sign in as Phil; run the isolation script against production with the test user; spot-check every section. 5. Delete `USER_ID`, `DASHBOARD_PASSWORD`, `AUTH_SECRET` from Vercel. 6. Keep the dump until step 4 has passed and a week of normal use has elapsed. Rollback = the command sequence written in Phase 1, not improvised on the day.

---

## 6. Testing strategy (summary)
- **Isolation script** (Phase 4, rerun at every later phase and at cutover): enumerate routes, call as test user, assert no Phil ids.
- **Policy unit tests** on the local stack: for each policy shape (personal, team by role, team by toggle, direct grant, finance) a positive and a negative case.
- **Matrix tests** for roles/verbs/sections and for direct grants.
- **Rundown leak test** (Phase 7).
- **Registry test:** every table in `information_schema` is either in `entity_groups`, in the reference list, or the test fails.
- `npx next build` before every commit (AGENTS.md).

## 7. Documentation deliverables
This doc (decisions + plan) · `spec-platform.md` gains an "Identity & access" section at Phase 2 · a new `spec-access.md` once Phase 5 lands (data model + routes for teams/grants/audit) · backlog per phase · KB pages in Phase 8 · a how-to for onboarding a new user (Phil's house style) after cutover.

## 8. Open items (need a nod before Phase 1)
- **A.** AI-backed features (voice capture, AI categorisation, vision scan, capture classification) default **off** for non-Phil users; instance owner can enable per user? *(Recommended yes.)*
- **B.** `workout_exercises` — shared catalogue or personal? (§4)
- **C.** Apple sign-in — do you hold an Apple Developer Program membership? If not, it waits.
- **D.** Convert `user_id text → uuid` (recommended) vs keep text and store uuids as strings. Conversion is cleaner for FKs and `auth.uid()` comparisons; it's also the step most likely to surface a stray non-uuid value, which is why Phase 3 rehearses on the local stack twice.
- **E.** Phase 0 is on `main` and independent — go ahead this week?

## Sources consulted (2026-09-06)
- Supabase passkeys: https://supabase.com/docs/guides/auth/passkeys · https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta
- Default grants / RLS: https://supabase.com/docs/guides/api/securing-your-api
- Plan limits: https://supabase.com/pricing
