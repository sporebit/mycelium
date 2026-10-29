# Mycelium — Context Snapshot

*Rolling context document. Rebuilt weekly (Sunday evening) by the scheduled run; updated by sessions when state changes. Sessions read this + `claude/backlog.md` first. **Rebuilt 2026-10-20 by a Cowork session with PC access — repo-verified.** This ends the run of seven docs-only weekly rebuilds (08-30 → 10-18), which had frozen the repo picture at 2026-09-22 while the repo moved on to 0148.*

## Drift corrected on 2026-10-20

The project docs said: repo at 0134, Tasks+Tickets merge unverified (W17), 0137 paused/do-not-build, Work redesign stalled waiting for a spec. **The repo says:** between 09-22 and 09-30 Claude Code shipped 0135–0148 — re-key (0135), agent voices (0136), **0137 itself (live since 09-23)**, typed capture + learning (0138), the merge (0139, Part 2 never built), People contacts (0140), and the **whole Work redesign v1 (0141–0148, Parts A–G)**. Those sessions updated the repo's `claude/context.md` and spec docs but not the Claude project, and the cloud-only weekly run could not see the repo. Lesson: **a repo session that changes state must write the project docs too** (Projects tool), not only the repo copies.

## Repo state — verified 2026-10-20

`A:\Projects\Mycelium`, `main` = production (Vercel auto-deploy). Last commit `0ccb99e` (2026-10-29). **Migrations through 0150 (`google_sync_error`), local and hosted identical.** 2026-10-29 session (Claude Code, Phil "go ahead, I'll test later"): MYC-174 UI leftovers (`/work/workflows`, notification delete, Docs reorder), programme-archive bug, rest-timer minimise, MYC-147 reconnect, recipe-parser no-recipe guard, seed-mobility hold seconds; Anthropic credit confirmed back; anon key probed 401 on eight tables. Details in `claude/backlog.md`. No commits 10-01 → 10-19. Latest hosted dump `A:\Backups\mycelium\2026-09-29` (before 0141). Working tree carries unrelated local edits under `.claude/` (skills, settings) — uncommitted.

**Possibly still running:** Docker Desktop + the local Supabase stack, used by every build session.

## State by stream

**Work + Docs (MYC-174) — v1 built, awaiting Phil's live check.** `/work` (Your work, issue navigator with filter bar + JQL + saved filters, projects by category, overview / board / backlog with sprints + burndown / settings, issue page), Tiptap editor with @person and #ticket chips, notifications (bell, inbox, Settings channel × event grid, quiet hours, web push), Docs at `/docs/*` (spaces, page tree, versions + diff + restore, restrictions, templates). Old URLs redirect; Clarify and the old Tasks surface are deleted. 615 tests; isolation 0 leaks over 221 endpoints / 143 tables. Not done: per-row notification delete UI, sibling reorder in Docs, space-level workflow editing page, second-user browser pass. Still to come: W10 (`claude/*.md` → Docs, after the MCP connector), W14 (Habits out of Tickets), v1.1 (work logging, estimates, JQL functions). Spec: `claude/spec-work.md` §11.

**People.** Contacts tier + merge + bin + vCard import/export live (0140, MYC-165). **People review** (reject / archive / ignore list / no auto-create) shipped 2026-10-20 (`1b525f1`, 0149), awaiting Phil's live check — root cause of the 62 junk "people": ticket titles run through a Title-Case regex that auto-creates. Spec `claude/people-review-spec.md`.

**Capture.** Typed capture form with an entity form registry; capture learning (0138) feeds corrections back as few-shot examples; review kinds ticket / person / idea; APPROVE now materialises ticket and person kinds (it only did quotes before). `idea` is a capture kind with `/organisation/ideas` (a list, not the Ideas spec).

**The Boys (agents).** Per-agent voice and manner (0136: ElevenLabs incl. own-voice clone, or OpenAI), streamed replies over SSE with sentence-pipelined TTS. The Anthropic account had no credit on 09-23; **confirmed back on 2026-10-29** (production stream route streamed a reply). `classifyCapture` still falls back to OpenAI if it ever lapses again.

**Tickets underneath Work.** Re-key on first project shipped (0135; 91 non-Mycelium MYC-n re-keyed, old keys alias). §18 twelve statuses + When picker live (0137) and mapped into Work's three categories. Merge (0139) superseded by Work. Live checks recorded before Work: `MYC-111` 18/29, `MYC-136` mis-read Done 0/23, `MYC-159` (§18) — these exercise surfaces Work has since replaced; Phil to decide whether to close them.

**Quotes** — v1 live (0126), awaiting Phil's live check. **Day log** — Parts A–E live (0127–0133), live checks `MYC-140/142/144/146` outstanding. **Fitness** — supersets (0134), rename-on-tap; MYC-41 project list order shipped. **Ideas** — decision record only; MCP connector auth question open.

**Multi-user (P12)** — live since 09-15. Tail: retire legacy env vars; decision 0.2 (`platform` owner-only); Security Advisor + anon-key re-probe; token revocation (run-book 4.10).

**Security / RLS** — 0101 + 0111; loop re-run rule (0124) and policy-name collision check (0146). DB backups still only manual dumps.

**Loam & Glow v2, PC monitoring (M4 checkpoint), Receipts (never runtime-exercised), Desk device (parked), Worktrees (partial)** — unchanged.

**Bugs** — Vision-scan regression (recipe add); rest-timer minimise persistence; archiving a programme does nothing; Google token refresh 400 (`/api/google/sync` failing until Phil reconnects; MYC-147) — none re-checked on 10-20.

## Open decisions & questions

1. **Phil's live check of Work + Docs** (MYC-174) — the biggest unverified surface.
2. **People review build** (0149) — then Phil clears the 62 live.
3. **Weekly scheduled task device binding** — still cloud-only; without it the Sunday run cannot see the repo. Recreate it device-bound from the desktop app on the PC.
4. **Repo sessions write project docs** — add to the repo `AGENTS.md`/`CLAUDE.md`: after a state change, update `claude/context.md` + `claude/backlog.md` in the Claude project, not only the repo copies.
5. Old live-check tickets (MYC-111, 136, 159, 140/142/144/146) — run, re-scope to Work, or close.
6. **Google reconnect** (Settings → Integrations now says "Reconnect needed" with the reason; MYC-147 built, token expired 2026-06-24) — Phil clicks RECONNECT.
7. ~~Anthropic API credit~~ — confirmed 2026-10-29.
8. `platform` owner-only (0.2); legacy env-var retirement; token revocation 4.10.
9. Migration-replay CI step, then DB backups.
10. Ideas MCP connector auth (`mtk_` bearer vs OAuth) — gates Ideas and W10.
11. Habits out of Tickets (W14) — scheduling.
12. `MYC-33` meaning; `exercise_pain_logs` SET NULL vs cascade; `.select()` lint rule.
13. M4 sensor dump review; secrets hygiene (`REMINDERS_CRON_SECRET`, `HEALTH_IMPORT_SECRET`).
14. Apple sign-in (deferred); onboarding how-to for new users.

## Since last run

**2026-10-20 (Cowork, PC reachable):** Phil asked for delete/archive on People review + learning from bad words. Repo read found the root cause (ticket-title regex auto-creating people) → `claude/people-review-spec.md` (R1–R6), built the same day as `1b525f1` + 0149. Then this reconciliation: project docs synced to the repo — `spec-work.md` added; `tasks-merge-spec.md`, `people-contacts-spec.md`, `spec-organisation.md` replaced with the repo's as-built versions; `work-redesign-spec.md`, `spec-index.md`, this file and `claude/backlog.md` rewritten. The backlog was condensed: done items are one line each; their detail lives in the spec docs and git history.

**2026-10-18 → 2026-08-30:** seven weekly runs and two fortnightly reviews, all docs-only (no device binding); no new facts beyond what is above.

**2026-09-30 → 2026-09-22 (repo sessions, recorded in the repo's own `claude/context.md` at `29b5f3e`):** 09-30 Work Parts B–G; 09-29 Work decisions + build spec + Part A, NOW strip removed (`547bbcc`); 09-25 MYC-165 contacts, MYC-163 merge, MYC-161 typed capture, MYC-160; 09-24 When rules (`6cd2173`); 09-23 MYC-158 §18 + board follow-up, MYC-151–156, MYC-148/149 voice, MYC-150 re-key; 09-22 MYC-40/31/30/41, Day log D–E.
