# Mycelium — Backlog

*Canonical backlog. Statuses: idea / committed / in-progress / blocked / done. `[claude]` = Claude-suggested. No fixed priority order. Done = builds + tests + Phil verified live ("built" = shipped, Phil's check outstanding). **Rewritten 2026-10-20 (Cowork, repo-verified):** the project copy had drifted to the 09-22 state while the repo reached 0148; done items are condensed to one line each — their build detail lives in the spec docs (`claude/spec-work.md` §11, `claude/tickets-spec.md`, `claude/daylog-spec.md` §12, `claude/people-contacts-spec.md`, `claude/tasks-merge-spec.md`), repo `docs/` and git history.*

## Work + Docs — Jira-style Work section (decisions `claude/work-redesign-spec.md`; build spec `claude/spec-work.md`)

- **built (2026-09-29/30, MYC-174, 0141–0148) — awaiting Phil's live check** — Parts A schema · B query object + JQL + `/api/work/*` · C Tiptap editor · D Work pages, redirects, Clarify + old Tasks surface removed · E notifications UI · F Docs · G as-built notes. 615 tests, isolation 0 leaks.
- **done 2026-10-29** `[claude]` — the three Work gaps: per-row delete on `/work/notifications` (`eac26b4`), sibling reorder in the Docs tree (`3163374`), `/work/workflows` status editing page (`64e90c9`). **open (Phil)** — a second-user browser pass.
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
- **done 2026-10-29** — the Anthropic account has credit again: the vision model answered directly and the production stream route streamed `pong` for the fitness agent (the two smoke messages were deleted from that conversation afterwards). **`ELEVENLABS_API_KEY` is not on Vercel** (`vercel env ls production`, 2026-10-29) — OpenAI voices work, ElevenLabs voices and cloning need Phil to add it.

## Ideas (decision record `claude/ideas-spec.md`, 21 decisions; W15: an idea graduates to a Work project when building starts)

- **committed — full spec** — own surface, stages, versioned brief, dumps + media, Mycelium MCP connector, "Where was I", nudges.
- **done 2026-10-29 (finding)** `[claude]` — claude.ai custom connectors accept both: OAuth (Claude's published client identity, Dynamic Client Registration, or your own client id/secret) **and** fixed **Request headers** (`authorization`, `x-api-key`, `x-auth-token`; the value is sent verbatim, so enter `Bearer mtk_…`), chosen as "No sign-in + Request headers". Request-header auth is **beta, limited to some organisations** — if the Add custom connector dialog shows no Request headers section, Phil's org does not have it yet and the connector needs OAuth. Auth settings cannot be edited after adding (remove and re-add). Source: claude.com/docs/connectors/custom. So: a scoped `mtk_` token works if the section is there; otherwise the Mycelium MCP server needs an OAuth authorization server. Phil to check the dialog once.
- **idea** — Ventures expansion spec (venture dashboard).

## Quotes (`claude/quotes-spec.md`)

- **built (2026-09-18, 0126)** — v1; production smoke 26/26. **Phil's live check** = half of `MYC-136` (mis-reads Done at 0/23 — drag it back). Not exercised live: a voice capture end to end, the Telegram read-back.
- **committed — v1.1** — merch images via Higgsfield; Telegram send to Phil's own chat.
- **idea** — `media_items` link as a quote source.

## Day log — Journal v2 (`claude/daylog-spec.md`)

- **built (2026-09-18 → 09-22, 0127–0133)** — Parts A–E complete per spec §12. Phil's live checks: `MYC-136` (A) → `MYC-140` (B) → `MYC-142` (C) → `MYC-144` (D) → `MYC-146` (E, needs a second account).
- **open (Phil)** — spec §10 defaults (agent, prompt time, slots, score keys, Quick days in `days_together`).
- **idea** — Today card "3 weeks since you saw Alex"; transactions as seeds.

## Health — Recipes / Gousto cookbook

- **built 2026-10-29** `[claude]` (Phil: "is there an API we can call and store all recipes? with the ability to favourite?") — yes: Gousto's unofficial `cmsreadbroker/v1/recipes` (listing, 12,162 entries) and `/recipe/<slug>` (detail). `gousto_recipes` (0151, 0152) holds the index per space; `/health/recipes/gousto` lists it (search, All/Favourites, cuisine, sort, paging, heart per card); `/health/recipes/gousto/<slug>` shows the cached detail (ingredients with pack images, method, allergens, per-portion nutrition), heart, SAVE TO MY RECIPES (copies into `recipes`, idempotent via `saved_recipe_id`, link back when the copy exists); nav entry + GOUSTO COOKBOOK link on Recipes. Commits `8e0effe` → `7569c45`. Smoke on prod: 11,977 recipe pages stored (12,162 entries; the rest are re-issues of the same page), `q=curry` 767 matches, detail/favourite/save/re-save/delete all exercised. **Full detail pull done 2026-10-29 evening from the PC: 11,929 with detail, 48 listed but no longer served by Gousto (404, stamped), 0 failures, 59 min at concurrency 3.**
- **The sync runs on the PC, not in the cloud** — `npm run gousto:sync` (`scripts/gousto-sync.mjs`, needs `API_SECRET` from `.env.local` in the env, `MYCELIUM_URL` optional). Gousto's edge answers a bare nginx 502 to every request from Vercel (US and `lhr1` alike) and sends no CORS headers, so neither the server nor the browser can fetch it; the script fetches from the PC and posts raw payloads to `/api/health/gousto/ingest` and `/api/health/gousto/<slug>/detail`, and the server only shapes and stores. Listing pages above ~50 entries (~1 MB) also 502, so the script pages at 50 (~6 min for the index). Flags: `--listing-only`, `--details-only`, `--details N`, `--stale-days N`, `--concurrency N`. Re-run any time; details are fetched only for rows that lack one (favourites and saved copies first), so it resumes.
- **done 2026-10-29** `[claude]` — category facet (0154/0155 `gousto_facets()`): a Category select beside Cuisine, counts server-side, Gousto's "Chicken" / "Chicken Recipes" pairs merged; details synced from now on store the short form. Shopping-list hand-off needs nothing: a saved copy is an ordinary recipe and enters the meal-plan → shopping-list flow.
- **done 2026-10-29** `[claude]` — scheduled on the PC: Task Scheduler task `Mycelium Gousto sync`, Sunday 03:00, catches up when the PC was off, 3 h limit, runs `scripts/gousto-sync-weekly.ps1` (reads `API_SECRET` from `.env.local` at run time, `--stale-days 30`, log at `%LOCALAPPDATA%\Mycelium\gousto-sync.log`). Registered and run once end to end from this terminal. Re-register after moving the repo: `powershell -ExecutionPolicy Bypass -File scripts\gousto-sync-weekly.ps1 -Register`; remove with `Unregister-ScheduledTask -TaskName "Mycelium Gousto sync"`.

## Fitness

- **done (2026-09-22)** — MYC-30 supersets (0134); MYC-31 rename on tap; MYC-41 project list order.
- **open (Phil)** — `MYC-33`: what "voice section in Brain" means.

## Multi-user / teams — P12 (live since 2026-09-15)

- **committed** — retire `USER_ID` / `DASHBOARD_PASSWORD` / `AUTH_SECRET` from Vercel after a final sign-in; then `verified_by` Phil.
- **open (Phil)** — decision 0.2: `platform` owner-only.
- **committed (Phil)** `[claude]` — token hygiene: revoke cutover tokens (run-book 4.10). `docs/tokens.md` exists (names only) — done.
- **done** `[claude]` — never rotate the legacy JWT secret: already recorded in `docs/multi-user-handoff.md` ("Never rotate or migrate the legacy JWT secret"), checked 2026-10-29.
- **done 2026-10-29** `[claude]` — `docs/onboarding.md`: inviting, joining (incl. re-opening the invite link after email confirm), first-run defaults, roles, sharing, security, export/leave/delete, and a what-went-wrong table.
- **done 2026-10-29** `[claude]` — `.env.example` already had the P12 names; the legacy auth-gate block and `USER_ID` are now marked retired.
- **half done 2026-10-29** — anon-key re-probe: the hosted REST API answers 401 `42501` for the anon key on people, tickets, user_settings, raw_captures, profiles, spaces, notifications, doc_pages (no grants, not merely RLS). Security Advisor review still to do in the dashboard.
- **idea** `[claude]` — `scripts/verify-identity.mjs` (generateLink → callback → Playwright).

## Security / schema integrity

- **done (found 2026-10-29: already in `.github/workflows/ci.yml`)** — CI replays the whole migration chain from empty plus `seed.sql` by booting the local stack, runs `npm test` against it, then a cold `next build` and an `/api/health` boot smoke. The backlog had carried it as open.
- **built 2026-10-29, needs one value from Phil** `[claude]` — nightly backup on the PC: `scripts/db-backup.ps1` (native PostgreSQL 18 `pg_dump`, no Docker) writes `schema.sql` (public + app), `data.dump` (public + auth + storage metadata, custom format) and a `pg_restore --list` manifest into `A:\Backups\mycelium
ightly\<date>\`, keeps 7 daily / 4 Sunday / 12 first-of-month, logs to `%LOCALAPPDATA%\Mycelium\db-backup.log`. Task Scheduler `Mycelium DB backup` registered, daily 02:30, catches up when missed. **Blocked on:** `SUPABASE_DB_URL` (session-pooler URL with the database password, dashboard → Project Settings → Database; reset the password if unknown) in `.env.local` — every run until then logs `SUPABASE_DB_URL is not set` and exits 1. No password exists on this PC: the CLI mints a temporary login role through the Management API for its own `db dump`, and that path needs Docker. Still open: off-site copy (sync the `nightly` folder somewhere) and a restore test against the local stack once Docker is up.
- **done 2026-10-29** `[claude]` — `0032_workouts_library.sql` header corrected (the cut-over to `workouts` never happened; `workout_programme_exercises` is the live programme table). `exercise_pain_logs`: **SET NULL** (0153) — pain is a health record, a session is bookkeeping; deleting a session now leaves its logs as standalone entries. **committed** — `.select()` lint rule or shared field lists.
- **done 2026-10-29 (`41c5035`)** `[claude]` — **auth gate hole closed**: `/api/health` (the deploy smoke check) sat in `PUBLIC_PREFIXES`, matched by `startsWith`, so every `/api/health/*` route (the whole health module: recipes, blood tests, prescriptions, nutrition…) skipped the gate. Browsers still worked because the user client falls back to session cookies (RLS held), but `x-api-secret` was never honoured there and unauthenticated calls got 500s from the anon role rather than 401. Now `PUBLIC_EXACT = ["/api/health"]`; `/api/health/gousto` answers 401 without auth. Found by the Gousto ingest ("permission denied for table").
- **done 2026-10-29** `[claude]` — `seed-mobility` now writes `default_hold_seconds` (`0ccb99e`). graphify is set up (`.graphify/`, `npx graphify update .` after code changes).

## PTP import (`claude/ptp-import-prompt.md`)

- **open (Phil)** — the 09-15 cutover recorded PTP Today verified live, but the item was never closed; week-3 review reminder fired 09-28, outcome unrecorded. Confirm and close.
- **done 2026-10-29** `[claude]` — agent live context: `lib/agents/live-context.ts` appends a five-line block to the fitness agent (programme + week of phase, today's plan, last 7 days' sessions, pain last 14 days) and the nutritionist (targets with review date, today's intake, 7-day average, gut last 7 days, recipe library) on every fresh turn; read-only, never written to memory; smoke-built against prod. `docs/ptp-report.md` written 2026-10-29 (the decision record had pointed at it since 09-06).
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
- **done 2026-10-29** `[claude]` — spec debt paid: new `claude/spec-access.md` (identity & access as built, incl. the gate fix); `spec-platform.md` auth section points at it and the agents paragraph describes the prompt builder + live context; `spec-fitness.md` (supersets, rename-on-tap, archive filter fixed, 0153, rest timer, live context, state re-read); `spec-health.md` (Gousto cookbook, extractor guards, pain note, nutritionist live context); `spec-studio-drops-ventures.md` (Day log built, reminders → tickets); `spec-organisation.md` (Tasks/Tickets → `/work`); `spec-index.md` rows + migration chain at 0155. Same evening: `spec-platform.md` capture (classifier kinds, typed capture + learning, review), inbound webhooks, the cron table as of today, and a Work notifications section — the platform spec debt is cleared.
- **committed** — Phil's global Claude-settings rewrite incl. the Tickets/Work paragraph.
- **committed** — harvest old-chat context (desk device) and a ticket harvest in every other Claude project before those backlogs import into Work.
- **note** — Cowork's isolated Linux workspace was reported down since 8 Sept; on 2026-10-20 `device_bash` worked from Cowork against `A:\Projects\Mycelium`.
