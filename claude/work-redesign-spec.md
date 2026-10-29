# Work section redesign — Jira-style tickets, projects, docs

*Decision record, 2026-09-29 (Cowork, Phil, four multiple-choice rounds). Status: **v1 Parts A–F built and pushed 2026-09-29/30 (MYC-174, migrations 0141–0148), awaiting Phil's live check**; build spec + as-built notes in `claude/spec-work.md` (repo-verified 2026-10-20). Supersedes: the "deliberately not Jira" framing in `claude/tickets-spec.md` §0, any further building on §18, and the "idea = a Tickets project at an idea stage" rule in `claude/ideas-spec.md`. Phil's standing instruction for this stream: earlier chat decisions do not stand by default — question them, don't assume.*

## Why

Phil hates how Tasks looks and feels. He uses Jira daily and wants the full Jira experience, not a Things-3-style list. The three weeks before this (split 09-17 → merge 09-25 → 12-status revision 09-23) showed the model moving under a half-built UI; this time: one spec, a fenced v1, increments after.

## Decisions

| # | Decision |
|---|---|
| W1 | **Section name: Work**, route `/work`, its own top-level nav entry out of Organisation. `/organisation/tickets` and `/organisation/tasks` redirect to it. |
| W2 | **Projects live inside Work** (Jira model: a project is the container for its issues). No separate Projects section. Each project gets an Overview page (description, links, key dates, progress) as well as board and backlog, so non-code projects (trips, board game) still make sense there. |
| W3 | **Multi-user / teams from day one**, on the P12 spaces + roles. |
| W4 | **Statuses and workflows customisable per space, per project and per issue type**, Jira-style. Automation, boards and reports bind to Jira's three status **categories** (To Do / In Progress / Done); names and transitions are free. The eight GTD categories go. Mitigation for config sprawl: a default workflow per issue type at space level; a project overrides only when it wants to. |
| W5 | **Issue types: Jira default set, editable per space** — Epic · Story · Task · Bug · Sub-task, plus Run-book · Test · Guide · Setup (the current `kind` values) which carry the house-style steps page. Each project picks the types it uses. |
| W6 | **Hierarchy: Epic → Story/Task/Bug → Sub-task inside a project.** Areas become **project categories** (Mycelium, Side projects, Home…) used only to group and filter the project list. **Sub-projects are removed** (hosted had none at build time). |
| W7 | **v1 must include:** labels + components, @mentions + notifications, Docs, boards (Kanban + Scrum per project, sprints kept on 0123), filters (structured bar + saved filters + the JQL grammar in flag 2). **Work logging + estimates = v1.1** (wanted, not first). |
| W8 | **Notifications: everything** — one `notifications` table drives an in-app bell/inbox, Telegram for Phil, email (Resend) for others, and web push, with per-user channel settings. |
| W9 | **Docs: a separate top-level Confluence-style section** (space tree), not a tab inside each project. Projects link into it; pages and tickets link both ways. Same rich editor (Tiptap) for ticket descriptions, comments and docs, with @person and ticket-key chips. Docs get **page versions + history (diff, restore), per-space permissions on the P12 role model with per-page restriction, and page templates** (UI + repo JSON). |
| W10 | **`claude/*.md` project docs move into Docs** and Claude reads/writes them there through the API/MCP instead of the Claude project. Depends on the Mycelium MCP connector (Ideas stream, auth question open); until it exists the Claude project stays canonical. **Not built.** |
| W11 | **Capture: Inbox status, no Clarify.** Captures land in an Inbox status (category To Do) in a default project (General); triage happens on the board. Clarify is removed (built). |
| W12 | **Now view demoted** to a saved filter; home = a Jira-style "Your work" page. |
| W13 | **Fields: keep story points; drop `where_ctx`, `tools`, `time_window`, `someday`, `urgent`.** `someday` → a Backlog-category status. Replaced by **multiple label-type fields**: `label_fields` per space → `labels` → `ticket_labels`, seeded with **Labels**, **Location** and **Tool**; old values backfilled (old columns mirrored by delta). |
| W14 | **Habits are not tickets.** Leave the 0118 data in place (habit tickets excluded from every list); rebuild Habits as its own feature in a later stream. **Not started.** |
| W15 | **Ideas stay their own place.** An idea is *not* a project: it graduates to a project when building starts and the planned steps become that project's first tickets. |
| W16 | **Kept:** keys + aliases, `tix` + skill, GitHub/Vercel evidence webhooks (re-pointed to In Review / Done by status name), `mtk_` tokens; the steps engine + ticket templates; the capture pipeline minus Clarify; Google Calendar sync on scheduled dates (blocked on the Google reconnect, MYC-147). |
| W17 | **Merge state — repo-verified 2026-09-29 by the build session:** the Tasks+Tickets merge (MYC-163, 0139) shipped as one surface at `/organisation/tasks`; its "Part 2" (centred dialog, right-click menu) **never shipped**; **0137 had already gone live on 2026-09-23 (MYC-158)**, so "do not build 0137" became "build no further on §18" and the twelve statuses were mapped to the three categories. See `claude/tasks-merge-spec.md` and `claude/spec-work.md` §0. |

## Flags raised (comply unless reopened)

1. "Full Jira" is a multi-release programme; v1 was fenced by W7 and ordered into gated parts.
2. JQL in v1 — accepted: `field op value`, AND/OR/NOT, parentheses, `ORDER BY`; operators `= != IN NOT IN ~ < > <= >= IS EMPTY`; compiles to the same query object as the filter bar. Functions (`currentUser()`, `startOfWeek()`) are v1.1.
3. Notifications and the rich editor were the two new subsystems — both built (Parts C, E).
4. Reverting habits later costs a migration back to own tables plus re-pointing tile, heatmap, briefing and streak code. Recorded, not scheduled.
5. Moving `claude/*.md` into Docs changes how every Claude session starts. Last part of v1, after the MCP connector.
6. Dropping the GTD fields loses the clock-based time window of the old Now filter. Accepted.

## Where it stands (2026-10-20)

- **Built:** Parts A (schema 0141–0146), B (query object, JQL, `/api/work/*`, 0147–0148; 615 tests, isolation 0 leaks over 221 endpoints), C (Tiptap editor), D (Work pages + redirects + Clarify removed), E (notifications UI), F (Docs), G (as-built notes). Details and "not done in this run" list: `claude/spec-work.md` §11.
- **Open:** Phil's live check of the Work surface; mockups were skipped (built straight from the spec); W10 docs move; W14 Habits out; v1.1 (work logging, estimates, JQL functions).
