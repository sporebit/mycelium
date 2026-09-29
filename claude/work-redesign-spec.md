# Work redesign — decisions (Phil, 2026-09-29)

Jira-style Work section + Docs. These decisions stand; earlier chat decisions do not. The build spec derived from them is `claude/spec-work.md`; the as-built notes and deviations are recorded there and in the ticket comment.

Migration 0137 (12 statuses + When picker, tickets-spec §18) is dead: do not build it. *(Note added by the build session: 0137 had already shipped to hosted on 2026-09-23 — see spec-work §0.)*

## Decisions

- **W1** Own top-level **Work** section at `/work`; `/organisation/tickets` and `/organisation/tasks` redirect to it. Nav, ⌘K, dashboard cards re-pointed.
- **W2** Projects live inside Work. No separate Projects section. Each project: Overview (description, links, key dates, progress), Board, Backlog, Settings.
- **W3** Multi-user on the P12 spaces + roles from day one.
- **W4** Workflows customisable per space, per project and per issue type. Boards, automation, reports and the API bind to **three status categories: To Do / In Progress / Done**. The eight GTD categories go. Space-level default workflow per issue type; a project overrides only when it wants to. Map existing statuses: inbox/backlog/next → To Do; doing/waiting/verify → In Progress; done/cancelled → Done (Cancelled stays a status with a `resolution`).
- **W5** Issue types, editable per space: Epic, Story, Task, Bug, Sub-task, plus Run-book, Test, Guide, Setup (current `kind` values; these carry the existing steps page). Each project picks its types.
- **W6** Hierarchy Epic → Story/Task/Bug → Sub-task within a project. `areas` become **project categories** (grouping/filter only). **Sub-projects removed**: migrate each to a component of its parent; keys unchanged.
- **W7** v1 = labels + components; @mentions + notifications; Docs; Kanban + Scrum boards per project on the existing 0123 sprints (backlog, sprint planning, burndown); filters = structured bar + saved filters (shared per space) + JQL. **Work logging + estimates are v1.1 — do not build.**
- **W8** Notifications: one `notifications` table → in-app bell/inbox, Telegram (Phil), email via Resend (others), web push (service worker + subscription table), per-user channel settings. Events: mention, assignment, status change on watched/assigned, comment on watched.
- **W9** **Docs**: separate top-level section at `/docs`, Confluence-style page tree per space; page ↔ ticket links both ways; versions + history (diff, restore); per-space permissions on P12 roles with per-page restriction; page templates (UI + repo JSON like ticket templates). One rich editor (Tiptap) shared by ticket description, comments and docs, with @person and ticket-key chips.
- **W10** `claude/*.md` moving into Docs is **last** and depends on the MCP connector — not this run.
- **W11** Capture → an Inbox status (category To Do) in a per-space default project. Clarify stack removed.
- **W12** Now view → a saved filter (`Location = home AND Tool = pc`). Home = "Your work" (assigned to me, recently viewed, due soon, mentions).
- **W13** Fields: keep `points`. Drop `where_ctx`, `tools`, `time_window`, `someday`, `urgent`, `urgency` (`someday` → a Backlog status). New generic label-field type: `label_fields` (per space) → `labels` → `ticket_labels`, seeded with **Labels, Location, Tool**; backfill Location from `where_ctx`, Tool from `tools`. Keep the old columns unwritten for one release.
- **W14** Habits stay as they are in data; hidden from every Work view (already excluded). Not touched.
- **W15** Ideas are not projects and not tickets; nothing in this run.
- **W16** Untouched: keys + aliases, `tix` + skill, GitHub/Vercel webhooks (re-point Verify → an In Progress status named In Review, Done → Done), `mtk_` tokens, steps engine + templates, capture pipeline minus Clarify, Google Calendar sync.
- **JQL grammar:** `field op value` with `= != IN NOT IN ~ < > <= >= IS EMPTY / IS NOT EMPTY`, AND/OR/NOT, parentheses, `ORDER BY field ASC|DESC`. Fields: project, type, status, statusCategory, assignee, reporter, label, location, tool, component, epic, sprint, points, created, updated, started, resolved, due, text. Compiles to the same query object the filter bar emits; `/api/work/tickets` accepts either. No functions in v1.

## Build order (one commit + push + db push per part)

- **A** Schema: issue types, workflows/statuses with categories + per-type defaults, components, label fields/labels/ticket_labels + backfill, sub-project → component migration, watchers, saved filters, notifications + push subscriptions, docs tables (spaces, pages, versions, links, templates). Registry + entity groups. Replay from zero locally, then push.
- **B** Query object + JQL parser (`lib/work/query.ts`) + `/api/work/*` routes (tickets, projects, boards, sprints, filters, notifications, docs). Old `/api/tickets/*` routes keep working over the same rows (`tix` and the webhooks depend on them).
- **C** Rich editor (Tiptap) component with mention/key chips, used by description, comments, docs.
- **D** Pages: `/work` (Your work), project list by category, project Overview/Board (Kanban + Scrum)/Backlog/Settings, issue view (full page + the merged dialog if it exists), filter bar + JQL input + saved filters. Redirects. Nav/⌘K/dashboard re-point. Clarify removed.
- **E** Notifications: writer on the events above, bell/inbox UI, Telegram + Resend + web push senders, settings panel.
- **F** Docs section: tree, page editor, versions/diff/restore, templates, ticket links.
- **G** Docs: update claude/spec-organisation.md, claude/spec-platform.md, claude/spec-index.md, docs/tickets/README.md, claude/backlog.md (Work redesign stream, status per part), claude/context.md.

## Run rules

Work on `main`; push after every part; `supabase db push` right after each part's push; fresh hosted dump before the first `db push`. Clean build before every push. Every new table: RLS + deny-all restrictive policy + service_role grant + the 0111/0124 policy+grant loop; no unfiltered `.update()`; replay migrations from zero locally before pushing. API GETs stay behind the gate. No secrets in files. No test tickets or live-check gates. Undecidable → the reversible choice, recorded as a deviation.
