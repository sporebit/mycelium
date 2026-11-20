# Phase 1 tester hand-back — multi-user (invite, accept, roles, grants, rundowns, export, delete)

*2026-11-20. One of five parallel testers. 46 checks pass and 12 are held as `test.fixme` on the compiled test build. This surface had never had a second-user browser pass. The tester changed no auth, middleware, RLS, `lib/system` or `lib/auth` code; every hole below was fixed by the lead in migration 0160 and the commits around it.*

## Specs

| File | Passing | fixme |
|---|---|---|
| `e2e/multiuser-invite.phil.spec.ts` | 15 | 1 |
| `e2e/multiuser-security.phil.spec.ts` | 11 | 4 |
| `e2e/multiuser-grants.phil.spec.ts` | 8 | 5 |
| `e2e/multiuser-lifecycle.phil.spec.ts` | 7 | 0 |
| `e2e/multiuser-firstday.phil.spec.ts` | 5 | 2 |

Helper: `e2e/support/multiuser.ts`. The specs create their own users (`e2e-mu-<run>-…@mycelium.local`) for anything that changes an account's security state, and keep a ledger of leftovers in `e2e/.auth/multiuser-leftovers.json`.

## Security findings (each confirmed against the running server, each with a failing check)

- **S1. The second factor protected only `/admin`, `/api/admin`, `/api/account`.** A password alone gave a session at aal1; with it, the app and direct REST calls both returned the person's rows (personal, team and platform tables). Magic-link and Google sign-in never asked for the code at all.
- **S2. "Mandatory" TOTP for owners and admins was only a redirect on the sign-in page.** A team owner with no factor used the app and minted invites, admin role included.
- **S3. Creating a grant needed no re-auth and no factor**, although the spec and the onboarding guide say it does.
- **S4. `rate_limit_take` ran for the anon key and trusted the caller's numbers.** A stranger could empty the sign-in limiter for any email (locking that person out) or refill it before each guess.
- **S5. The TOTP lockout could be cleared by the session it is meant to stop** (`second_factor_succeeded` was callable by the signed-in user).
- **S6. `people_purge_deleted` deleted binned people in every space.** Proven: user B purged user A's binned person.
- **S7. The cron secret plus an ordinary session skipped the sensitive gate.** With aal1 cookies and the cron bearer, `/api/account/access-log` and `/api/admin/users` answered 200.
- **S8. "Sign out there" did not cut the other device off**: the session row went, but that device's token worked until it expired.
- Read from SQL, not run: `accept_invite` overwrites an existing member's role (an admin could invite the owner's address as viewer; if accepted, the team has no owner row). `pc_metrics_prune` and `pc_metrics_rollup` were anon-executable (harmless).
- Storage: nothing found beyond what 0158 closed.

## Bugs fixed by the tester

- People & teams hung on "Loading…" for ever when a first fetch failed; controls had no accessible names (`app/other/settings/people/page.tsx`).
- For a person with no authenticator, "Who has seen my data" said "Confirm your authenticator" (a dead end) and Delete showed "Forbidden"; both now say an authenticator must be enrolled (`app/other/settings/security/page.tsx`).

## Bugs found, not fixed (these are the Kirsty stream's work list)

- **Display name never reaches the team.** Settings writes `user_settings.display_name`; teams, shares and rundowns read `profiles.display_name`, which nothing updates.
- **Shared Work reads are not logged**: no `/api/work/**` route calls `auditListRead`.
- **The dashboard greets every user as "Phil"** (`lib/config/operator.ts` hard-codes it; `GET /api/settings` seeds "Phil" for anyone with no settings row).
- **Section toggles race**: each click sends the whole row from stale state.
- **No way to cancel an invite or delete a team.** A team's last owner can never delete their account.
- Archiving a project rides on edit, not create/delete.
- A viewer's Sections table shows edit and create ticked, though the role forbids both.
- The in-app rundown copy has no link anywhere in the UI.
- **A user can switch AI features on for themselves** (`PATCH /api/settings` passes the body through). The spec says the instance owner does this. Phil's decision, since it spends his API credit.

## Where `docs/onboarding.md` disagrees with behaviour

- §2.5 "must set up TOTP before they can use the app": was only a redirect (S2).
- §2 end "the sign-in asks for the code": only on the password path (S1).
- §3 "Settings → Layout (hidden sections)": the panel is called Sections. The welcome text names only Organisation, Fitness, Health, but Work and Other show too.
- §3 display name "is what the team sees": false (bug above).
- §4 "Sharing asks you to re-enter your authenticator code first": was never asked (S3). The verbs listed omit "share".
- §4 "lists every time someone else's request read rows": not for Work routes.
- §5 "sign any of them out remotely": access continued until the token expired (S8).
- §6 "Security → Danger zone": the card is "Delete account" on the Security page. "one JSON and one CSV per table": only for tables that have rows.
- §7 "sign out, open the link again": the invite page has no sign-out control.

## What a partner hits on day one

- The dashboard says "Friday night, Phil".
- Her name shows to Phil as the first half of her email address everywhere, and Settings → Display name does not change that.
- Work → Projects shows three identical "General" projects (hers, the team's, his) and three "Technical" headings, with nothing saying whose is whose; shared projects show a UUID as their key.
- `/api/body-metrics` returns his shared entries alongside hers; the page has no owner label.
- Nothing in the UI lets her choose the team space; team rows appear mixed into her lists.
- With no authenticator she cannot open "Who has seen my data" or delete her account; nothing tells a member this at onboarding.
- If Phil narrows a section she simply sees less, with no message.
- Shares do behave: view-only refuses her edits with a clear 403, her own weigh-in on the same date does not overwrite his, and People & teams lists each share with its source.

## Needs Phil's eyes (one 15-minute sitting, on production)

1. **Invite email.** Settings → People & teams → family team → invite her real address as member: "Invite created." with no link shown; an email from the invites sender within a minute, not in spam; the link opens the production site. (Needs the email service set up first; production has no key today.)
2. **Joining on her phone.** She opens the link and chooses Password: "Check your email", a confirmation email, tapping it returns to the invite page signed in, Accept shows "You are in … as member". Repeat once opening the confirmation on a different device.
3. **Google.** On `/login`, Continue with Google: returns signed in, or a clear error if Google is not configured.
4. **Real authenticator.** Settings → Security → Enrol: the QR scans, the code is accepted. Sign out, sign in with password: it asks for the code. Sign in once by magic link: it now asks too.
5. **Admin.** `/admin`: a prompt to confirm the code, then the console listing both users, the family team, the grants and an audit tab.
6. **Sharing.** People & teams → Share with a person → her email → Organisation, tickets, view → Share (it now asks for your code first); repeat for Fitness. On her phone both appear under Shared with me, and she can open but not edit your project.
7. **Phone layout.** People & teams and Security on her phone: the section-toggle table scrolls sideways, the share form is usable, the QR is large enough to scan from another screen.
8. **Rundown email.** Switch the rundown on for the family team and trigger it: an email to each of you, each showing only what that person may see.

---

## Second round, 2026-11-20 04:30 — on the hardened build (0160)

All five files green: **59 pass, 5 held**. All nine security findings are closed, each proved through the app and straight at the database. Nothing that passed before fails after the hardening (anonymous invite preview, a new user accepting, the welcome, the rundown cron, export, account deletion with a second factor and a fresh confirmation).

| File | Pass | Held |
|---|---|---|
| `e2e/multiuser-invite.phil.spec.ts` | 15 | 1 |
| `e2e/multiuser-security.phil.spec.ts` | 17 | 2 |
| `e2e/multiuser-grants.phil.spec.ts` | 13 | 0 |
| `e2e/multiuser-lifecycle.phil.spec.ts` | 7 | 0 |
| `e2e/multiuser-firstday.phil.spec.ts` | 7 | 2 |

### Each finding and the check that closes it

| Finding | Closing check |
|---|---|
| A password-only session of an enrolled account read everything | "a session that stopped before the code cannot read the person's data" (security); "a password-only token … reads nothing from the database" (grants) |
| "Mandatory" authenticator was only a redirect | "an owner or admin with no authenticator cannot use the app until they enrol" (security) |
| A grant could be made with no fresh confirmation | "creating a grant without a fresh second factor is refused" (grants) |
| The rate limiter could be called by anyone | "an anonymous caller cannot empty or refill a rate-limit bucket" (grants) |
| A person could clear their own lockout | "a signed-in user cannot clear their own second-factor failures" (grants) |
| One person could purge another's binned people | "one person cannot purge another person's binned people" (grants) |
| The cron secret carried a browser session past the sensitive gate | "the cron secret does not carry a browser session past the sensitive-path gate" (security) |
| Remote sign-out took up to an hour | "a device signed out remotely is refused on its next request" (security) |
| An invite overwrote an existing member's role | "an invite never changes the role of someone already in the team" (security) |

Added: a sign-in link for someone with an authenticator stops at the code prompt; a member needs no authenticator but cannot share without one, and the page says what to do; the role-kept check; other doors with a password-only token (GraphQL 403, Storage lists nothing, Realtime publication empty, the auth server refuses a password or email change).

### Found in the hardening itself

1. **Promotion lock-out.** Someone with no authenticator who becomes an owner or admin (promoted, invited as admin, or by creating a team) loses the whole account at once, personal space included. The owner sees "Role updated." and no warning. Her pages show placeholders and "Could not load…", the API answers 500, and the one message tells her to enter a code she does not have. Settings → Security still opens and enrolling restores everything; signing in again by password takes her to enrol, by magic link or Google it does not.
2. **A remotely signed-out device gets errors, not the sign-in page.** The database refuses it correctly; the API answers 500 rather than 401, and some pages show "Could not load…" until a later navigation.
3. **File storage does not pass through the new gate** (by reading the SQL). The Storage API is a separate door from the data API; the linked-teammate rule for Day log photos does not check the session, so a linked teammate with a password-only or signed-out session could still fetch the shareable photos of scenes they are in.
4. The fresh confirmation for sharing is enforced by the route only; at the database a second-factor token is enough. As designed.
5. The invite welcome tells an already-enrolled owner or admin to "set up an authenticator".

Held checks: the two behind findings 1 and 2; `/sw.js` without a session (the test build has no service worker); "the name she sets in Settings is the name her team sees"; "reading the owner's shared Work leaves a line in the owner's access log".

Fixed by the tester: a refused action on People & teams now scrolls to its message (`app/other/settings/people/page.tsx`); before, "Sharing needs an authenticator…" appeared out of view.

Residue: `e2e-mu-keeper@mycelium.local` owns 52 `E2E-mu-…` teams on the local stack (the app has no way to delete a team; a full run adds about six).

### Changes to "Needs Phil's eyes"

- **Before anything else:** do not make her an admin, and do not name her successor, until she has set up an authenticator.
- **Decide** whether she sets one up on day one. Without it she works normally but cannot share or open "Who has seen my data".
- **Step 4 (authenticator):** after enrolling, also sign in once by magic link; it should stop at the code prompt.
- **Step 6 (sharing):** pressing Share now sends him to Security to confirm his code and brings him back; he then fills in the share again.
- **New, on her phone:** from his laptop press "Sign out there" for her phone's session. Her phone should stop showing data at once and land on the sign-in page.
