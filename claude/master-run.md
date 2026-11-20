# Mycelium — Master Run

*Written 2026-11-20 (Cowork chat with Phil; repo read at `6d9f736`, migrations through 0156, production live on `bce9e87`+). This is the single brief for a long Claude Code run on the PC at `A:\Projects\Mycelium`. Start it with: **"Read `claude/master-run.md` and execute it."** Every decision here is Phil's unless marked `[claude]`; the full decision record is the two "Intake" sections at the top of `claude/backlog.md`. Where this doc and the code disagree, the code wins: fix the doc and note the drift.*

*Reconciled at run start, 2026-11-20 02:00: repo at `8274dd1`, hosted = local migrations through **0157**, production on `8274dd1`. Drift fixed in place below and marked `[run]`: the four research conflicts are decided (§0); Hours parts 2–4 are already built (§12); the Playwright library was already a dev dependency (§3).*

## 0. What this run is for

Phil built Mycelium and does not use it. His words: capture is slow and unreliable, nothing pulls him back, it looks uninspiring, and his own follow-through keeps him from the tool that is meant to fix his follow-through. Mycelium is **personal, not a product**, and must cost as close to nothing as possible beyond his Claude plan.

**The design rule that outranks every other choice `[claude]`: the app comes to Phil; it does not wait to be opened.** Capture must never lose anything. Every surface asks for the fewest possible decisions. Nothing shames him.

**Research (landed 2026-11-20): `claude/nd-design-research.md`** — what helps ADHD and autistic minds get things done, as 32 numbered design rules, a wording table and eight personal measures. Read it before building the daily loop, nudges, dormant indicator or any UI. Phil asked for its findings to be implemented, so:

- **Apply every rule that fits his decisions.** That is most of them, notably: zero-initiation entry and zero-debt return (1–2), sixty-second sessions (3), no shame mechanics and the wording table (5), sensory defaults (7), loop before landscape (8), the focus card with Start / Not now / Swap, a countdown and if-then first steps (9–12), a "now" line and a growth network that only grows (13, 15), the morning proposal prepared the night before and self-applying if untouched (16), the day won on item one (17), evening close of two minutes opening with what got done (18), split brain-dump items landing as ideas, not commitments (19, second half), parking with a "where I left off" note (21), finish-line exits including "good enough" and "drop" (22), feedback within 300 ms (24), week fill and lifetime totals with no breakable streak (25), nothing firing during a focus timer (27), short wall speech (29), Kirsty's nudges shaped as offers with wins shown first and a no-reason "Not today" (30), scroll friction via a Shortcuts automation (31), and the eight measures reviewed monthly in the close-out (§6 of the report).
- **Four rules contradicted a decision Phil made. He decided each on 2026-11-20** `[run]` (recorded in the backlog Intake section; this replaces the earlier "in his queue" wording): **capture** — every capture goes to review, and anything unreviewed after 7 days files itself with the AI's guess and an "unreviewed" tag (rule 20 adopted, rule 19 first half not); **interruptions** — one budget of 3 a day across push + Telegram + wall speech (rule 26 adopted; Kirsty's nudges and anything Phil starts himself do not count); **the Boys** — all free to reply, no per-message guard, only the £5 monthly AI cap limits them (rule 28 not adopted); **dormant features** — his version stands: true history, marks in the nav and dashboard, the Boys ask why (rule 32 not adopted). `[claude]` check: the "return time" measure in the monthly close-out shows whether the dormant marks help or cost.
- Kirsty's nudges stay unlimited (his decision); rule 30 shapes them without capping them.

## 1. Standing rules

**Autonomy: full free rein.** Build, test, merge to `main`, deploy and `supabase db push --remote --yes` without asking. Keep going; never wait for approval between phases.

**Stop and wait for Phil only for:**
1. A sign-in, account creation, bank link, password or 2FA code that only he can do.
2. Anything that costs money (any paid plan, fee or top-up, however small).

Everything else you decide. Design taste calls: pick the option closest to the stated direction and list it for review. Deleting real data does not stop the run, so **`[claude]` safeguard: run `scripts\db-backup.ps1` for an on-demand dump before every `db push` and before any destructive data change.**

**When blocked on Phil:** park that item, add it to "Phil's queue" (§14) as a ticket with the exact link and exact value needed, send one Telegram message, and carry on with everything else.

**Repo invariants (from `AGENTS.md` and the project instructions; unchanged):**
- `rm -rf .next` then `npx next build` before every push. `tsc --noEmit` is not enough.
- RLS on every table via `app.register_table(...)`; re-run the 0111 policy/grant loop; restrictive policy names must not collide (the 0146 lesson). Finance and platform tables are owner-only and written by hand.
- Migrations are numbered by build order and applied only with `supabase db push`.
- No secret value in any doc, commit, report or chat message. Credentials live in `.env.local` and Vercel env only.
- No API GET is public unless deliberately decided.
- Vercel is **Hobby**: crons in `vercel.json` must be daily. Anything more frequent goes to cron-job.org (Phil creates those jobs) or to the PC worker (§9).
- UI preferences in `ui_prefs`, never new localStorage. Daily boundaries Europe/London. UK English.

**Bugs found along the way:** fix, prove with a test, list in the report.

## 2. Parallel streams, one migrations lane

Phil chose **everything in parallel**. His own invariant says exactly one worktree may own `supabase/migrations/**` at a time, and worktree setup is unfinished (`claude/worktree-setup.md`). So:

- Finish worktree setup first (baseRef, gitignore, ports, pnpm decision, how `.claude/skills` reaches a worktree). Never symlink `node_modules` while any branch touches `package.json`; never symlink `.next`.
- Run code streams in separate worktrees, in parallel.
- **One migrations lane.** A stream that needs a migration takes the lock (a `MIGRATIONS.lock` note in the main checkout naming the stream), writes its migration with the next free number, merges to `main`, pushes, releases. Order of the queue: capture → daily loop → PC worker → Kirsty → family → finance → the rest.
- `main` is production. Merge a stream only when its build and tests pass.

## 3. Phase 0 — reconcile and housekeeping

1. `git status`: commit the doc edits made from Cowork on 2026-11-19/20 (`claude/backlog.md`, `context.md`, `spec-index.md`, this file). Move `.git/stale-maintenance-lock-claude` out of the way if present.
2. Decide the uncommitted `.claude/skills` and `.claude/settings*` edits: commit what is intended, discard what is not, record which.
3. Confirm hosted = local migrations, the nightly backup ran, production is on the latest commit.
4. Install Playwright as a dev dependency (the repo has vitest and `npm run isolation-test` only). `[run]` The `playwright` library was already there for `scripts/screenshot.mjs`; what was missing is the test runner, a config and the browser.
5. Create the **test account** (§6) so every later phase can be checked as a second user.

## 4. Phase 1 — test everything already built

Goal: Phil verifies in 15-minute sittings, not evenings.

1. Automated pass (Playwright + API + `isolation-test`) across every built-but-unverified surface: Work + Docs (MYC-174), People contacts (MYC-165) and People review (MYC-175), Quotes, Day log A–E, typed capture + capture learning, Hours part 1 (MYC-177), multi-user (invite, accept, roles, grants, rundowns, export, delete), Gousto cookbook, receipts end to end, the 2026-10-29 fixes.
2. Run each as Phil and as the test account (second-user browser pass).
3. Fix what breaks. Re-test.
4. Generate **one checklist** in the house format (a ticket with steps, tick boxes and answer boxes, state in the database, as MYC-177 does) containing only what needs Phil's eyes, **split into 15-minute chunks, one surface per chunk**. Chunks are served one at a time on his daily list; finishing one queues the next.
5. Close MYC-111, 136, 140, 142, 144, 146 and 159 with a note; carry anything still relevant into the new checklist.

## 5. Stream A — capture (first priority)

- **Server:** the capture endpoints (`/api/capture`, `/api/capture-audio`) answer **202 in under a second** and do transcription and classification afterwards. Idempotent on a client-supplied id so a retry never duplicates.
- **iPhone Shortcut:** dictation text is sent immediately; the audio is saved to an iCloud Drive folder "Mycelium Inbox" *before* any upload is attempted, then uploaded; a file is removed only after the server confirms. A second "Retry" Shortcut resends whatever is left, and a personal automation runs it when the phone is plugged in. Triggers: Action Button, lock-screen widget, Siri phrase. You cannot install Shortcuts on the phone: deliver a build guide in Phil's how-to house style as a checklist ticket.
- **Transcription:** instant text from iPhone dictation; the saved audio is re-transcribed by Whisper on the PC (§9) and the item corrected if the text differs — unless Phil edited the text by hand, in which case his edit wins.
- **Edit before sending (Phil, 2026-11-20):** after dictation the Shortcut shows the text in an editable box, pre-filled, with Send as the default action. The audio is already saved to the inbox folder before the box appears, so abandoning the edit loses nothing; if he dismisses the box the unedited text is sent.
- **Paragraphs:** long captures get line breaks between paragraphs. The server adds them (wording untouched) to the stored text and the review card; if a quick, free way to break paragraphs inside the Shortcut before the edit box exists, use it too.
- **Feedback:** instant "Saved", then a push "Filed as …" with a fix link.
- **Routing:** every capture goes to review; a card unreviewed for 7 days files itself with the AI's guess and an "unreviewed" tag `[run]`. Review is **swipe cards** (right = accept the suggested filing, left = fix), cleared **in the evening close**. Long captures are **split into separate items**, each its own card linked to the original recording.
- **Other inputs:** share sheet (links, screenshots, text), photo capture, typed quick-note widget.

## 6. Stream B — daily loop, the Boys, dormant features

- **Morning pick** fires when Phil's alarm stops (Shortcuts automation calling an endpoint); **evening close** when he plugs in, with a fallback time. The AI proposes today from dates, priority and energy; one tap accepts or swaps. Today holds **5 items**, the first marked as the one that makes the day a win.
- **Evening close** (target: under a minute): done / moves / drops, capture review cards, low-confidence finance cards.
- **Finishing aids:** every big item carries a five-minute next step; a finish-line view (80%+ done); a weekly close-out session that only finishes; a WIP limit that works as **park one to start one**.
- **Chasing:** one budget of **3 app-initiated interruptions a day across push + Telegram + wall speech** `[run]`. Kirsty's nudges and anything Phil starts himself are outside it.
- **The Boys group chat:** one Telegram bot per agent in one group, each posting as itself; server-side routing decides who answers. All may reply; no per-message guard `[run]` (Phil, 2026-11-20), only the AI cap in §9. Bots cannot read each other, and privacy mode must be off to see plain messages. The existing single-bot chat and Day log routing (`/c ` escape) must keep working. Creating bots in BotFather is Phil's (§14).
- **Dormant features:** record a usage event whenever Phil *does something* in a feature (add, edit, complete; a page view does not count). Each feature has its own natural cadence (daily ones flag after a few days, monthly ones after about six weeks). Backfill **true history** from existing rows via the entity registry. Show it as a dimmed nav item and a "gone quiet" dashboard card, factual and low-key; the Boys raise it in the weekly close-out and ask why.
- **Test account:** a dedicated user in every team Phil is in, with the same grants Kirsty will get, TOTP on, secret in `.env.local` only.

## 7. Stream C — Kirsty (build now, invite later)

Phil invites her **after the UI rebuild**; build and test everything with the test account now.

- Her view of Phil's space (direct grant, view): Work, Fitness, and Day log **only for entries Phil marks shared**. Grants are per entity group, so this needs a per-entry share flag honoured by RLS.
- **Nudge:** she taps Nudge on any item of his she can see; he gets a push (and the wall says it). No limit.
- Her own space starts with Work, Fitness + Health, Day log. He sees only what she chooses to share.
- A **family team** both belong to; either can add and assign items there. His personal list stays his.
- Update `docs/onboarding.md` and write her first-run.

## 8. Stream D — family

In the family team space, everything shared on one timeline. Kirsty's first-run asks her to confirm that `[claude]`.

- **Pregnancy:** week-by-week from the due date (Phil enters it), timeline of scans and notes, appointments and reminders on a family calendar, a shared name-ideas list with voting.
- **Prep checklists** (nursery, hospital bag, buying list): price, bought, link per item, running total; starter lists pre-filled.
- **Letters to baby:** a weekly prompt with a different, creative question each week, answered by voice in about a minute.
- **Baby log:** feeds, sleep, nappies; one tap, both parents, phones and wall. **Must be finished before the due date.**
- **Household:** admin (documents, warranties, bins) and a **household budget** (bills, baby costs, who paid what). This is family data, not the finance section.
- **Input:** normal capture routed to the family timeline, plus upload in the app.
- **Photos:** Cloudflare R2 free tier (10 GB, no egress fees); creating the account is Phil's.
- **Later keepsakes** (design the data for them now): narrated animated film, private time-capsule site, letters collection, printed photobook.

## 9. Stream E — PC worker, cost and hosting

Hybrid: Vercel + Supabase free stay the always-on part; the PC does heavy and costed work.

- **Job queue:** a table in the cloud; a Windows service on the PC polls every minute, does the work, posts results back. Nothing on the home network is exposed.
- **Local first:** Whisper transcription, capture classification and simple agent replies on the RTX 4070; a natural open-source voice for spoken output. Cloud AI only when the PC is off or the job needs it.
- **Hard monthly cloud-AI cap of £5** with an alert, enforced from `api_usage`; over the cap, jobs queue for the PC.
- **Backups:** second copy of the nightly dump on a second drive in the PC (Phil names the drive). Add a restore test against the local stack.
- **Database size:** move bulk reference data (Gousto recipe details, old metrics) out of the hosted database first; personal records stay.

## 10. Stream F — finance (owner-only, never shared)

- **Bank feeds:** GoCardless/Nordigen is closed to new sign-ups. Use **Enable Banking restricted mode** (free, read-only, own accounts). Verify Halifax, Revolut and AMEX are covered before building each; sign-up and linking are Phil's. Daily early-morning sync. Feeds land in the existing `bank_transactions` shape and de-duplicate against CSV rows. **The per-bank CSV parsers are frozen.**
- **Re-link:** a dated ticket and push a week before a consent expires, with the exact link; if it lapses the feed pauses and the email backup fills the gap.
- **PayPal:** verify the existing sync.
- **Email import** (Gmail connector data and an IONOS inbox over IMAP, credentials in env): receipts → purchases linked to the bank transaction; bills and due dates → dated tickets; statements as a gap-filling backup; **order, ticket and tracking numbers captured against the payment**, with delivery status where there is a tracking number.
- **What it does:** bills and subscriptions (recurring detection, due dates, price rises, forgotten subs); budget vs actual; spending nudges; net worth over time (bank + cards, investments + crypto from free price feeds, pension, house/mortgage/cars by hand).
- **Categorising:** silent; only low-confidence ones become swipe cards in the evening close.
- **Royal London pension:** no personal API. Read the value from statement emails and add a small recurring "update pension figure" item. Never automate a login to a bank or pension site.

## 11. Stream G — wall screen

Target: a touch A3-landscape screen with speakers (Phil's photo frame; model unknown). Build a wall route that runs in any modern browser. If the frame cannot run it, give Phil a costed list of alternatives and stop there (buying is his call).

- **Glance:** today per person (next things, hours left, streaks), family calendar and due-date countdown, weather and bins. Person switcher: Phil / Kirsty / Family.
- **Full app on the wall.** `[claude]` The wall signs in as a household device in the family team; entering a person's own space needs that person's quick unlock and times out back to the family view.
- **Speakers:** completion chime, Kirsty's nudges aloud, spoken reminders, morning briefing read aloud; voice from the PC (§9), falling back to the browser's built-in voice.
- **Voice in:** tap-to-talk only.
- **Idle:** an ambient view of the home landscape (follows the final UI direction). Auto-dim and silent overnight.
- **Privacy:** finance never appears; one-tap guest mode shows clock, weather and photos only.
- Survey open-source wall dashboards on GitHub for ideas before designing.

## 12. Stream H — harvest and other apps

- **Gifts:** build `claude/gifts-spec.md` (2026-09-14).
- **Settings nav:** the sidebar auto-expands the group for the current route; landing on Security, People or Teams selects the first sub-section, the rest as URL-reflected tabs.
- **AI model list:** pulled daily from provider APIs; a model is selectable only once priced in `lib/config/models.ts`; Telegram nudge on new models and on retired-but-pinned ones; no auto-switching.
- **Dashboard cards:** width=2 promotes to 3-wide; masonry flow.
- **Other apps into Work:** import each repo under `A:\Projects` (PhirstMaxxing, phirstmaxxing-web, StreetGuesser, DropShipAuto, daytripper, polysnipe, mediaCleanUp) as a live Work project with open items harvested from its repo and docs. Read-only on those repos; ask Phil for folder access if needed.
- Hours parts 2–4 were built on 2026-11-20 before this run started (MYC-176; Phil's live check is MYC-177) `[run]`, so nothing remains there. The backlog's committed items that need nothing from Phil.

## 13. Stream I — UI rebuild: GATED

**Do not rebuild the UI in this run.** Phil is bringing examples and skills; the direction is not final. Current lean: calmer dark (lower contrast, no neon), spatial-led; prototype B "Terrain" is the favourite for two reasons — the landscape as a place items live in, and growth from real completion history. Prototype links are in the backlog.

Allowed now, because any direction needs it:
- Collapse the two stacked colour-token systems into one (700+ back-compat usages) without changing how anything looks.
- An **old/new shell switch** in Settings (`ui_prefs`).
- Phone opens on a single next-thing card; desktop and wall on the feed; every section stays in the nav.
- Inner working pages stay calm and flat. Monospace for numbers only.
- Completion feedback hooks (motion, soft chime with a mute toggle, progress), behind the switch.
- Items are placed by time; undated ones mid-distance by priority. Slipped items do not pile up at the front (research rule 14, replacing the earlier `[claude]` default): the front zone holds at most three, and anything slipped for seven days is offered once as Re-date / Someday / Drop. The word "overdue" is never shown.

## 14. Phil's queue — the only things that need him

Create each as a dated ticket with the exact link and value, in the checklist format:

1. Create the four cron-job.org jobs in `docs/cron-migration.md` (rundowns, check-ins, quotes research and Day log prompts do not fire until then), plus any new sub-daily jobs this run adds.
2. Reconnect Google in Settings → Integrations (token dead since June).
3. Enable Banking: sign up, create the application, link Halifax, Revolut, AMEX.
4. IONOS inbox: create it, redirect banking emails, put the IMAP credentials in `.env.local` and Vercel.
5. Cloudflare account and R2 bucket keys.
6. BotFather: one bot per agent; add them to one group; tokens into env.
7. Build the iPhone Shortcuts from the guide; set the alarm and plug-in automations.
8. Name the second backup drive.
9. Enter the due date; tell the run the photo frame's make and model when the box turns up.
10. UI examples and skills for the rebuild.
11. Supabase Security Advisor review; retire the legacy Vercel env vars; revoke cutover tokens; decision 0.2 (`platform` owner-only).
12. The 15-minute checklist chunks.
13. ~~Decide the four places the research contradicts his choices~~ — decided 2026-11-20, see §0 `[run]`.
14. Set up the scroll-friction automation from the guide (research rule 31), if he wants it.

## 15. Done, and reporting

A phase is **built** when it builds, tests pass and it is deployed. It is **done** only when Phil has verified it live through his checklist chunk.

At the end of every phase:
- Update `claude/backlog.md`, `claude/context.md` and the relevant `claude/spec-*.md` in the repo.
- Write `docs/run/<stream>-report.md`: findings, file paths, commit hashes, deviations, design calls made for review. No code in reports.
- Add the phase's checklist chunk(s).
- Send one short Telegram message: what landed, what is blocked on Phil.
- A plain Claude Code terminal cannot write the Claude project's copies of the docs: say so in the report so the next Cowork session syncs them.
