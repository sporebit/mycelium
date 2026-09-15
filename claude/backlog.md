# Mycelium — Backlog

*Canonical backlog. Statuses: idea / committed / in-progress / blocked / done. `[claude]` = Claude-suggested. No fixed priority order. Done = builds + tests + Phil verified live. Last updated 2026-09-14 (Tickets designed — 35 decisions, spec at `claude/tickets-spec.md`; it absorbs Checklists, Reminders, Habits and venture_steps and takes the first slot after cutover; Day log / Journal v2 and Quotes designed earlier the same day).*

## Tickets — backlog, GTD and life tasks (spec: `claude/tickets-spec.md`, written 2026-09-14 from 35 decisions)

- **committed — FIRST after cutover, on main, one stream (branch `tickets`), migrations 0116–0118, gated Parts A–H (spec §15)** — replaces Tasks in place (`tasks` → `tickets` rename with `/api/tasks/*` compatibility for one release) and **absorbs Checklists (steps/templates on a ticket), Reminders (`kind = reminder`), Habits (series recurrence + `ticket_completions`) and venture_steps**. Four-level tree Area → Project/sub-project → Ticket → Sub-task; per-project keys (`MYC-142`, `HOME-7`; Inbox tickets take the space prefix, keys stable on move); statuses configurable per project but every status maps to a fixed category (inbox/backlog/next/doing/waiting/verify/done/cancelled); full GTD (Inbox → Clarify → Next / Waiting For / Someday / Logbook + guided Weekly Review); context facets Where (fixed) / Tool (open) / Time window + Fibonacci points; the **Now view** (auto device + clock, sticky Where, one-tap override) is the home tab; scheduled + deadline dates; NOW score stays FROZEN under the hood with an urgent flag; recurrence (spawn/series); capture straight to Inbox from Telegram/Shortcut with Claude's suggestions; check-ins (18:00), morning-briefing block, weekly-review reminder (Sunday 18:00); rundowns on demand + nightly for tomorrow (Sonnet + web search, £10/month cap); templates from UI and repo JSON; assignee + waiting-on Person; team permissions per P12 roles; GitHub App webhook (merge → Verify; Vercel deploy + smoke → Done with evidence) + opt-in two-way Issues sync (off by default); `tix` CLI + global Claude Code skill + scoped `api_tokens`; export regenerates this file. Import: tasks, projects, backlog.md, reminders, habits, venture_steps, the cutover run-book, then other projects' backlogs via the harvest addendum. Purchases stay separate but linkable. Claude may set Done with evidence; Phil's live check is the separate `verified_by`.
- **committed — before Part A** — Cowork produces `docs/tickets/import/backlog-2026-09.json` from this file and `docs/tickets/import/multi-user-cutover.json` from the artifact store; Phil reviews the derived project prefixes and the area mapping (spec §13.2).
- **committed — Part H** — rule changes on ship (spec §16): instructions Backlog paragraph → DB canonical, this file generated; done/verified split; session-start reads via `tix`/API; weekly run exports; checklists spec marked superseded; spec-organisation/platform updated; global-instructions paragraph + repo `CLAUDE.md` snippet + harvest addendum delivered (spec §14.5) — this supersedes the Meta "global-instructions prompt for checklists" item.
- **v1.1 (decided, not scheduled)** — Da Boi ticket tools (list / create / move / plan); forwarded-email evidence; rundowns-at-creation per project.
- **note** `[claude]` — flags raised once, spec §2: Claude-closes-tickets changes the recorded done rule (resolved by `verified_by`); configurable statuses bind automation to categories, never names; two-way Issues sync doubles the failure surface (opt-in, loop guards); "everything in one go" still runs as gated Parts, 6–8 Claude Code sessions, Quotes and Day log wait; folding Habits must keep the one-tap tile and migrate history by count; the `tasks` rename is a large mechanical diff; life evidence detection is weak in v1 — the check-in is the real mechanism.
- **open (Phil)** — spec §17 assumptions: attachments bucket limits; compatibility-route removal timing; status-collapse toggle default.

## Multi-user / teams — P12 (branch `multi-user`, migrations 0102–0115; source of truth: repo `docs/multi-user-handoff.md`)

- **done (branch, verified locally)** — Part 0 pre-flight; Part 1 identity (`0102`); Part 2 spaces + ownership (`0103`–`0109`); Part 3 authorisation + client swap (`0110`–`0111`, 277 files, isolation test 0 leaks / 152 endpoints / 85 tables); Part 4 teams, invites, grants (`0112`); Part 5 security ops + admin (`0113`–`0114`); Part 6 rundowns (`0115`). Not "done" by this backlog's definition until cutover and Phil's live verification.
- **done (2026-09-11)** — **VERIFY 2 half 2**: Claude Code restored the live dump into the local stack, replayed 0102–0115 on real data, ran the ownership verifier → 0 failures over 85 tables, row counts preserved, no unmappable `user_id`. The only non-`phil` value was the empty `user_settings` `'default'` placeholder, removed cleanly by `0104`. The whole restore→repair→replay sequence doubled as a rollback rehearsal.
- **done (2026-09-11, `5eb84ee`)** `[claude]` — **fixed `scripts/verify-ownership.ts`**: it flagged Parts 4–6 access tables (uuid FK named `user_id`, e.g. `audit_events`) as ownership violations (six false failures). Now keys on column type, not name. The from-empty replay and VERIFY 2 are green only as of this commit.
- **done (2026-09-11)** — **regression gate rehearsed READY** (re-run at real cutover): `npm test` 156/156; isolation 0 leaks / 0 mismatches over 152 endpoints (the only 5xx are Google-sync/Spotify routes lacking local OAuth creds — ENV); clean build; `db push --dry-run` = exactly the fourteen files 0102–0115. Live `auth.users` empty, so step 4.3's precondition holds.
- **done (2026-09-11)** `[claude]` — corrected `docs/multi-user-rollback.md` (`184207e`): dump-completeness by **row-count parity**, not file-size ratio (a 2.7 MB data dump vs 23 MB `pg_database_size` is complete — catalog/extensions/bloat inflate the DB size); schema dump carries no `supabase_migrations` history (restore always needs the repair step); the `auth` and `storage` COPY blocks fail on a target running a different GoTrue version (restore public rows only; auth users are recreated by the fixed-uid insert / re-invite); Session-pooler + Git-Bash notes. The run-book page (v3.1) now matches the row-parity rule.
- **RESOLVED decision — Vercel plan is Pro**: the hourly rundowns cron in `vercel.json` stays; step 1.8 needs no change.
- **RESOLVED decision — `user_settings` placeholder (0.1)**: the replay proved the `'default'` row was empty and `0104` removed it cleanly, so "fine" carries no data risk. Phil to tick. **Still open — `platform` owner-only (0.2)**: a design call, no data behind it; recommend fine (OAuth tokens in `user_settings`).
- **committed — decision needed** — cutover **route**: staging rehearsal (recommended) or straight to cutover. With Claude Code driving, Phil's share of the rehearsal is ~15 min. Toggle on the page.
- **committed** — clear the two untracked files the rehearsal left (`docs/mycelium-cutover (1).html`, `Claude outputs/`) before Part 7 step 4.2 — its `git status` gate needs a clean tree. Move them out or gitignore; do **not** commit the standalone HTML into the repo.
- **in-progress — Phil + Claude Code** — the run-book: **Mycelium Cutover** artifact v3.1 (2026-09-11), 34 steps, executed by Claude Code with tokens Phil mints in step 0.4 and revokes in 4.10; manual fallback folded under each prompt. Phil keeps: decisions, the Google OAuth client (console only), one Preview-only staging JWT value, the test-mailbox invite acceptance, phone TOTP + Google click, and the **GO gate at 4.4**. State + Phase-2 answers/ticks live in the artifact store `checklists/multi-user-cutover` (Cowork wrote them; Claude Code cannot reach the store). Captured values: team `sporebit-s-projects`, project `mycelium`, preview `https://mycelium-git-multi-user-sporebit-s-projects.vercel.app`, dump `A:\Backups\mycelium\2026-09-11`, counts 87/185/38, 91 tables.
- **committed** — Part 7 cutover, Phil present at the gate: 4.2 gate (Claude Code) → 4.3 fixed-uid insert (no password) → **4.4 GO (Phil)** → 4.5 merge + `git push origin main` + `supabase db push` → 4.6 automated smoke test → 4.7 Phil: TOTP/Google/Telegram/invite → 4.8 verifiers as the viewer → 4.9 retire old secrets + restore Preview env + redeploy → 4.10 Phil revokes tokens. Rollback = `docs/multi-user-rollback.md` only.
- **committed** `[claude]` — corrections to the checklist file, to be applied by Claude Code when it next touches it: `/**` redirect patterns; five token-hash templates; passkeys need RP ID/origin on hosted; §5's preview-verify needs a staging DB; every §1 setting is a Management API field.
- **committed** `[claude]` — **never rotate or migrate the legacy JWT secret** (`withUser()` mints HS256 with it; no private key exposed). Corollary: the Management API does not expose the legacy secret either, so any new project (staging, a rollback target) needs one manual Reveal → Vercel paste. Add to `docs/multi-user-handoff.md` "Decisions locked".
- **committed** — 1.1 note: a Google OAuth client already exists (`GOOGLE_CLIENT_ID` on Vercel, Calendar integration). Recommend a separate sign-in client; reusing the calendar client also works.
- **committed** — onboarding how-to for new users (plan §7). Must say: an invitee who confirms by email lands on `/` and opens the invite link again to accept.
- **committed** `[claude]` — after cutover, the DB-backup item becomes the next security task (Free has no backups; the cutover dump is the only restore point).
- **idea** `[claude]` — `scripts/verify-identity.mjs` (generateLink → callback → Playwright); run-book 3.6 / 4.6 do exactly this — Claude Code should leave the script behind.
- **superseded** — P10 replaced by P12 2026-09-06. Plan of record `claude/multi-user-plan.md` (open items A–D answered by the build).

## Checklists — guides, test runs, tick-box exercises (spec: `claude/checklists-spec.md`, written 2026-09-11) — **ABSORBED by Tickets 2026-09-14**

- **superseded** — the standalone `checklists` table and pages are not built; the spec's §3 definition/state shapes survive as `tickets.steps_definition` / `steps_state`, the API's per-key merge as `/api/tickets/[key]/steps`, and the house-style page as the render for `kind ∈ {runbook, test, guide, audit, setup}` (tickets spec §9). Items below carry over into the Tickets stream.
- **committed — Tickets Part A** — import the cutover run as ticket `MYC-<n>`, kind `runbook`, Done, `verified_by` Phil: Cowork exports `checklists/multi-user-cutover` → `docs/tickets/import/multi-user-cutover.json` (definition + state); the import script inserts it. (The run already has real Phase-2 answers in the store to import.)
- **note** — the cutover checklist can't be in the table yet: the DB it would live in is the one being cut over; the migration must be numbered after 0115.
- **committed — Tickets Part D** `[claude]` — the page must also render `kind = test`. First candidate: the P12 post-cutover verification (run-book 4.6–4.8) as a re-runnable test-plan ticket.
- **committed — Tickets Part G** `[claude]` — Cowork/Claude-Code habit: read an open run's answers via `tix answers KEY` / the API before any task that depends on them (dump path, staging ref, team slug) instead of asking Phil again.

## Quotes (spec: `claude/quotes-spec.md`, written 2026-09-14 from 28 decisions)

- **committed — after cutover and after Tickets, on main** — build Quotes v1: migration `<next>_quotes.sql` (table `quotes` per spec §3 with `space_id`/`created_by`, entity group `organisation.quotes`, RLS per invariant, pg_trgm index — verify the extension is enabled on hosted); `classifyCapture` intent `quote` + extraction (speaker rules, `is_own`, `speaker_confidence`, context, relative `said_at`, `likely_original`); Shortcut + Telegram both, both reply with a read-back of quote + person; pending-entity kind `quote` through the **captures review queue** with People alias resolution (never auto-create a person) and a near-duplicate warning + merge; on approval, **background research** (Sonnet + Anthropic web search via `after()` plus a cron-job.org sweeper `/api/cron/quotes-research`; `likely_original` → `skipped`; result always shown with a confidence label; overrides wrong / their own / edit `attributed_to`); routes `/api/quotes` (+`[id]`, `[id]/research`, `export`), `/api/people/[id]/quotes`; page `/organisation/quotes` with newest+search, by person (incl. Mine), merch filter, by month; People detail Quotes tab + list count; merch = flag + filter + export. Claude Code prompt in spec §11. Build order: Tickets first (Q25, 2026-09-14), then Quotes and Day log in whichever order Phil starts — the next migration number after 0118.
- **committed — v1.1 (decided, not yet scheduled)** — merch image generation **via the Higgsfield connector** (Phil's choice; wiring — Cowork on request vs the app calling the Higgsfield API — not decided) and **Telegram send to Phil's own chat** via the existing `/api/telegram/send` (he forwards).
- **idea** — `media_items` link as a quote source (v1 is free-text `source`).
- **note** `[claude]` — flags raised once, in spec §10: review-queue latency vs the "we forgot it" problem; the skip-classifier can miss a famous line; AI image generators are poor at legible t-shirt text (composite text over the generated artwork); always-showing low-confidence research needs a loud label and the "wrong" override.

## Day log — Journal v2 (spec: `claude/daylog-spec.md`, written 2026-09-14 from 30 decisions + the nightly-scores addition)

- **committed — after cutover and after Tickets, on main, one branch `daylog`, one migration, five parts (spec §12)** — nightly interview about the day, **replacing the 0003 Journal** (entries migrated). **Part A** loop + transcript + summary + scores: migration `<next>_daylog.sql` (`daylog_days` with append-only `transcript`, editable `summary`, per-turn `extraction` working state, `scores` jsonb; `daylog_scenes`, `daylog_scene_people`, `daylog_facts`, `daylog_media`; `people.linked_user_id`; entity group `journal.daylog`; RLS per invariant incl. the linked-user select policies), `lib/daylog/engine.ts` with the rules block in `lib/daylog/rules.md`, Telegram prompt with **Talk / Quick / Skip / Snooze** buttons + the open-window routing rule (`/c ` escape), `/api/cron/daylog` every 15 min 20:00–03:15 (no LLM), **Sonnet** conversation (one question per turn; never assert world facts; slot list from settings; "who's X?" once; depth from richness; turn cap default 15) + Sonnet close narrative, the **score line every night in every mode** (mood · energy · sleep · productivity by default, keys in settings; Skip = scores only, zero LLM calls), `/journal` + `/journal/[date]`, Settings → Journal panel, `api_usage` tagging + monthly £ alert. **Part B** per-turn **Haiku delta extraction** → scenes at close → pending kinds `daylog_person_link` / `daylog_new_person` / `daylog_fact` / `daylog_place` / `quote` through the captures review queue (never auto-create a person); approval writes `daylog_scene_people` / `daylog_facts`; Quick mode; re-extract; scene/fact editing (transcript immutable, `edited_by_user` protected). **Part C** People "Days" tab (`people_daylog_stats` view: days together, first/last seen; scene timeline; facts; places + food together; milestones) + list-row count. **Part D** seeds (calendar, Spotify + media, Apple Health + weather — not transactions), photos to a private `daylog` bucket attached to scenes by timing (no vision), turn cap + monthly alert, one `open_thread` carry-over, memory-index embedding for `/api/ask`, weekly-review block, agent context diet (last 3 summaries). **Part E** linked users: `/api/people/[id]/link` (only a user sharing a team with the caller), `/api/journal/shared` — the linked user sees **scene basics only** (date, place, participants, scene narrative, shareable photos; never facts or day rows), `hidden_from_linked`/`shareable` toggles, cross-user isolation test. Cost ≈ £3–4/month if Talk every night, £1.50–2.50 realistic; Haiku fallback is one line in `lib/config/models.ts`. Claude Code prompt in spec §13; Part A stops for Phil's live check before Part B.
- **open (Phil)** — which of The Boys runs it (default Da Boi); default prompt time (21:30 assumed); initial slot list; initial score keys beyond the four defaults; whether Quick days count in `days_together` (assumed yes). Spec §10.
- **note** `[claude]` — interpretations to confirm (spec §2.1): "2, 3 and 4" on the floor question = three modes with buttons; "all of them" on question style = settings-driven slots + open-ended follow-ups, pure schema = Quick mode; "always ask" scores = the true floor, asked even on Skip.
- **note** `[claude]` — flags raised once, spec §11: review-for-everything makes "last seen" lag the queue (relief valve: auto-approve known-alias person links only); "extract everything" about others is safe on the shared surface only because facts are structurally excluded — keep `journal.daylog` ungranted; linking uses team membership as consent; Telegram journal-vs-capture ambiguity; no prototype before build (keep the rules block as a text file); persona must not store day facts in `agent_memory`; full catch-up after a skip is survivable only via the Quick/Skip buttons; scores are Health data on a Journal row — renaming a key must migrate values; journal replacement touches the dashboard card registry, memory index, weekly review, possibly the morning briefing — grep first.
- **idea** — Today-surface card ("3 weeks since you saw Alex") once the Days tab exists (explicitly not v1).
- **idea** `[claude]` — transactions/receipts as seeds once bank-sync lag is understood (Phil left them out of v1 for that reason).

## Security / RLS — P0-S (shipped 2026-09-06, `e49f520`, migration `0101_rls_everywhere.sql`)

- **done** — RLS everywhere (catalogue-driven: enable + restrictive `USING (false)` + service_role grant; schema-wide `REVOKE ALL` on tables/sequences/functions from anon+authenticated; default privileges revoked). Applied hosted — local == remote at 0101.
- **note** — the prompt's premise was wrong; 91/91 tables already had RLS on. Genuinely fixed: 39 no-policy tables, 8 permissive `app.user_id` tables, `authenticated` SELECT on all 92 relations, TRUNCATE everywhere.
- **note** — `FORCE ROW LEVEL SECURITY` deliberately not set (owner `postgres` runs migrations).
- **note** — the 8 permissive `app.user_id` policies left in place, neutralised by the backstop; `0103` drops them.
- **done (0111)** — the `authenticated` re-grant before the client swap.
- **committed** — verify in the dashboard Security Advisor and re-probe with the anon key now 0101 is applied (fold into cutover verification).
- **committed** `[claude]` — token hygiene after cutover: revoke `mycelium-cutover` (Supabase), the Vercel token, `cutover-admin` (Resend), the IONOS key (run-book 4.10); keep only `mycelium-prod` (sending-only). Record names/scopes/dates in `docs/tokens.md` (names only).

## Repo hygiene — working tree

- **committed** — clear the two untracked rehearsal files before 4.2 (see multi-user section).
- **committed** — confirm the corrected `MYCELIUM_ALL_PROMPTS.md` (09-07, 7 edits) was committed — check `git log -- MYCELIUM_ALL_PROMPTS.md`.
- **committed** — **decide `.claude/skills/`.** Symlinks pointing outside the repo replaced 15 tracked skill directories. Recommend `.gitignore`; counter-argument: a fresh clone/worktree loses them. Do not commit the symlinks.

## App — Loam & Glow v2 (source of truth: `MYCELIUM_ALL_PROMPTS.md` session log in repo)

P0, P0.5, P1, P1.5, P3, P4, P6, P11 done. Remaining:

- **committed** — P2 (Today surface): fired but never verified by use
- **committed** — P5 Part 2: optimistic set-logging; P5 Part 3: live-session focus mode
- **committed** — P7 Part 5: remaining finance work (AnalysisClient stays on raw fetch by decision)
- **committed** — P8 Part 4 remainder: Integrations / Capture / Data settings panels
- **committed** — P9 remainder: ~102 client files still on raw fetch; Parts 4 + 5 not run
- **committed** — P4 Part 5 real-handset check; P3 follow-ups (inspiration board restyle; Founder agent end-to-end)

## App — Bugs (queue items, don't gate new work)

- **committed** — Vision-scan regression on recipe add
- **committed** — Fitness rest-timer minimise state not persisting
- **committed** `[claude]` — **archiving a programme does nothing.** `today/route.ts` never joins `workout_programmes` and has no `archived_at` filter. (2026-09-06.)

## PTP import — Kirsty's training plan into Fitness/Health (record: `claude/ptp-import-prompt.md`)

Shipped to main 2026-09-06, migrations 0097–0100.

- **in-progress — shipped, awaiting Phil's live verification** — PTP Phase 1 programme, `nutrition_targets` (0098; **do NOT backdate `effective_from`**), guardrails (0099). Verification folded into cutover step 4.7: Today shows the PTP day, guardrails banner renders, MacroBar 2600/200. `nutrition_targets` in `health.nutrition`.
- **done** — pre-PTP programmes archived + phase rows hard-deleted; `docs/ptp-plan.md` + photos; 15 `exercise_baselines`; Daily Movement habit; week-3 review reminder (2026-09-28 09:00) + task.
- **committed** — `docs/ptp-report.md`.
- **committed (deferred)** — agent live context (`getFitnessContext()` / `getNutritionContext()`).
- **idea** — water tracking; phase-gate readiness UI; exercise-library dedup via `exercise_aliases`.

## Schema integrity `[claude]` — surfaced by the PTP work, 2026-09-06

- **committed — highest value item** — **CI step: replay migrations from zero into a scratch DB and boot the app.** The from-empty replay (now green as of `5eb84ee`) is a session-run check, not CI; the DB-backup item is unfalsifiable without it.
- **done (0101)** — `user_settings` RLS; `exercise_aliases` deny-all + service_role grant.
- **done (2026-09-11)** — `scripts/verify-ownership.ts` uuid-`user_id` false-positive fixed (`5eb84ee`).
- **committed** — correct `0032_workouts_library.sql`'s misleading header comment.
- **committed** `[claude]` — `exercise_pain_logs` cascades off `workout_sessions`; decide `SET NULL`.
- **committed** `[claude]` — `.select()` strings opaque to TypeScript; two live bugs. Lint rule or shared field-list constants.
- **idea** `[claude]` — `seed-mobility/route.ts` never writes `default_hold_seconds`; don't use migration pushes as a query channel.
- **done** — stale worktree registration pruned; stop-hook sound path corrected.
- **idea** — `graphify update` not on PATH; use `npx --no-install graphify update .`.

## PC Monitoring (source of truth: `docs/pc-monitoring-plan.md` in repo)

- **done** — M1 (+ startup secret guard); M2 (0094); M3 (0095, pg_cron — the `cron` schema is not in a public dump; the rollback doc re-schedules both jobs).
- **blocked — parked 2026-08-29** — M1.5 live bring-up. Runbook in `pc-agent/README.md`; only surviving `PC_METRICS_SECRET` is Vercel's env var. After P12 the agent's secret binds to Phil via `lib/system/bindings.ts`.
- **in-progress** — M4 temps/fans/power at the LHM sensor-dump checkpoint.
- **committed** — M5 site-configurable interval + offline joke card.
- **idea** — per-process top-talkers; Ubuntu VM agent; DOCP; pc-agent heartbeat once M1.5 lands.

## Receipts (docs/receipts-*.md)

- **committed** — exercise the flow end-to-end at runtime.
- **idea** — `parsing` in the reconcile guard; unit tests for `lib/receipts/reconcile.ts`; align masking with Spending's `<Money>` glyphs.

## Desk device (`claude/desk-device-concept.md`) — PARKED until PC monitoring ships

- **committed (parked)** — v1: Pi 5 + bar + cap, freshness/health, swipe cards.
- **blocked** — 5 open questions (push vs polling · DSI vs HDMI · footprint · power · read-only vs write-back); post-July decisions live only in old chats (recover via `claude/harvest-prompt.md`).
- **gated** — satellites + GIF mushrooms: nothing until v1 pipeline trustworthy.

## Worktrees (`claude/worktree-setup.md`)

- **in-progress** — `.worktreeinclude` covers env files only; `.claude/worktrees/` holds `receipts`. Still to do: `.claude/settings.json` baseRef, gitignore entry, redirect allowlist ports, pnpm decision. The `multi-user` branch owns `supabase/migrations/**` until cutover; the `tickets` branch owns it after.
- **committed** `[claude]` — decide how skills reach a worktree (tied to `.claude/skills/`).

## June-era items (confirmed by Phil, 2026-08-29)

- **committed** — Apple Health activation (`HEALTH_IMPORT_SECRET` + redeploy; after P12 the GET needs the secret too). Now also a Day-log seed source — activation gains a second consumer.
- **committed** — rotate `REMINDERS_CRON_SECRET`
- **committed** — Spending phase C: banks beyond Halifax/Revolut/AMEX/PayPal
- **committed** — DB backup system: nightly pg_dump off-site, 7d/4w/12m retention, restore test. **Do the migration-replay CI step first.** The cutover dump + staging restore are the first real restore evidence.
- **committed** — rigorous real-iPhone mobile pass once features stable; drafts comparison pass on `/draft/*`
- **idea** — live finances; investment purchase tracker; iOS Shortcut ⇄ Telegram parity (Quotes covers both channels — a first concrete step; Tickets capture is the second); `classifyCapture` intent expansion (Quotes adds `quote`, Tickets adds `ticket`); expert-agent builder; social media content studio; asset inventory; PC cleanup + file-organisation plans; food preferences data (the Day log's food/drink facts are the first real feed for this)

## Meta

- **done** — project instructions, backlog, context, harvest docs; spec docs from repo crawl (2026-08-29)
- **done (2026-09-14)** — project rule: every question to Phil is multiple choice via the widget, ≤4 per round, recommended option first (`claude/instructions.md` updated; field text needs re-pasting).
- **superseded by Tickets §14.5** — the "prompt for Phil's global Claude instructions so every project produces checklists this way" item: checklists are tickets now; the global-instructions paragraph, repo `CLAUDE.md` snippet and harvest addendum ship in Tickets Part H. The house-style requirements it listed (actor per step, exact where/what, answer boxes, state in the project's own DB, Claude reads answers from the store, links everywhere, tokens minted once and revoked, GO gates) are carried in tickets spec §9.2 and §14.5.
- **committed** — **recreate the weekly context+spec-drift task with a device binding** from the desktop app on the PC, then delete the unbound trigger; correct `claude/instructions.md`.
- **committed** `[claude]` — **Cowork's isolated Linux workspace has been down since a Windows update of 8 September** ("Claude Code is unaffected"): `device_bash` unavailable from Cowork; file stage/commit works; Claude Code on the PC is unaffected. State it up front in any Cowork session that needs a shell.
- **committed** `[claude]` — spec drift after cutover: `claude/spec-platform.md` needs an "Identity & access" section and a new `claude/spec-access.md` (teams/grants/audit/rundowns data model + routes), per plan §7.
- **done** — spec review round 1 (2026-08-29)
- **committed** — Phil's global Claude-settings rewrite (paste into claude.ai Settings → preferences) — now includes the Tickets paragraph (spec §14.5) once Part H ships.
- **committed** — harvest remaining old-chat context: desk-device post-July decisions; **plus a ticket harvest in every other Claude project** (DropShipAuto, Polysnipe, garden, board game, trips…) using the addendum in tickets spec §14.5, before those backlogs import.
- **idea** `[claude]` — after cutover, a `docs/tokens.md` (names only) recording which API tokens exist, their scope and revocation date, so the next run-book's step 0.4 starts from a known state. Tickets' `api_tokens` table (spec §14.4) makes most of this self-documenting.
