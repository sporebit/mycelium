# Mycelium — Context Snapshot

*Rolling context document. Rebuilt weekly (Sunday evening) by the scheduled run; updated by sessions when state changes. Sessions read this + `claude/backlog.md` first. Last rebuilt: **2026-09-13 by the weekly scheduled run — docs-only**: the run is cloud-only (no device binding), so the PC/repo was unreachable. Repo state below is from the 09-11 PC read, **re-verified against `origin` on 2026-09-15 by a cloud Claude Code session** (see Since last run): `main` had not moved since 09-07; `multi-user` is as described.*

## Repo state — STALE, as of 2026-09-11 (PC unreachable by the 09-13 run)

Repo at `A:\Projects\Mycelium`. Branch **`multi-user`**, twelve commits ahead of `main`: latest + `5eb84ee` (verify-ownership.ts fix) and `184207e` (rollback-doc corrections + handoff). Both on `origin/multi-user`. Migration chain ends at **`0115`**; live (hosted) is at **`0101`**; `main` has **not** moved, so no renumbering is due. **Working tree dirty** with two untracked items left by the rehearsal: `docs/mycelium-cutover (1).html` (Phil's download of the standalone run-book) and a `Claude outputs/` folder. Both must be moved out or gitignored before Part 7 step 4.2 (its `git status` gate needs a clean tree). The standalone HTML must **not** be committed into the repo.

**Tooling note (recurring):** Cowork's isolated Linux workspace has been down since the Windows update of 8 Sept, so `device_bash` is unavailable from Cowork; Claude Code on the PC is unaffected. Separately, the **weekly scheduled task itself has no device binding** — its runs execute in the cloud with no PC access at all (this run, and the 08-30 run before it). The committed backlog fix — recreate the task device-bound from the desktop app on the PC — is still not done, and until it is, every weekly run degrades to docs-only.

## State by stream

**Multi-user / teams (P12) — Parts 0–6 built and verified; Part 7 (cutover) is the only thing left, and its token-free half is rehearsed.** Source of truth: repo `docs/multi-user-handoff.md`; Phil's items: `docs/multi-user-phil-checklist.md`; rollback: `docs/multi-user-rollback.md`.
- Migrations: Part 1 `0102` (identity, fixed uid `f218ed69-6cbf-49ea-908a-8826f2f1178a`), Part 2 `0103`–`0109`, Part 3 `0110`–`0111`, Part 4 `0112`, Part 5 `0113`–`0114`, Part 6 `0115`.
- **VERIFY 2 half 2 DONE (2026-09-11).** Live dump restored into the local stack (schema held aside → restore → repair history to 0101 → `migration up` 0102–0115 — the same sequence a rollback uses, so Phase 2 doubled as a rollback rehearsal), then the ownership verifier: **0 failures over 85 tables, all row counts preserved, no unmappable `user_id`.** The only non-`phil` `user_id` was the empty `user_settings` `'default'` placeholder, removed cleanly by `0104` — **decision 0.1 ("fine") has no data risk; confirmed.**
- **Verifier bug fixed on the branch (`5eb84ee`).** `scripts/verify-ownership.ts` assumed any column named `user_id` was the legacy text-ownership column; Parts 4–6 access tables (e.g. `audit_events`) correctly use a `uuid` FK named `user_id`, false-flagged six times. Now keys on column type. The from-empty replay and VERIFY 2 are genuinely green only as of this commit.
- **Regression gate rehearsed READY (real cutover re-runs it):** `npm test` 156/156; `npm run isolation-test` 0 leaks, 0 mismatches over 152 endpoints (only 5xx are Google-sync and Spotify routes lacking local OAuth creds — ENV, not a regression); clean `next build`; `supabase db push --dry-run` lists exactly the fourteen files 0102–0115. Live `auth.users` is **empty**, so Part 7 step 4.3's precondition holds.
- **Vercel plan is Pro** (resolved), so the hourly rundowns cron in `vercel.json` stays; step 1.8 needs no change. (Team `sporebit-s-projects`, project `mycelium`, preview `https://mycelium-git-multi-user-sporebit-s-projects.vercel.app`.)
- **Run-book: the "Mycelium Cutover" artifact, v3.1 (2026-09-11), 34 steps, executed by Claude Code.** Execution model (Phil's decision): Claude Code runs every step with an API or CLI (Supabase Management API `config/auth` + `database/query`, Resend API, IONOS DNS API, Vercel CLI, `auth.admin.generateLink` + Playwright), tokens minted once in step 0.4 (`Read-Host -MaskInput`) and revoked in 4.10. Phil keeps: the four decisions, the Google OAuth client (console only), one Preview-only staging JWT value, the test-mailbox invite acceptance, phone TOTP + the Google click, and the **GO gate at 4.4** — the only instruction that changes the live schema. **State lives in the artifact store, document `checklists/multi-user-cutover`** (definition_version 3); Phase 2's reported values and ticks are written into it.
- Dump completeness is judged by **row-count parity**, not file-size ratio (2.7 MB data dump vs 23 MB `pg_database_size` is complete — 91 tables, ~4,970 rows, matching live row for row). Page v3.1 + rollback doc both carry this.
- Rollback-doc corrections pushed (`184207e`): schema dump carries no `supabase_migrations` history (restore always needs the repair step); the data dump's `auth`/`storage` COPY blocks fail across GoTrue versions (restore public rows only; auth users recreated by the fixed-uid insert / re-invite); Session-pooler + Git-Bash notes.
- Decisions the build took: (a) `user_settings` placeholder — `0104` (confirmed safe); (b) `platform` owner-only like finance because `user_settings` holds OAuth tokens — **still Phil's to affirm (0.2), no data behind it.**
- Note for 1.1: a Google OAuth client **already exists** (`GOOGLE_CLIENT_ID` on Vercel, Calendar integration). Run-book recommends a separate sign-in client; reusing also works.

**Checklists feature** — every guide/test/tick-box exercise stored in Mycelium's own DB as done/not-done per step plus typed answers; later steps and Claude read answers from the DB. Spec: `claude/checklists-spec.md`. Build after cutover (migration numbered after 0115). Spec must absorb the v3 conventions: an `actor` per step (Claude Code / You / Gate), the prompt as primary action, manual procedure as collapsible fallback, an "after it reports" line, and Claude/Cowork writing reported values straight into the run's `state`.

**Security / RLS (P0-S)** — shipped `0101`; the `authenticated` re-grant is done in `0111`. Unchanged.

**PTP import** — shipped (0097–0100); **still not verified by Phil on the deployed site**; folded into cutover step 4.7. Week-3 review reminder due 2026-09-28 09:00.

**Schema integrity** — the migration-replay CI step is still the highest-value item; the from-empty replay is a session-run check, not CI. The verifier fix (`5eb84ee`) is a real correction to that check.

**Loam & Glow v2** — Done: P0, P0.5, P1, P1.5, P3, P4, P6, P11. Remaining: P2 verify-by-use, P5 parts 2+3, P7 part 5, P8 part 4 panels, P9 stragglers/measure, P3/P4 follow-ups.

**Bugs** — Vision-scan regression (recipe add); rest-timer minimise persistence; archiving a programme does nothing (`today/route.ts` never filters `archived_at`).

**PC monitoring** — M1–M3 done, M4 at the LHM sensor-dump checkpoint, M5 pending. M1.5 parked 2026-08-29.

**Receipts** — shipped; flow never exercised at runtime.

**Desk device** — parked until pcmon ships.

**Worktrees** — partial; `.worktreeinclude` covers env files only. The multi-user branch owns `supabase/migrations/**` until cutover.

## Open decisions & questions

1. **Cutover route:** staging rehearsal (recommended) or straight to cutover. Phil picks via the toggle; the page adapts.
2. **Vercel plan** — RESOLVED: Pro, hourly cron stays.
3. **`user_settings` placeholder** — RESOLVED by evidence; Phil to tick 0.1. **`platform` owner-only (0.2)** — still open, no data behind it.
4. **Phil to verify the PTP live** — cutover 4.7.
5. **Checklists feature build order** — first Part after cutover; spec to absorb the v3 conventions.
6. `.claude/skills/` — commit symlinks, gitignore, or restore (recommend gitignore). Plus: the two untracked rehearsal files must be cleared before 4.2.
7. **Recreate the weekly scheduled task with a device binding** from the desktop app on the PC — still outstanding; the 09-13 run again had no repo access because of it.
8. Migration-replay CI step — before the DB backup work.
9. `exercise_pain_logs` SET NULL vs cascade.
10. M4: review the B550-F sensor dump before fan/temp columns + UI.
11. Desk device ×5.
12. pnpm vs npm for worktrees; separate pcmon Supabase project (likely moot).
13. Secrets hygiene: rotate `REMINDERS_CRON_SECRET`; set `HEALTH_IMPORT_SECRET`; `PC_METRICS_SECRET` parked. Plus post-cutover token revocation (run-book 4.10).
14. Apple sign-in (plan §8 C) — deferred.
15. Onboarding how-to for new users (plan §7) after cutover.
16. Global-instructions prompt for checklists — after Phil has used the page end to end.

## Since last run

**2026-09-17 (Claude Code on the PC — Tickets Part B increments 3–7 shipped to `main`, hosted DB at 0117):** picked up an uncommitted increment 3 left by the 09-16 session, fixed three schema mismatches in it (`ticket_links.at` not `created_at`; link kind `evidence` is not in the 0116 check — kinds are now auto-classified from the URL; the `TASK_SELECT` `+`-concatenation lost its literal type so every Supabase row typed as `GenericStringError`), then shipped: `e2fc833` §11 API core + `0117_tickets_status_sync.sql` (status_id ↔ legacy status trigger, Inbox default, workflow seed per space) — applied with `supabase db push`, local = remote = 0117; `05beb40`+`f569085` Now view (Where/Tool/Energy chips, device auto-detect, sticky Where in `ui_prefs.tickets`) + category-native GTD tabs + counts + sidebar entry (`05beb40` alone was a deletion-only commit from a failed `git add` pathspec and produced one red Vercel build, superseded within minutes); `aee30d3` Clarify stack + `/api/tickets/clarify` with capture-suggestion-over-heuristic; `0611e0f` the ticket page rewritten onto the new routes (category moves, contexts, dates, sub-tasks, links, Verified live, cancel/reopen); `642ef6d` `/api/tickets/bulk`. **Production API smoke passed end to end** via the alias `https://mycelium.sporebit.com` with `x-api-secret` (the local `API_SECRET` matches Vercel's). Data reality after 0117's re-derivation: 65 open tickets in `backlog`, 2 in `verify`, none in `next`/`doing`/`inbox` — the Now view is empty until "+ backlog" is on or tickets are clarified/moved; Telegram captures now land in Inbox. Phil's first live check surfaced two production bugs, fixed the same night: PostgREST rejects unfiltered UPDATEs, which broke every `user_settings` writer (`2a00bd4`, shared `updateUserSettings()` helper); and `TELEGRAM_USER_ID` was missing from Vercel Production (present only in Development), so the webhook 401'd — re-added via `vercel env add`. **Part B gate passed** (Phil clarified Inbox items on the phone, same night). **Part C then shipped in three pushes, hosted DB now 0118:** `ad0b9f5` Today NowBlock + dashboard Now card on the shared Now query, sticky Energy, ⌘K ticket search; `c95ccf5` + `0118_tickets_habits_fold.sql` habits folded into series tickets MYC-97…108 with completions imported and the per-habit count gate passing 33/33 (the daily-log JSON is dual-written until its seven remaining readers are re-pointed); `9487710` bulk selection on the GTD tabs and Backlog triage on the Inbox tab (63 queued). Next in spec order: Part D (steps/checklists port, templates). Docs: `claude/backlog.md` Tickets item carries the per-increment detail. No context.md entry was written for the 09-16 session (increments 1–2); the backlog item covers it.

**2026-09-15 (cutover executed live, direct route):** P12 shipped to production. `main` fast-forwarded to the merged branch and `supabase db push` applied 0102–0115 to the hosted project. Two forward fixes: 0104/0111 recreated `search_memory_chunks` with a bare pgvector `<=>` unresolved under the hosted push search_path, fixed as `OPERATOR(extensions.<=>)` (`839f43f`); and the Telegram webhook failed with `No suitable key or wrong key type` because the hosted project uses **asymmetric JWT Signing Keys** and `SUPABASE_JWT_SECRET` held the wrong value — re-pasting the Legacy JWT Secret fixed it. App verified live (sign-in + TOTP, sections, PTP, capture, cron). **Hosted is now at 0115**; the 0101 figures elsewhere in this doc are superseded. Remaining: retire the legacy auth env vars (`USER_ID`/`DASHBOARD_PASSWORD`/`AUTH_SECRET`).

**2026-09-15 (Claude Code, cloud session — live repo read):** Phil uploaded all 21 project docs; they are now committed in the repo at `claude/` (with a README on which copy is edited). Repo verified: `main` at `b9892d1` (7 Sept), chain 0101; `multi-user` at `184207e`, 12 ahead / 0 behind. `multi-user` merged into `main` cleanly and pushed as branch **`cutover`**; build green on the merged tree; unit tests that need the local stack could not run in the container. Decisions: cutover route **direct**; Phil does the DB/auth work himself; `main` is not touched until he runs 4.3 and the env vars, then `git push origin cutover:main` + `supabase db push`. Found: CI will go red on `main` after the merge (no stack for the P12 tests); `.env.example` lacks the P12 env names; `.claude/skills` on `main` are real directories; the 09-07 prompts-file correction is committed (`81d058e`); no `.graphify/` anywhere.

**2026-09-13 (weekly scheduled run, cloud-only):** PC unreachable — the task still has no device binding (open item 7), so this was a docs-only rebuild; all repo facts above are stale as of 2026-09-11. No interactive sessions recorded in the docs since 09-11, so stream state is unchanged. Spec drift pass ran against doc-recorded repo facts only: **`claude/spec-index.md` corrected** — it still described pre-0101 reality ("~30 tables have no RLS, fix scheduled as `0097_rls_everywhere.sql`", "96 migrations", multi-user "not yet built"); now records RLS shipped as `0101`, PTP as 0097–0100, main/hosted at 0101, branch 0102–0115, Vercel Pro, and lists `claude/checklists-spec.md`. Per-domain spec docs NOT diffed (needs the repo). No backlog changes — no new repo evidence.

**2026-09-11 (Claude Code on the PC, then Cowork):** Claude Code ran every cutover step needing no minted token. **Phase 2 complete on real data** — dump at `A:\Backups\mycelium\2026-09-11` (2.7 MB, 91 tables, ~4,970 rows, receipts images via the Storage API), VERIFY 2 half 2 = 0 failures / no unmappable `user_id`. Fixed the ownership verifier (`5eb84ee`), corrected the rollback doc (`184207e`), rehearsed the **regression gate READY** (156 tests, 0 leaks, clean build, dry-run 14 files), confirmed **Vercel Pro** and **live `auth.users` empty**. Fixed a Windows port-reservation block on the local stack (WinNAT restart). Left two untracked files that must be cleared before 4.2. Cowork wrote the reported values and Phase-2/1.8 ticks into the artifact store (`checklists/multi-user-cutover`), fixed the page's completeness heuristic to row-parity (v3.1), added the existing-Google-client note (1.1) and the untracked-files precondition (4.1). Phil's remaining work: decisions 0.1 (tick)/0.2, the Google client (1.1), then the token-driven Phase 1/3 and Phase 4 with the GO gate.

**2026-09-11 (interactive, earlier):** Re-cut the artifact as v3 (Claude Code executes; tokens; GO gate). Verified the Management API, Resend, IONOS and Vercel CLI shapes.

**2026-09-11 (interactive, earliest):** Reconciled Parts 0–6 done; stress-tested the run-book; published v1/v2; wrote `claude/checklists-spec.md`.

**2026-09-07 (interactive):** Reconciled the P0-S hotfix; corrected `MYCELIUM_ALL_PROMPTS.md` in place; spotted the `authenticated` re-grant (since done in 0111). No git.

**2026-09-06:** P0-S shipped as 0101; P10 superseded by P12; `claude/multi-user-plan.md` written. PTP import shipped (0097–0100).

**2026-09-01 / 2026-08-30 (scheduled):** fortnightly digest (nothing stalled); weekly run could not reach the PC (no device binding).
