# Mycelium — Backlog

*Canonical backlog. Statuses: idea / committed / in-progress / blocked / done. `[claude]` = Claude-suggested. No fixed priority order. Done = builds + tests + Phil verified live ("built" = shipped, Phil's check outstanding). **Rewritten 2026-10-20 (Cowork, repo-verified):** the project copy had drifted to the 09-22 state while the repo reached 0148; done items are condensed to one line each — their build detail lives in the spec docs (`claude/spec-work.md` §11, `claude/tickets-spec.md`, `claude/daylog-spec.md` §12, `claude/people-contacts-spec.md`, `claude/tasks-merge-spec.md`), repo `docs/` and git history.*

## Work + Docs — Jira-style Work section (decisions `claude/work-redesign-spec.md`; build spec `claude/spec-work.md`)

- **built (2026-09-29/30, MYC-174, 0141–0148) — awaiting Phil's live check** — Parts A schema · B query object + JQL + `/api/work/*` · C Tiptap editor · D Work pages, redirects, Clarify + old Tasks surface removed · E notifications UI · F Docs · G as-built notes. 615 tests, isolation 0 leaks.
- **committed** `[claude]` — Work gaps left by the build: per-row delete on `/work/notifications`; sibling reorder in the Docs tree; a space-level workflow/status editing page (routes exist); a second-user browser pass.
- **committed (last part of v1, after the MCP connector)** — W10: move `claude/*.md` into Docs; Claude sessions and the weekly run read/write them via the API.
- **committed — later stream** — W14 Habits out of Tickets: own tables; migrate `ticket_completions` history; re-point tile, heatmap, briefing and streak code.
- **v1.1 (decided, not scheduled)** — work logging + estimates; JQL functions (`currentUser()`, `startOfWeek()`).
- **open (Phil)** — old live-check tickets that exercise surfaces Work replaced: `MYC-111` (18/29), `MYC-159` (§18) — run, re-scope or close.
- **done** — Tasks+Tickets merge (MYC-163, 0139; Part 2 never built — superseded). §18 statuses + When (MYC-158, 0137, live 09-23; mapped into Work's categories). When rules (`6cd2173`). Re-key on first project + MYC clean-up (MYC-150, 0135). Tickets Parts A–H, partition, keys, sprints, policy fix, reminders drop, CI boot check (0116–0125, 09-16 → 09-18).

## People

- **shipped 2026-10-20 (`1b525f1`, 0149), awaiting Phil's live check** — **People review: reject / archive / ignore list** (`claude/people-review-spec.md`): no path auto-creates a person (tickets + capture-review reroute defer to the review queue); reject = bin + ignore words; archive = hidden + not matched; ignore list fed to the classifier; bulk Keep / Archive / Reject with the source snippet. Then Phil clears the 62 live.
- **note** `[claude]` — flag recorded once: ticket names going to review keeps the regex as a noise source; fallback = tickets link existing people only.
- **built (2026-09-25, MYC-165, 0140)** — People contacts: tier, soft delete + 30-day bin, merge (FK walk), phones/emails, vCard import (resumable) / export; guide ticket for the iCloud round trip. Phil's live check outstanding.
- **done** — People search box (MYC-155); capture review kind `person` (MYC-154).

## Capture

- **built (2026-09-25, MYC-161/160, 0138)** — typed capture form + entity form registry; capture learning (corrections as few-shot examples); Add another.
- **done (2026-09-23)** — MYC-151 delete a decision; MYC-152 edit media in place; MYC-153 review kind ticket; MYC-156 `idea` capture kind + `/organisation/ideas`; APPROVE materialises ticket/person kinds.

## The Boys — agents

- **built (2026-09-23, MYC-148/149, 0136)** — per-agent voice + manner (ElevenLabs incl. clone, or OpenAI); streamed SSE replies with sentence-pipelined TTS; transcription-only route. Production smoke 11/13 — the stream route hit **Anthropic "no credit"**.
- **done 2026-10-29** — the Anthropic account has credit again: the vision model answered directly and the production stream route streamed `pong` for the fitness agent (the two smoke messages were deleted from that conversation afterwards). ElevenLabs key on Vercel still unconfirmed.

## Ideas (decision record `claude/ideas-spec.md`, 21 decisions; W15: an idea graduates to a Work project when building starts)

- **committed — full spec** — own surface, stages, versioned brief, dumps + media, Mycelium MCP connector, "Where was I", nudges.
- **committed** `[claude]` — verify which auth claude.ai custom connectors accept (scoped `mtk_` bearer vs OAuth). Gates the connector and W10.
- **idea** — Ventures expansion spec (venture dashboard).

## Quotes (`claude/quotes-spec.md`)

- **built (2026-09-18, 0126)** — v1; production smoke 26/26. **Phil's live check** = half of `MYC-136` (mis-reads Done at 0/23 — drag it back). Not exercised live: a voice capture end to end, the Telegram read-back.
- **committed — v1.1** — merch images via Higgsfield; Telegram send to Phil's own chat.
- **idea** — `media_items` link as a quote source.

## Day log — Journal v2 (`claude/daylog-spec.md`)

- **built (2026-09-18 → 09-22, 0127–0133)** — Parts A–E complete per spec §12. Phil's live checks: `MYC-136` (A) → `MYC-140` (B) → `MYC-142` (C) → `MYC-144` (D) → `MYC-146` (E, needs a second account).
- **open (Phil)** — spec §10 defaults (agent, prompt time, slots, score keys, Quick days in `days_together`).
- **idea** — Today card "3 weeks since you saw Alex"; transactions as seeds.

## Fitness

- **done (2026-09-22)** — MYC-30 supersets (0134); MYC-31 rename on tap; MYC-41 project list order.
- **open (Phil)** — `MYC-33`: what "voice section in Brain" means.

## Multi-user / teams — P12 (live since 2026-09-15)

- **committed** — retire `USER_ID` / `DASHBOARD_PASSWORD` / `AUTH_SECRET` from Vercel after a final sign-in; then `verified_by` Phil.
- **open (Phil)** — decision 0.2: `platform` owner-only.
- **committed** `[claude]` — token hygiene: revoke cutover tokens (run-book 4.10); `docs/tokens.md` names only.
- **committed** `[claude]` — never rotate the legacy JWT secret (`withUser()` mints HS256 with it); record in `docs/multi-user-handoff.md`.
- **committed** — onboarding how-to for new users (invitee re-opens the invite link after email confirm).
- **done 2026-10-29** `[claude]` — `.env.example` already had the P12 names; the legacy auth-gate block and `USER_ID` are now marked retired.
- **half done 2026-10-29** — anon-key re-probe: the hosted REST API answers 401 `42501` for the anon key on people, tickets, user_settings, raw_captures, profiles, spaces, notifications, doc_pages (no grants, not merely RLS). Security Advisor review still to do in the dashboard.
- **idea** `[claude]` — `scripts/verify-identity.mjs` (generateLink → callback → Playwright).

## Security / schema integrity

- **done (found 2026-10-29: already in `.github/workflows/ci.yml`)** — CI replays the whole migration chain from empty plus `seed.sql` by booting the local stack, runs `npm test` against it, then a cold `next build` and an `/api/health` boot smoke. The backlog had carried it as open.
- **committed — next after the replay** — DB backup system: nightly pg_dump off-site, 7d/4w/12m, restore test.
- **committed** — correct `0032_workouts_library.sql` header comment; decide `exercise_pain_logs` SET NULL vs cascade; `.select()` lint rule or shared field lists.
- **done 2026-10-29** `[claude]` — `seed-mobility` now writes `default_hold_seconds` (`0ccb99e`). graphify is set up (`.graphify/`, `npx graphify update .` after code changes).

## PTP import (`claude/ptp-import-prompt.md`)

- **open (Phil)** — the 09-15 cutover recorded PTP Today verified live, but the item was never closed; week-3 review reminder fired 09-28, outcome unrecorded. Confirm and close.
- **committed** — `docs/ptp-report.md`; agent live context (`getFitnessContext()` / `getNutritionContext()`, deferred).
- **idea** — water tracking; phase-gate readiness UI; exercise-library dedup.

## App — Loam & Glow v2 (`MYCELIUM_ALL_PROMPTS.md`)

- **committed** — P2 verify by use; P5 parts 2+3; P7 part 5; P8 part 4 panels; P9 remaining raw-fetch files; P4 part 5 real-handset check; P3 follow-ups.

## App — Bugs (queue items, don't gate new work)

- **built 2026-10-29** — Vision-scan regression on recipe add: the route and model work now (`claude-sonnet-4-5`, live parse 200), so the regression was the September no-credit 502. Found while checking: a 1 px image came back as a complete invented Gousto recipe — the prompt now asks the model to answer `{"no_recipe": true}` when the image holds no recipe and the route turns that into a 422 (`7bed43a`).
- **built 2026-10-29** — rest-timer minimise state: the choice is kept in localStorage (`mycelium.fitness.rest.minimised`) and no longer resets on every new rest; expand to undo.
- **built 2026-10-29** `[claude]` — archiving a programme does nothing: every active-phase lookup (Today, swap, week summary, calendar, voice route, dashboard headline) now goes through `lib/fitness/active-phase.ts`, which joins the programme and drops archived ones.
- **built 2026-10-29 (`af385b0`, 0150)** — Google token refresh 400: the failure is recorded in `user_settings.google_sync_error`, Settings → Integrations shows "Reconnect needed" with the reason and a RECONNECT link, and a sync answers with the reason. **Phil still has to reconnect** (token expired 2026-06-24). Calendar sync (W16) unproven until then.

## PC Monitoring (`docs/pc-monitoring-plan.md`)

- **in-progress** — M4 temps/fans/power at the LHM sensor-dump checkpoint. **committed** — M5. **blocked (parked 08-29)** — M1.5 live bring-up. **idea** — top-talkers, Ubuntu VM agent, heartbeat.

## Receipts / Desk device / Worktrees

- **committed** — exercise the receipts flow end to end at runtime. **idea** — reconcile tests, masking alignment.
- **parked** — desk device until pcmon ships; satellites/GIF gated on a trustworthy v1 pipeline.
- **in-progress** — worktrees: `.claude/settings.json` baseRef, gitignore, ports, pnpm; decide how skills reach a worktree (tied to `.claude/skills/`, which currently has uncommitted local edits on the PC).

## June-era items

- **committed** — Apple Health activation (`HEALTH_IMPORT_SECRET`); rotate `REMINDERS_CRON_SECRET`; Spending phase C banks; real-iPhone mobile pass; drafts comparison pass.
- **idea** — live finances; investment tracker; Shortcut ⇄ Telegram parity; expert-agent builder; social content studio; asset inventory; PC cleanup plan; food preferences data.

## Meta

- **committed** — **recreate the weekly scheduled task with a device binding** from the desktop app on the PC; delete the unbound one; correct `claude/instructions.md`. Seven docs-only runs missed eight days of shipped work.
- **done 2026-10-29** `[claude]` — the rule is in repo `AGENTS.md` ("Project docs"): repo sessions update both copies, or say in the report that they could not. The project-side copies still need the 10-29 changes synced by a Cowork session.
- **committed** `[claude]` — spec debt: `spec-platform.md` Identity & access + capture/agents/notifications; new `spec-access.md`; `spec-studio-drops-ventures.md` journal → Day log; `spec-fitness.md` supersets; `spec-organisation.md` Tasks/Projects → Work.
- **committed** — Phil's global Claude-settings rewrite incl. the Tickets/Work paragraph.
- **committed** — harvest old-chat context (desk device) and a ticket harvest in every other Claude project before those backlogs import into Work.
- **note** — Cowork's isolated Linux workspace was reported down since 8 Sept; on 2026-10-20 `device_bash` worked from Cowork against `A:\Projects\Mycelium`.
