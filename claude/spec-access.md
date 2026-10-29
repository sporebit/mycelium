# Spec — Identity & access (as built)

*Written 2026-10-29 from the code (`middleware.ts`, `lib/auth/*`, `lib/system/*`, `lib/access/*`, migrations 0102–0115, 0141) and the as-built record in `docs/multi-user-handoff.md`. The plan and decision record is `claude/multi-user-plan.md` (P12, cut over 2026-09-15). This doc is the owed "spec-access" from that plan. (?) = inferred.*

## Identity

Supabase Auth is the identity. `auth.users(id uuid)` is the user; `profiles` (0102: id = auth uid, display name, `is_instance_owner` with a single-owner partial index, `personal_space_id`, `disabled_at` from 0113) carries app data. Phil is the instance owner (`lib/system/identity.ts` `PHIL_AUTH_UID`; the legacy `user_id text` value `phil` maps to it through `app.legacy_user_uid()`). **Invite-only sign-up**: a BEFORE INSERT trigger on `auth.users` (0112) admits Phil, an email with a live invite, or a session that set `app.allow_uninvited` (tests and seeds). Sign-in methods on `/login`: magic link, password, passkey (behind a flag), Google, TOTP step (`?step=mfa`). TOTP is **mandatory** for the instance owner and every team owner/admin (`requires_totp()`); the login page and the invite welcome send such a user to Security with `?enrol=totp`. The JWT signing keys are asymmetric; the legacy HS256 secret stays active because `withUser()` mints with it — **never rotate it** (`docs/multi-user-handoff.md`).

## Spaces and the entity registry

`spaces(id, kind personal|team, owner_user_id, team_id)` (0103): one personal space per user, created by trigger with the profile; one per team. **Every user-data table carries `space_id not null references spaces on delete cascade` and `created_by uuid` (on delete set null)**, both with defaults (`app.personal_space()`, `auth.uid()`) so inserts need neither. `user_id` columns are gone (0104–0109, checked at the end of 0109).

`lib/access/registry.ts` is the single list: every public base table is in exactly one of `ENTITY_GROUPS` (section + entity group, e.g. `fitness.sessions`, `health.nutrition`), `SHARED_REFERENCE` (no `space_id`, read-only), or `ACCESS_TABLES` (the access machinery itself); views are listed in `DERIVED_RELATIONS`. The SQL table `entity_groups` mirrors it and `lib/access/registry.test.ts` fails if the database and the file disagree. Sections: organisation, fitness, health, finance, studio, drops, ventures, journal, places, reminders, media, platform.

**New tables** (0141 onward) call `app.register_table(table, section, group[, parent_table, parent_col])`: adopt (add/backfill `space_id` and `created_by`), RLS on, deny-all first, service-role grant, registry row, then the 0111 policy and grant loop. Finance and platform are refused by it (owner-only shape, written by hand). Forgetting the loop leaves a table unreadable, not open (the 0124 lesson). Restrictive policy names must be unique per table (the 0146 lesson).

## Authorisation (one path)

`app.accessible_spaces(entity_group, verb)` (0110; STABLE, SECURITY DEFINER) = the caller's personal space ∪ team spaces where the caller's role and section toggles allow the verb ∪ personal spaces of users who granted the caller directly (unexpired, unrevoked). Every content table has four permissive policies for `authenticated` keyed on it (select → `view`, insert/delete → `create_delete`, update → `edit`) (0111). **Finance and platform tables never call it**: `space_id = app.personal_space()`, and `user_grants` carries `check (section not in ('finance','platform'))`, so no configuration can open them. The instance owner has no policy exception anywhere. A disabled user's `app.personal_space()` and `accessible_spaces()` return nothing (0113). `anon` is revoked from every table; the anon key answered 401/42501 on eight tables when probed 2026-10-29.

## Clients

- `createUserClient()` (`lib/supabase/user.ts`) is the only client in pages and `/api/*`. It reads the principal the middleware set: a `user` gets the session cookies; `system` with a user (API_SECRET) and `break_glass` get a five-minute HS256 user JWT minted with `SUPABASE_JWT_SECRET`, so the same RLS applies and routes never know which path they got. Under break-glass it writes one `break_glass_request` audit row per request.
- `withUser(uid, fn)` / `clientForUser(uid)` (`lib/system/withUser.ts`): system code that must read content (crons, webhooks, imports, rundowns, briefings) does so **as that user**. Public-prefix routes receive no principal and must use it, choosing the user through `lib/system/bindings.ts` (integration → user; all Phil today).
- The service-role client (`lib/system/serviceClient.ts`) bypasses RLS and is fenced to `lib/system/**` by ESLint `no-restricted-imports`. `lib/supabase/server.ts` no longer exists.
- Browser: `lib/supabase/client.ts` (anon key via `@supabase/ssr`).

## The gate — `middleware.ts`, in order

1. **Public paths** pass straight through; each route validates its own secret. `PUBLIC_PREFIXES` (`lib/auth/gate.ts`): `/login`, `/api/auth/`, `/api/telegram/webhook`, `/api/cron/reminders`, `/api/health-import`, `/api/cron/drops-monitor`, `/invite/`, `/api/invites/`, `/api/tickets/github` (HMAC-SHA256), `/api/tickets/vercel` (HMAC-SHA1). `PUBLIC_EXACT`: `/api/health` only, the deploy smoke check. **Until 2026-10-29 `/api/health` was a prefix, so every `/api/health/*` route (the health module) skipped the gate** — browsers still worked because the user client fell back to cookies and RLS held, but `x-api-secret` was ignored there and unauthenticated calls got 500 from the anon role instead of 401. Fixed in `41c5035`; the gate test now proves `/api/health/gousto` is gated.
2. `Bearer PC_METRICS_SECRET` admits `/api/studio/pc-metrics` only.
3. `Bearer CRON_SECRET` → principal `system` with no user (cron routes pick their users). `x-api-secret: API_SECRET` → `system` acting as Phil; no acting-user header from a caller is ever honoured (the smoke-test path, see memory).
4. `Bearer mtk_…` scoped API tokens (`lib/system/apiTokens.ts`, tickets spec §14.4): sha256 at rest, resolved to the owning user; scopes = projects × verbs × route families; out of scope or a sensitive path → 403 `token_scope`; scopes travel in `x-principal-scopes`. Minted at Settings → Security → API tokens.
5. Supabase session: refreshed on every request (`@supabase/ssr`), verified with `getClaims()`; `aal2` when the session carries a verified second factor.
6. Break-glass: only while `BREAK_GLASS_ENABLED=true` **and** the HMAC cookie verifies against `BREAK_GLASS_SECRET` (`lib/auth/cookie.ts`); acts as Phil, can never reach a sensitive path, every request audited. Dormant in Vercel.
7. **Sensitive paths** (`/admin`, `/api/admin`, `/api/account/`) require `aal2` **and** a re-auth cookie under ten minutes old (`lib/auth/reauth.ts`, HMAC over {sub, iat}; set by `POST /api/auth/reauth` after a fresh TOTP verify; Security prompts with `?reauth=1&next=`). API → 403 `mfa_required` / `reauth_required`; pages → text 403 with the fix.
8. No principal: `/api/*` → 401; pages → `/login?next=`.

Downstream code reads `x-principal`, `x-principal-user`, `x-principal-aal`, `x-principal-path`, `x-principal-scopes`; all five are stripped from the incoming request before anything is decided, so a browser cannot claim one.

## Teams, roles, grants, invites

- `teams` (one owner: partial unique on `team_members(team_id) where role = 'owner'`, `successor_user_id`), `team_members(role owner|admin|member|viewer)`, `team_member_sections` (toggles that only narrow: view / edit / create_delete / share per section). Role defaults: owner everything incl. share and settings; admin view/edit/create/delete all sections + invite + share; member view/edit/create/delete in enabled sections; viewer view only.
- **Team membership reaches the team space only, never a member's personal space.** A personal space is shared only by a direct grant.
- `user_grants(grantor, grantee, section, entity_groups[], verbs[], expires_at, revoked_at, reason)` — grantor's personal space only, never finance or platform; creating one requires re-auth; the grantee sees it under Settings → People & teams → "Shared with me" and may decline.
- `invites` (0112): email, optional team + role, sha256 token hash, 7 days, single use. `/invite/[token]` is public (preview via `invite_preview()`, anon); accepting creates the auth user, profile, personal space and membership. Email through Resend (`lib/system/email.ts`); without `RESEND_API_KEY` the link is shown to the inviter.
- Every operation is a SECURITY DEFINER function (`create_team`, `set_team_member_role`, `set_team_member_sections`, `remove_team_member`, `set_team_successor`, `transfer_team_ownership`, `appoint_team_successor` (instance owner, only when the owner is gone), `leave_team`, `create_user_grant`, `revoke_user_grant`, `find_user_by_email`, `create_invite`, `accept_invite`, …) behind `/api/teams*`, `/api/invites*`, `/api/grants*`, `/api/users/lookup` (exact email only). UI: Settings → **People & teams** (`/other/settings/people`).
- Leaving or removal deletes the membership; contributions stay with `created_by`. An owner must name a successor first; if an owner is deleted or disabled the instance owner appoints one, audited.

## Audit, sessions, rate limits, data rights

- `audit_events` (0113, append-only, no FK on actor): triggers on `auth.sessions` (sign in/out), `auth.mfa_factors`, `invites`, `team_members`, `team_member_sections`, `teams`, `user_grants`; `app.audit()` for functions; `lib/system/audit.ts` for break-glass requests, cross-user reads and exports. **Cross-user reads**: `auditListRead(req, rows, section, group)` (`lib/system/readAudit.ts`) in the list route of every shareable section writes one event per foreign space per request, never per row. Owner view: Settings → Security → "Who has seen my data" (`GET /api/account/access-log`). Instance owner: `/admin` audit tab, filterable.
- `/admin` (users disable/enable, teams with "owner gone" → appoint successor, grants, invites, audit) runs only through `admin_*` functions over the access tables; `lib/access/admin.test.ts` proves no admin code path names a content table. Per-user feature flags: `/api/admin/users/[id]/features`.
- Sessions: the Security page lists `my_sessions()`; `DELETE /api/auth/sessions/[id]` signs one out remotely, audited.
- Rate limits (0114): a Postgres token bucket `rate_limit_take()` on `/api/auth/password` (per IP and email), `/api/auth/magic-link` (never creates a user), `/api/auth/mfa/verify` (ten failures in fifteen minutes lock; success clears; lock audited) and invite creation. Passkeys stay client-side.
- Export: `GET /api/export/space` zips the caller's personal space by entity group (JSON + CSV per table), audited, from `/other/export`. Delete: `POST /api/account/delete` (aal2 + re-auth + typed email; instance owner refused) → `app.delete_user()`: personal space cascade, memberships, grants both ways, invites, push subscriptions; team contributions remain with `created_by = null`.

## Rundowns (0115)

Per-team weekly digest: `rundown_settings` (owner: enabled, blocks, sections, UTC day/hour), `rundown_subscriptions` (member: channels, opt-out, slot), `rundown_issues` (stored copy per recipient, week, channel). `runRundowns()` (`lib/system/rundowns.ts`, hourly `GET /api/cron/rundowns` under CRON_SECRET) reads only who gets one with the service role, then renders **once per recipient under `withUser(recipient)`** so RLS decides content; delivers by email, web push, in-app and Telegram (Phil only); idempotent per (team, recipient, week, channel). Readers see their own copy at `/rundowns/[team]/[week]`.

## Operational notes

- Tests: `lib/access/*.test.ts` and `lib/system/jwt.test.ts` run against the **local** stack (Docker; vitest runs files serially because the access suites share fixtures). With the stack down they fail on `supabase status`, which is environment, not code. `npm run isolation-test` is the cross-user isolation script.
- Legacy env (`USER_ID`, `DASHBOARD_PASSWORD`, `AUTH_SECRET`) is retired in code; removing the Vercel values after a final sign-in is on the backlog. Token hygiene: `docs/tokens.md` (names only).
- Agents are Phil-only: `agent_memory` is one row per agent, service-role only.
- Open: Supabase Security Advisor review; decision 0.2 (`platform` owner-only) is Phil's; the onboarding how-to for invitees.
