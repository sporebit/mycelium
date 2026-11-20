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
