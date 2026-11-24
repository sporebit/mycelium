# Family calendar on Google — spec

*Rewritten 2026-11-21 22:40 (Cowork chat with Phil). **This replaces the Outlook / Microsoft Graph version written earlier the same day — build none of that.** Status: **committed**. For Claude Code once the current run has finished. The repo is ground truth: where this doc and the code disagree, the code wins; fix the doc and note the drift.*

## 1. Decisions (Phil, 2026-11-21)

| # | Decision |
|---|---|
| D1 | **Gmail after all.** Phil is creating Kirsty a Google account, `kirstykjpetco@gmail.com`. The Outlook route, the household Microsoft account and the Azure/Entra registration are dropped. |
| D2 | **The Family calendar is a second calendar called "Family" in Phil's own Google account**, shared to Kirsty's Gmail with *Make changes to events*. She sees only that calendar; his primary and other calendars are never shared. |
| D3 | **Two-way.** Both add from their phones (Google Calendar on her Android, Apple or Google Calendar on his iPhone) and from Mycelium. |
| D4 | Mycelium's existing Google connection (Phil's account) is the one used. It can technically read all his calendars; the rule is in code: **only the Family calendar's events ever enter the family space, and only family-space events are written to the Family calendar.** |
| D5 | The plans engine is no longer a small module here. It is the **PhirstMaxx section** — see `claude/phirstmaxx-spec.md`. |
| D6 | Timing: after the current run. Does not wait for the UI rebuild. Kirsty does not need a Mycelium login for the calendar. |

*Amendments of 2026-11-23 (Claude project chat with Phil), merged into the repo copy on 2026-11-24 by the overnight run from the one-line summary in Phil's brief — the project's full wording could not be read from the terminal, so each row below carries the run's reading of it; correct the wording where it differs, the behaviour is as built.*

| # | Decision (2026-11-23) |
|---|---|
| D7 | **The Google calendar is "Phirsty Life"** (`c68f6291…@group.calendar.google.com`), made by Phil in his own account, not a calendar called "Family". Sharing covers the friends in Phil's Google family groups as well as Kirsty: anyone is shared in by an ACL entry on Phirsty Life. **The ACL guard:** Google's own family-group calendar ("Premium Calendar", id `family0876…@group.calendar.google.com`) is never offered in the picker, never accepted as the choice, and never read or written, whatever a row says (`isGuardedCalendar` in `lib/family/calendar/map.ts`, applied in the picker, `chooseCalendar`, `pullFamilyCalendar` and `pushEntry`; a push to it is marked done, not queued). |
| D8 | **`kirstykjpetco@gmail.com` is Kirsty's Mycelium login** (the Google account doubles as her sign-in), and **she never connects Google in Mycelium**: Phil's connection is the only one (`GOOGLE_ALLOWED_ACCOUNTS` stays his address alone), and the Family → Calendar tab tells any other member so rather than sending them to connect. |
| D9 | **The handover reset:** when the calendar is chosen (again), the sync token, push channel and health state are dropped and a full pull runs, so a handover (a reconnect, a new calendar, Kirsty's arrival) starts from Google's truth — `chooseCalendar` already behaves this way; nothing is deleted locally and rows made here are re-linked by their id. |
| D10 | **Phirsty Life is permanent, with no .ics subscription**: the iCal feed URLs are gone from the code and the environments (2026-11-24, `GOOGLE_CALENDAR_ICAL_URLS` retired; the calendar page reads Personal and UK holidays through the connection), and "Create a Family calendar" is offered only while no Phirsty Life exists in the account. |

## 2. Why Google kept disconnecting, and the fix

Finding (repo + Google's rules): `/api/google/auth` already asks for `access_type=offline` and `prompt=consent`, so the code is right. The cause is almost certainly the Google Cloud project: an OAuth consent screen with user type **External** and publishing status **Testing** issues refresh tokens that die **seven days after consent**. The token "expired 2026-06-24" fits that.

**Phil's fix (one-off):**
1. https://console.cloud.google.com/auth/audience (the project that owns `GOOGLE_CLIENT_ID`) → **Publish app** → status becomes **In production**. No verification is needed for personal use; the consent screen shows an "unverified app" warning once (Advanced → Go to Mycelium).
2. Mycelium → Settings → Integrations → **RECONNECT**. A token issued before publishing still dies at seven days, so reconnect *after* publishing.

**What still ends a token after that** (so the app must notice, §4.4): Phil revoking access at https://myaccount.google.com/permissions; six months with no use; more than 100 live tokens for the same client and account (each reconnect mints one, the oldest drop off); a deleted or changed client secret.

## 3. What exists (repo, 2026-11-21)

- `lib/google/calendar.ts` (`getAccessToken`, `listEvents`, `createEvent`, `updateEvent`, `deleteEvent` — each takes a `calendarId`, default `primary`), `lib/google/sync.ts` (push tickets/events/drops, `pullFromGoogle`), `/api/google/auth|callback|sync`, `/api/cron/google-sync`, tokens on `user_settings` (0088/0089), failure reason shown in Settings (0150).
- Family appointments: `family_entries` rows with `kind = 'appointment'` (0171), projected into the calendar view by `lib/calendar/family.ts` as a calendar named "Family".

**So this job makes the in-app Family calendar and the Google "Family" calendar the same calendar.** No second calendar.

## 4. Build

### 4.1 Choosing the calendar
- Family → Settings → **Family calendar**: lists Phil's Google calendars (`calendarList.list`), he picks "Family" (or presses Create, which makes it and offers the share step). Stored per family space as `google_family_calendar_id` plus the owning user id. Needs the `calendar` scope, already requested.
- Sharing to Kirsty: an `acl.insert` with role `writer` for her address from the same screen, or Phil does it by hand in Google Calendar — either; show the current ACL so he can see she has it.

### 4.2 Google → Mycelium
- Incremental sync of that one calendar with `syncToken` (full sync on first run and on a 410). Each Google event ↔ one `family_entries` row, `kind = 'appointment'`, `source = 'google'` (widen the check), new columns `ext_provider`, `ext_id`, `ext_etag`, `ext_ical_uid`, `ends_at`, `all_day`, `recurring_event_id`. Cancelled events delete the row. Recurring series: store instances in a rolling window (−30 days → +18 months) with `singleEvents=true`.
- **Push channel** (`events.watch`) to `/api/google/push` so a change on either phone reaches Mycelium in seconds; channels expire within a week, so the daily cron renews them. A 15-minute poll (cron-job.org or `/api/cron/tick`) is the safety net; if the PC worker is up it may do the poll instead.

### 4.3 Mycelium → Google
- Creating, editing or deleting a family appointment (or a PhirstMaxx plan) writes to the Family calendar at once and stores `ext_id`/`etag`. A failed write goes on the `jobs` queue (0159) and retries; never dropped silently. Updates send `If-Match` with the stored etag; on a 412 re-read and apply last-writer-wins by `updated`, Google winning a tie, and log the overwrite.
- Mycelium's own appointment reminders stay; events it creates carry no Google reminder unless a setting says so (no double buzz).

### 4.4 Never silently disconnected
- Daily health check: refresh the token and read one page of the Family calendar. On `invalid_grant` or a 401/403: record the reason, show **Reconnect needed** in Settings and on Family, push Phil once with the reconnect link, and raise a dated ticket. The push is repeated daily until fixed (inside his interruption budget).
- Show "Last synced 3 min ago" on the Family calendar. Stale by more than an hour → amber; more than a day → red banner.
- Queue depth: unsent writes are counted on the same line ("2 changes waiting to reach Google").

### 4.5 Lock the Google sign-in to Phil's account (Phil, 2026-11-21: "I don't want anyone else having access other than Mycelium")

Finding (repo, 2026-11-21): `/api/google/auth` and `/api/google/callback` sit behind the auth gate (not in `PUBLIC_PREFIXES`), so only a signed-in Mycelium user can start or finish the flow. Two gaps remain, and they matter more once the OAuth app is **In production**, because any Google account can then complete consent for this client id:

1. **No `state` check.** The auth route sends no `state`, and the callback accepts any `code`. A crafted `/api/google/callback?code=…` link opened by Phil while signed in would attach *someone else's* Google account to his Mycelium, and the sync would then write his tickets and events into their calendar.
2. **No check on which Google account connected.**

Build:
- `/api/google/auth` sets a random nonce in an httpOnly, Secure, SameSite=Lax cookie (10-minute life) and sends it as `state`; the callback rejects on a missing or different `state` and clears the cookie.
- After the token exchange the callback reads `calendars/primary` (its `id` is the account's address — no new scope needed). If the address is not in `GOOGLE_ALLOWED_ACCOUNTS` (env, comma-separated; Phil's Google address only), it revokes the token at `https://oauth2.googleapis.com/revoke`, stores nothing, and returns to Settings with "That Google account isn't allowed here". An unset `GOOGLE_ALLOWED_ACCOUNTS` refuses everyone.
- Store the connected address as `user_settings.google_account_email` and show it in Settings → Integrations beside "Connected".
- The same two checks apply to any future Google connect route (the Family calendar picker reuses this connection; it adds none).
- Tests: no `state` → rejected; wrong `state` → rejected; a non-allowlisted account → nothing stored and the revoke call made; allowlisted → stored with its address.
- **2026-11-24 (built, overnight run): D7–D10 above.** `GOOGLE_FAMILY_GROUP_RE` / `isGuardedCalendar` / `GUARDED_CALENDAR_ERROR` / `FAMILY_CALENDAR_NAME` in `lib/family/calendar/map.ts`; four tests in `lib/family/calendar/sync.test.ts` (picker hides it, choose refused 403 before Google is asked, a row naming it is neither pulled nor pushed, Phirsty Life passes). Phirsty Life chosen for the family space on production and the live round trip done the same night (see `claude/context.md`).
- **2026-11-23 (built; the reconnect that always came back `bad_state`):** the nonce cookie was being replaced behind the person's back — the CONNECT / RECONNECT `<Link>`s were prefetched by the Next router (on screen and on hover) and the click itself went through the router before the real navigation, each run of `/api/google/auth` minting a new nonce. Now: plain anchors; the auth route answers router-made requests 204 with no cookie; the cookie keeps the last five nonces so a second click or tab does not break the first sign-in; the callback returns to Settings → Integrations (`?tab=integrations&google=…`) and the tab opens on `?google=` alone. Round trip covered by `app/api/google/roundtrip.test.ts` and `e2e/google-connect.tess.spec.ts`. As built in `claude/spec-platform.md` (Google Calendar).

### 4.6 Privacy and tests
- Phil's primary-calendar `events` never enter the family space and never go to the Family calendar. The Family calendar id is the only one the family sync reads.
- Isolation test additions: a non-member sees no family appointments; the calendar id/setting is not returned by any GET to a non-member.
- Google mocked in vitest/Playwright; one opt-in live smoke once Phil has reconnected.

## 5. Phil's steps (in-app checklist, house format, answer boxes; no secret in a box)

*Written up 2026-11-21 as a guide Phil can work through before the build reaches these steps: https://claude.ai/artifact/SGRf5YDSCPN2ZumyoiDGro . The same content is `docs/checklists/google-family-phirstmaxx-setup.json` in the repo (house definition format): ship it in-app, start its run, and seed its answers from the hand-back prompt Phil pastes. Do not write a second checklist for these steps. Step 7 below is new.*

1. Publish the OAuth app (§2 step 1). Answer box: status shown.
2. Reconnect Google in Mycelium.
3. Create Kirsty's Google account; sign it in on her Android phone (Settings → Accounts → Add account → Google) so Google Calendar shows it.
4. In Mycelium pick/create the Family calendar and share it to `kirstykjpetco@gmail.com`. She accepts the email invite.
5. On the iPhone: the Family calendar appears wherever his Google account already syncs (Settings → Calendar → Accounts). If only Google Calendar's app is used, tick Family in its sidebar.
6. Check: an event added on her phone shows in Mycelium within a minute; one added in Mycelium shows on both phones.
7. Set `GOOGLE_ALLOWED_ACCOUNTS` (his Google address) in `.env.local` and on Vercel, for §4.5.

## 6. Done means

Build (`rm -rf .next && npx next build`), vitest and Playwright pass · round trip works both ways including edit, delete and a recurring event · disconnect/reconnect leaves no duplicates (`ext_id` unique per calendar) · the health check has been seen to fire (revoke access once on purpose, then reconnect) · isolation 0 leaks · Phil verified it on both phones.

## 7. Invariants

One migrations lane, numbered by build order; `supabase db push` only, dump first; RLS pattern on any new table; secrets in env only; update `spec-index`, `spec-organisation` (Calendar), `spec-platform` (Google), `context.md` and `backlog.md` in the repo and the project.
