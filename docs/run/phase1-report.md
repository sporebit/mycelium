# Master run — Phase 1 report (test everything already built)

*2026-11-20, 02:35–05:10 London. Claude Code on the PC. Tickets MYC-174 (test pass) and MYC-179. Status: **built and deployed**. Production is on the commit named under "Shipped"; hosted migrations stand at 0164. What a machine cannot judge is in one checklist for Phil, in 15-minute chunks.*

## How it was run

Five testers worked in parallel, one group of surfaces each, against a compiled copy of the app on this PC wired to the **local** database, with every paid or outward-facing key blank. Each drove the app as two people: Phil (instance owner, signed in with an authenticator) and Tess (an ordinary second person), so every surface was checked for "her view shows none of his". A sixth pass opens every page in the app as each of them.

Each tester handed back: its specs, the faults it fixed (each proved by a check that failed first), the faults it did not fix, and a short list of what only Phil's eyes can judge. Those hand-backs are kept, condensed, in `docs/run/phase1-notes/` (five files).

## Totals

| Surface | Spec files | Checks passing | Held as findings |
|---|---|---|---|
| Day log, capture, capture learning, quote review | `e2e/daylog.*`, `e2e/capture.*`, `e2e/quotes.phil.spec.ts` | 128 | 1 |
| People contacts, People review | `e2e/people*.spec.ts`, `e2e/people-quotes.tess.spec.ts` | 33 | 0 |
| Hours, Receipts, Gousto, the 2026-10-29 fixes | `e2e/hours-*`, `e2e/hours.tess.spec.ts`, `e2e/receipts.*`, `e2e/gousto.*`, `e2e/fixes-1029-*` | 165 | 8 |
| Work and Docs | `e2e/work*.spec.ts`, `e2e/docs.*.spec.ts` | 72 | 1 |
| Multi-user: invites, roles, sharing, lifecycle, security | `e2e/multiuser-*.phil.spec.ts` | 61 | 3 |
| Daily loop (new in this run) | `e2e/daily.tess.spec.ts` | 12 | 0 |
| PC worker and job queue (new) | `e2e/worker.phil.spec.ts` | 6 | 0 |
| API tokens, end to end (new) | `e2e/api-token.phil.spec.ts` | 5 | 0 |
| **End-to-end total** | | **482** | **13** |
| Every page opens, as each person | `e2e/smoke.spec.ts` | 220 pages | 0 |
| Unit and database tests | `npx vitest run` | 821 in 66 files | 0 |

A held check is a real fault written as a test that is switched off until the fault is fixed; each is named in the notes with its cause.

## The serious findings: access

The multi-user tester found that the access rules were weaker than the product claimed. All of these were live on production at the start of the phase. All are fixed, proved at the database as well as through the app, and deployed.

| # | What was wrong | Now |
|---|---|---|
| 1 | A password alone read everything for an account that has an authenticator: the code prompt was a page, not a rule. | The database refuses the session until the code is given (0160). |
| 2 | "Owners and admins must have an authenticator" was only a redirect on the sign-in page. | The database refuses them until they set one up; they are taken to the page that does it. |
| 3 | A share (grant) could be created with no fresh confirmation. | Needs a second-factor session, and the route asks for the code again. |
| 4 | The rate limiter could be called by anyone, signed in or not, to empty or refill any bucket. | Server only. |
| 5 | A person could clear their own second-factor lockout. | Server only; the server names the user. |
| 6 | One person could purge another person's binned people. | Runs with the caller's rights. |
| 7 | The cron secret sent together with a browser's cookies acted as that browser's user past the sensitive-path gate. | A system identity never reaches sensitive paths and never borrows cookies. |
| 8 | "Sign out there" left the other device working for up to an hour. | Refused on its next request; it lands on the sign-in page. |
| 9 | Accepting an invite could overwrite the role of someone already in the team (an owner accepting a viewer invite became a viewer). | The existing role is kept. |
| 10 | A quote could be linked to a person in another user's space. | Refused in the app (create and edit). The database guard is still to add: see "Not fixed". |
| 11 | A user could create a sprint naming a project in someone else's space. | 404 on both sprint routes. |
| 12 | Any signed-in user could list, download and delete every file in the tickets and Day log buckets (found in Phase 0). | Files follow their rows (0158). |
| 13 | The file store did not pass through the new session rules at all: it is a separate door from the data API. | One restrictive rule on the file store (0164). |

Found while closing these, and fixed in the same work:

- **API tokens had never worked.** The token table lost its owner column in the migration that created it, so making a token failed; reading one looked for the same missing column; and a token that did resolve reached the database as nobody. The `tix` command hid all three by falling back to the master secret. Tokens now work end to end and a new route family (`capture` and `daily`, nothing else) exists for the phone. Proved by `e2e/api-token.phil.spec.ts`.
- **A person refused by the new rules saw empty pages and errors**, with a message telling someone with no authenticator to enter a code. The middleware now asks the database why a session is refused and sends the person to the right page; an open page learns of it from the first refused call (0164, `middleware.ts`, `components/auth/SessionWatch.tsx`).

Proof on the hosted database, not only locally: `node scripts/verify-hardening.mjs` signs the hosted test account in and shows password alone refused, password plus code served, a signed-out session refused at once, and the two server-only functions closed. Nine of nine pass.

## Faults fixed, by surface

Full lists with file paths are in the notes. In short:

- **Capture:** rebuilt as Stream A, so the eight capture findings from the first round (double triage, wrong pending count, a 500 on a double submit, approval not sticking, and others) are closed by construction and each is now a passing check. The second round found five more in the new pipeline (spoken reminder times never set a reminder; the sweep starved behind recordings; a recording arriving before its words was never processed; a workout left no learning row; a ticket leaving the Inbox by any route but one left its card waiting). All fixed; the last in the database (0163) so every route is covered.
- **Day log:** an impossible date answered 500; deleting a day left its review items; wording and accessible names.
- **People and Quotes:** a quote from an unknown speaker was saved as Phil's own; nine smaller faults (stale lists, a page that loaded for ever, a missing ticket key on review cards, research states with AI off).
- **Hours:** Esc in a Log cell saved the abandoned text; typing into a cell reached by keyboard appended to the old value.
- **Receipts** (never exercised at runtime before): delete left photos behind; merge left pages unreadable; removing a participant reset other lines' shares; a corrected total was not re-judged; an upload could leave an orphan row.
- **Gousto and the October fixes:** a heart tapped during a search stayed unlit; four photo parsers answered 500 with AI off.
- **Work and Docs:** every write blanked the project page; the search box ate spaces; formatting was wiped on an empty editor; archived components could not be restored; sprint length a day short in summer time; a restored page showed the old content.
- **From the page pass:** Workout Now failed to start in the browser (the server rendered "Offline", the browser "Synced"); the calendar asked for weather and got a 500 when no forecast service is set up.

## Not fixed (on the build list)

By stream, so each is picked up where it belongs.

**Before the partner joins (Stream C):**
- The database has no same-space guard on links to a person (mentions, pending entities, the promote-on-link trigger). Needs a migration.
- People lists ignore the space: in a personal space the assignee picker, the @mention list and the Docs sharing dialog offer members of every team the person is in.
- Two spaces, one address: with a second space, Docs shows two identical "Home" cards with the same link and Projects shows two "General". This is what the partner meets on day one.
- A display name set in Settings never reaches the profile, and the dashboard greets everyone as "Phil".
- Reading someone's shared Work leaves no line in their access log.
- No way to cancel an invite or delete a team.
- A user can switch AI features on for themselves (Phil's decision, in the queue).
- The invite welcome tells an already-enrolled owner to "set up an authenticator".
- The fresh confirmation for sharing is enforced by the route only; at the database a second-factor session is enough. As designed; recorded so nobody assumes otherwise.
- API tokens: the "projects" part of a token's scope is recorded but checked by no route.

**Hours (Phil's decisions are in the checklist):** the Log is not usable at phone width; 9:22 or 9:23; whether "Total logged" includes credit; a JSON backup restores a held entry as merged (needs a migration); undo is one level only.

**Receipts:** no delete or edit of total, date and retailer on screen; a failed reparse demotes a good receipt; exactly 5p adrift shows as fine on screen; a three-way split over-collects a penny. Any receipt deleted or merged on production since the multi-user cutover may have stranded photos.

**Work:** the burndown never moves from the Work pages (it reads a table only the old route writes); a sole member can never receive a notification (the webhooks do not call the writer); notification links are absolute to the production host.

**Capture:** deleting a capture leaves its recording stored; an unmatched workout capture leaves a pending row; a recording over about 4 MB cannot be uploaded in one piece.

**Elsewhere:** a surviving exercise-level pain log is shown nowhere; the same 500-on-missing-key remains in the agent stream, the rundown and the receipt parser; Day log hard-codes "phil" in one place (held check `daylog-1`).

## Shipped

- Commits `dcb36f3..c9f95d4` (43 commits) went to production at 04:29 as one release: the access hardening, the capture rebuild, the daily loop, the Work and Docs fixes, and migrations **0160** (access hardening), **0161** (daily loop), **0162** (capture client id per space), **0163** (a capture card follows its ticket). An on-demand dump was taken first (`A:\Backups\mycelium\on-demand\2026-11-20`, 188 tables).
- After the deploy: the hosted proof above; the system identity (crons, Telegram, the API secret) still reads and writes; one test capture was sent to production, processed in six seconds and discarded; the daily loop answered with a proposal built from Phil's real tickets.
- A second release follows this report with 0164, the token fixes and the two "right page" fixes; its commit is in the capture report.

## Deviations

- **Phase 1 overlapped Streams A and B.** The capture findings were closed by building Stream A rather than by patching the old pipeline, and the testers then adapted their specs to it. The report therefore describes capture as it is now.
- **Old live-check tickets were closed, not run.** MYC-111, 140, 142, 144, 146 and 159 were each a list for Phil to work through by hand. Everything in them that a machine can prove is now a passing check; what is left is in the new checklist, one chunk per surface. MYC-136 was already done.
- **Receipts and photo parsing were tested with cloud AI off.** What the model returns for a real receipt is in the checklist (a few pence).
- **Test residue was left on the local stack** where the app has no delete: archived `E2E-work-*` projects, 52 `E2E-mu-…` teams, soft-deleted captures. Nothing on production.

## Mistakes made by the run

1. **The PC worker failed against production for ninety minutes and nobody was told.** The scheduled task was started five minutes before the fix it needed was committed, and it kept running the old code. Found by reading its log at 04:35; restarted; it now checks in. The worker should raise a hand after repeated failures: on the Stream E list.
2. **My isolation test wiped the second test person's space.** It clears her space before it runs, and I pointed it at the wrong port, so it stopped there. Two testers lost time to tickets with no status. The script now puts a space's defaults back itself.
3. **A unit test of mine ended another suite's session.** It ended "her newest session" instead of its own. Fixed; and the set-up now checks a saved session against the server instead of trusting its age.
4. **A fifteen-second cache in the new session check** made a just-refused session look fine. Caught by the released check within minutes and removed before it shipped.

## Design calls

- **The session rules live in the database, not in the routes.** One function is part of every row rule and a hook runs before every data request, so about 200 routes are covered without each having to remember. The cost is that a refusal surfaces as a database error unless something translates it; the middleware now does.
- **The middleware asks the database about the session on every request.** One small round trip, not remembered between requests, because nothing visible to the middleware says when a "yes" stops being true. If the question cannot be asked within 2.5 seconds the request goes on and the database still refuses what it must.
- **"A capture card is answered when its ticket leaves the Inbox" is a database trigger**, not code in each route: there are at least six routes that move a ticket.
- **Admins without an authenticator are locked to the set-up page rather than refused the role.** Refusing the promotion would be kinder but needs every path to a role to check (invite, promote, successor, transfer, creating a team); the lock covers all of them at once. The checklist tells Phil to have the partner set one up first.

## For Phil

- **One checklist: "Live checks after the test pass"**, eleven chunks, one surface each, about fifteen minutes each, in any order. Chunk 1 (signing in after the hardening) is five minutes and should be first: your own sign-in is the one thing only you can prove.
- **A second checklist: the iPhone Shortcuts build.** A Shortcut file cannot be made on a Windows PC, so it is written steps, about forty minutes in all. It uses a new token that can capture and nothing else.
- When you next sign in you may be asked for your authenticator code where you were not before. That is the new rule, not a fault.
- About 40 captures were waiting when the new review queue went live. Anything older than seven days files itself tonight, tagged "unreviewed".
- **This terminal cannot write the Claude project's copies of `claude/context.md` and `claude/backlog.md`.** The repo copies are current; a Cowork session should copy them across. `graphify update .` could not run (not installed on this PC).
