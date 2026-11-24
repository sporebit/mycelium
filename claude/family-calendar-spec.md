# Family calendar on Google — spec

*Rewritten 2026-11-21 22:40 (Cowork chat with Phil). **This replaces the Outlook / Microsoft Graph version written earlier the same day — build none of that.** Status: **built 2026-11-24, awaiting Phil's live check (MYC-210); the full ACL guard (§4.1) built the same evening (0187).** The repo is ground truth: where this doc and the code disagree, the code wins; fix the doc and note the drift.*

*Merge note, 2026-11-24 22:55 (Cowork with PC access): the overnight run of 2026-11-24 could not read the Claude project and wrote D7–D10 from a one-line brief. Its D7 said Phirsty Life is shared "with the friends in Phil's Google family groups as well as Kirsty", which is the opposite of the decision, and its D9 described a sync reset rather than Kirsty's handover. The rows below are Phil's decisions as recorded on 2026-11-23; the run's as-built facts are kept in §3 and §4. This file is now identical in the repo and the project.*

## 1. Decisions (Phil, 2026-11-21; D2 amended and D7–D10 added 2026-11-23)

| # | Decision |
|---|---|
| D1 | **Gmail after all.** Kirsty's Google account, `kirstykjpetco@gmail.com`, exists since 2026-11-23. The Outlook route, the household Microsoft account and the Azure/Entra registration are dropped. |
| D2 | **The shared calendar is a second calendar called "Phirsty Life" in Phil's own Google account** (`c68f629139fcaf595bb3f9c529fae1bf7d5b0a2965a311e5639dfffbc6f6e209@group.calendar.google.com`, created by Phil 2026-11-23; earlier drafts called it "Family", dropped because of D7), shared to Kirsty's Gmail with *Make changes to events* and **to nobody else**. She sees only that calendar; his primary and other calendars are never shared. Inside Mycelium it is the family space's calendar (shown as "Family"); only the Google-side name differs. |
| D3 | **Two-way.** Both add from their phones (Google Calendar on her Android, Apple or Google Calendar on his iPhone) and from Mycelium. |
| D4 | Mycelium's existing Google connection (Phil's account) is the one used. It can technically read all his calendars; the rule is in code: **only the chosen calendar's events ever enter the family space, and only family-space events are written to it.** |
| D5 | The plans engine is no longer a small module here. It is the **PhirstMaxx section** — see `claude/phirstmaxx-spec.md`. |
| D6 | Timing: after the current run. Does not wait for the UI rebuild. Kirsty does not need a Mycelium login for the calendar. |
| D7 | **Friends are outside everything about Phil and Kirsty.** Phil's Google family group, Apple Family Sharing group and Spotify Family include friends who share his premium benefits. Google and Apple each give a family group its own auto-created shared calendar, which those friends can see (and any of them can rename, edit or re-share the Google one). Phil renamed the Google one to "Premium Calendar" on 2026-11-23 and hides it. Rules: the Mycelium calendar is never a family-group calendar; **the picker refuses any calendar whose ACL includes anyone other than Phil and Kirsty** (users, groups, domain or public) and names who else is on it; the daily health check re-checks the ACL and stops writing if someone has been added; nothing about Phil and Kirsty is ever written to a family-group calendar, shared album or Keep note; Kirsty is not added to those family groups. |
| D8 | **`kirstykjpetco@gmail.com` is Kirsty's Mycelium login** (and her address for invites, notifications and the shared calendar). She never connects Google in Mycelium; `GOOGLE_ALLOWED_ACCOUNTS` stays Phil's address alone. Phil holds the inbox for now and sets her up himself, including testing what she sees as her, before handing it over. The dedicated test account stays the place for trying things; her account is used only to check her real view, and anything created while testing as her is cleared before handover. Invite emails are not sent yet (Resend sign-up pending), so the invite link is copied by hand. |
| D9 | **Handover resets her to a first run.** At handover Claude Code resets her Mycelium onboarding state so she does the partner first run herself, including confirming what is shared; her authenticator / passkey are enrolled by her and any Phil enrolled are removed. On the Google side: she changes the password, sets up 2-Step Verification on her own phone, sets her own recovery phone and email, and every session Phil left is signed out. (Setup guide phase 8.) |
| D10 | **Phirsty Life is permanent, not a stopgap** (Phil asked whether Mycelium could replace it). Google holds the calendar and both phones edit it natively; Mycelium is the second door (two-way sync, Family section, reminders, PhirstMaxx plans). Rejected: Mycelium as sole master publishing an `.ics` subscription (read-only on phones, Google refreshes subscriptions only a few times a day, and the link is a bearer secret) and Mycelium-only with no phone calendar. |

## 2. Why Google kept disconnecting, and the fix

Finding (repo + Google's rules): `/api/google/auth` already asks for `access_type=offline` and `prompt=consent`, so the code is right. The cause was the Google Cloud project: an OAuth consent screen with user type **External** and publishing status **Testing** issues refresh tokens that die **seven days after consent**.

**Phil's fix (done 2026-11-23):**
1. https://console.cloud.google.com/auth/audience → **Publish app** → **In production**. The client in use is **mycelium** (redirect `https://mycelium.sporebit.com/api/google/callback` only, no JavaScript origins). `mycelium-calendar-agent` was the May 2026 email-to-calendar experiment and has been deleted.
2. Reconnect after publishing. The first attempts failed: `bad_state` (router prefetch, fixed in `3e611a2`, §4.5), then the allowlist refusing because `GOOGLE_ALLOWED_ACCOUNTS` was not on Vercel. Set to `pwhelanonline@gmail.com` on Vercel and in `.env.local` 2026-11-23; reconnected as that address the same night.

**What still ends a token after that** (so the app must notice, §4.4): Phil revoking access at https://myaccount.google.com/permissions; six months with no use; more than 100 live tokens for the same client and account (each reconnect mints one, the oldest drop off); a deleted or changed client secret.

## 3. What exists

- `lib/google/calendar.ts` (`getAccessToken`, `listEvents`, `createEvent`, `updateEvent`, `deleteEvent` — each takes a `calendarId`, default `primary`), `lib/google/sync.ts`, `/api/google/auth|callback|sync`, `/api/cron/google-sync`, tokens on `user_settings` (0088/0089), failure reason shown in Settings (0150).
- Family appointments: `family_entries` rows with `kind = 'appointment'` (0171), projected into the calendar view by `lib/calendar/family.ts`.
- **2026-11-23 calendar clean-up (Phil):** Events, Fitness, Finance, Travel and Sporebit deleted (empty or stale since the May experiment); Birthdays already gone. Left: Personal, Phirsty Life, Holidays in United Kingdom, and the hidden Premium Calendar.
- **2026-11-24 (overnight run, `3ce9130`, migration 0186):** the iCal feeds are retired — `GOOGLE_CALENDAR_ICAL_URLS` removed from code, env files and every Vercel environment, the iCal library uninstalled; the calendar page reads Personal and UK holidays through the OAuth connection; Settings → Integrations shows "Connected as … · Last synced …" (amber past an hour, red past a day, SYNC NOW updates in place) and a refused sign-in names the address.
- **2026-11-24 (`e76e7a3`):** family calendar sync built (§4.1–4.4). Phirsty Life chosen for the family space on production; full pull brought five events; push channel on; health check green; live round trip passed both ways (create, edit, delete in Mycelium reached Google; the same in Google reached Mycelium through the push channel); all test events removed. Kirsty already has Make-changes rights.

**So the in-app Family calendar and the Google "Phirsty Life" calendar are the same calendar.** No second calendar.

## 4. Build

### 4.1 Choosing the calendar
- Family → Settings → **Family calendar**: lists Phil's Google calendars (`calendarList.list`), he picks "Phirsty Life" (Create is offered only while none exists). Stored per family space as `google_family_calendar_id` plus the owning user id.
- **D7 guard, required:** before saving a choice, read the calendar's ACL (`acl.list`). Refuse it, and name who else is on it, if any entry other than Phil's own account and Kirsty's address exists (users, groups, domain or public). Re-check the ACL in the daily health check (§4.4); if someone else has been added since, stop writing to it, raise a dated ticket and push Phil.
- **As built 2026-11-24 — partial:** `isGuardedCalendar` / `GOOGLE_FAMILY_GROUP_RE` / `GUARDED_CALENDAR_ERROR` in `lib/family/calendar/map.ts` block the Google family-group calendar **by its id** (`family…@group.calendar.google.com`): hidden from the picker, refused 403 on choose before Google is asked, never pulled, a push to it marked done not queued (four tests in `lib/family/calendar/sync.test.ts`). That stops the one known bad calendar but not the rule: a calendar of Phil's own shared with a friend would still be accepted.
- **As built 2026-11-24 evening (0187) — the rule itself.** `checkAcl` in `lib/family/calendar/sync.ts` reads `acl.list` and compares every entry with the allowed set from `familyAclAllowed`: the addresses in `GOOGLE_ALLOWED_ACCOUNTS`, the address Google reported at connect time (`user_settings.google_account_email`, the same person) and `FAMILY_PARTNER_ACCOUNT` (`kirstykjpetco@gmail.com`, `map.ts`). A `user` entry matching one of those, case-insensitively, is fine; anything else is a stranger — another user, any `group`, any `domain`, and `default` (the public) — because Mycelium cannot see who is behind a group or a domain. **On choose:** after `calendars.get` and before anything is saved, a stranger means a 403 whose text names each of them with their role in the Share dialog's words ("…also shared with dave@example.com (sees all details), the group friends@googlegroups.com (can change events)… Remove them in Google Calendar (Settings → Share with specific people), then choose it again."); an ACL Google will not show (403/404, a calendar shared *to* Phil rather than his) is refused with a 409 ("only a calendar in your own account can be the Family calendar", D2). **In the daily health check (§4.4):** after the one-page read, the ACL is read again; a stranger sets `family_calendar_sync.acl_blocked` (the same sentence, ending "Mycelium has stopped writing to it; new appointments wait… then press Sync now."), `health_ok = false`, pushes Phil once a day (`family_calendar_acl`, link `/family`) and raises one dated ticket at a time (`meta {family_calendar: "acl"}`, "Phirsty Life is shared with someone it should not be", naming them). While `acl_blocked` is set `pushEntry` returns not-done with a 423, so every write waits on the `jobs` queue and is counted on the "changes waiting to reach Google" line; reads continue. The next clean check clears it and the queued writes go; **Sync now** on the Family tab runs the health check first while blocked, so the fix takes effect at once rather than next day. The tab shows "Writing has stopped. …" with a link to Google Calendar settings in place of "Reconnect needed", the Family header line reads "Google · Shared with someone else; writing stopped", and the owner's **Shared with** list now shows every ACL entry (groups, domains and the public included), a stranger in red with "should not be here". Tests: twelve in `lib/family/calendar/map.test.ts` (the pure reading: `readAcl`, `aclStrangers`, `describeScope`, `roleWords`, `aclRefusal`) and `lib/family/calendar/sync.test.ts` (choose accepted with the two of them, refused naming a third user / a group, a domain and the public, case-insensitive match, unreadable ACL refused, the health check blocking writes then releasing them, the share list marking a stranger).
- Sharing to Kirsty: an `acl.insert` with role `writer` for her address from the same screen, or by hand in Google Calendar; show the current ACL so Phil can see she has it and that nobody else does.

### 4.2 Google → Mycelium
- Incremental sync of that one calendar with `syncToken` (full sync on first run and on a 410). Each Google event ↔ one `family_entries` row, `kind = 'appointment'`, `source = 'google'`, columns `ext_provider`, `ext_id`, `ext_etag`, `ext_ical_uid`, `ends_at`, `all_day`, `recurring_event_id`. Cancelled events delete the row. Recurring series: instances in a rolling window (−30 days → +18 months) with `singleEvents=true`.
- **Push channel** (`events.watch`) to `/api/google/push`; channels expire within a week, so the daily cron renews them. A 15-minute poll is the safety net.
- Choosing the calendar again drops the sync token, push channel and health state and runs a full pull; nothing is deleted locally and rows made here are re-linked by id (as built 2026-11-24).

### 4.3 Mycelium → Google
- Creating, editing or deleting a family appointment (or a PhirstMaxx plan) writes to the chosen calendar at once and stores `ext_id`/`etag`. A failed write goes on the `jobs` queue (0159) and retries; never dropped silently. Updates send `If-Match`; on a 412 re-read and apply last-writer-wins by `updated`, Google winning a tie, and log the overwrite.
- Mycelium's own appointment reminders stay; events it creates carry no Google reminder unless a setting says so.

### 4.4 Never silently disconnected
- Daily health check: refresh the token, read one page of the chosen calendar, and re-check its ACL (D7; built 0187, see §4.1 — a stranger stops writes, pushes Phil once a day and raises a dated ticket; Sync now re-checks at once). On `invalid_grant` or a 401/403: record the reason, show **Reconnect needed** in Settings and on Family, push Phil once with the reconnect link, and raise a dated ticket; repeated daily until fixed (inside his interruption budget).
- "Last synced 3 min ago" on the Family calendar and in Settings → Integrations (with "Connected as <address>"). Stale by more than an hour → amber; more than a day → red. Both built 2026-11-24.
- Queue depth: unsent writes counted on the same line ("2 changes waiting to reach Google").

### 4.5 Lock the Google sign-in to Phil's account (Phil, 2026-11-21: "I don't want anyone else having access other than Mycelium")

Two gaps existed once the OAuth app went **In production**, because any Google account can then complete consent for this client id: no `state` check, and no check on which Google account connected.

Build (done):
- `/api/google/auth` sets a random nonce in an httpOnly, Secure, SameSite=Lax cookie (10-minute life) and sends it as `state`; the callback rejects on a missing or different `state` and clears the cookie.
- After the token exchange the callback reads `calendars/primary`. If the address is not in `GOOGLE_ALLOWED_ACCOUNTS` (`pwhelanonline@gmail.com` only), it revokes the token, stores nothing, and returns to Settings naming the refused address. An unset `GOOGLE_ALLOWED_ACCOUNTS` refuses everyone.
- The connected address is stored as `user_settings.google_account_email` and shown in Settings → Integrations.
- The same checks apply to any future Google connect route. Kirsty's Mycelium account never connects Google (D8); the Family → Calendar tab tells any other member so rather than sending them to connect.
- **2026-11-23 (`3e611a2`, the reconnect that always came back `bad_state`):** the CONNECT / RECONNECT `<Link>`s were prefetched by the Next router (on screen and on hover) and the click itself went through the router before the real navigation, each run of `/api/google/auth` minting a new nonce. Now: plain anchors; the auth route answers router-made requests 204 with no cookie; the cookie keeps the last five nonces, scoped to the Google API prefix, so a second click or tab does not break the first sign-in; the callback returns to `?tab=integrations&google=…`. Covered by `app/api/google/roundtrip.test.ts` and `e2e/google-connect.tess.spec.ts`. As built in `claude/spec-platform.md` (Google Calendar).

### 4.6 Privacy and tests
- Phil's primary-calendar events never enter the family space and never go to the shared calendar. The chosen calendar id is the only one the family sync reads.
- Isolation test additions: a non-member sees no family appointments; the calendar id/setting is not returned by any GET to a non-member; the picker refuses a calendar whose ACL holds a third person (built 0187; covered by the vitest guard tests, not yet by the isolation run).
- Google mocked in vitest/Playwright; the live round trip was done 2026-11-24.

## 5. Phil's steps

*Guide: https://claude.ai/artifact/SGRf5YDSCPN2ZumyoiDGro (version 2, 2026-11-23). In-app: `docs/checklists/google-family-phirstmaxx-setup.json` on MYC-207 — **the repo still holds version 1** (version 2 was sent to Phil as a file and not yet saved over it); upgrade MYC-207 to version 2 keeping its ticks and answers. Do not write a second checklist for these steps.*

1. Publish the OAuth app. **Done 2026-11-23.**
2. Reconnect Google in Mycelium. **Done 2026-11-23.**
3. Create Kirsty's Google account (**done**); sign it in on her Android phone — at handover (D9).
4. Create "Phirsty Life" and share it to `kirstykjpetco@gmail.com` with Make changes to events, and nobody else (**done**); accept from her inbox.
5. iPhone: tick Phirsty Life at calendar.google.com/calendar/u/0/syncselect; hide Premium Calendar and Apple's Family calendar.
6. Check: an event added on her account shows in Mycelium within a minute; one added in Mycelium shows on both phones (MYC-210).
7. `GOOGLE_ALLOWED_ACCOUNTS` in `.env.local` and on Vercel. **Done 2026-11-23.**
8. Handover (D9).

## 6. Done means

Build (`rm -rf .next && npx next build`), vitest and Playwright pass · round trip works both ways including edit, delete and a recurring event · disconnect/reconnect leaves no duplicates (`ext_id` unique per calendar) · the health check has been seen to fire (revoke access once on purpose, then reconnect) · **the D7 ACL guard refuses a calendar shared with a third person** (built and tested 2026-11-24 evening, 0187; not yet seen live — Phil's check: share Phirsty Life with the test account once, run Sync now, see the block, remove it, Sync now again) · isolation 0 leaks · Phil verified it on both phones.

## 7. Invariants

One migrations lane, numbered by build order; `supabase db push` only, dump first; RLS pattern on any new table; secrets in env only; update `spec-index`, `spec-organisation` (Calendar), `spec-platform` (Google), `context.md` and `backlog.md` in the repo and the project.
