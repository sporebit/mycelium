# Work + Docs — build spec (2026-09-29, MYC-174)

Derived from `claude/work-redesign-spec.md` (decisions W1–W16 + the JQL grammar). This file is the build contract: the data model diff against the chain as it stands, the migrations, routes, pages, the query object and JQL, notifications, the docs model, the plan for existing tickets, and the build parts. As-built notes and deviations are appended per part at the end.

## 0. State verified before the build (2026-09-29)

| Item | State |
|---|---|
| Branch / commit | `main` = `tickets` = `547bbcc`, level with `origin/main` |
| Migration chain | ends at **0140**, local and hosted identical; next free number **0141** |
| Tasks + Tickets merge (MYC-163) | shipped: one surface at `/organisation/tasks` (`/organisation/tickets` index redirects), Area chip in `ui_prefs.tickets.area`, dates Table tab, `tickets.started_at` (0139) |
| Merge "Part 2" (centred dialog, right-click menu) | **never shipped.** No `TicketDialog`; the ticket view is the full page at `/organisation/tickets/[key]`. The only context menu is inside the classic Board (`components/compost/TaskRowList.tsx`) |
| Migration 0137 (12 statuses + When) | **already live on hosted since 2026-09-23 (MYC-158).** "Dead, do not build" cannot apply to the migration; it applies to building any further on §18. The W4 map below therefore covers the twelve statuses, not the original eight |
| Hosted data (dump `A:\Backups\mycelium\2026-09-29`) | 1 space (Phil, personal, prefix `PW`), 6 projects, **0 sub-projects**, 2 areas, 1 workflow / 12 statuses, 0 sprints, 176 tickets (152 task, 12 habit, 10 test, 1 guide, 1 reminder); 116 tickets have no project; 23 `someday`; 47 `where_ctx = home`; 59 with a tool; 84 with tags; 0 assignees |

## 1. Principles

1. **One table.** `tickets` stays the row for everything; Work is a new surface and a new API over the same rows. `/api/tickets/*`, `tix`, the skill, both webhooks, `mtk_` tokens, the steps engine, templates, capture and Google Calendar sync keep working (W16).
2. **Three status categories** drive everything new: `todo`, `in_progress`, `done` (`ticket_statuses.status_category`). The legacy eight-value `category` column stays as a compatibility field for the old routes and `tix move KEY <category>`; nothing in Work reads it.
3. **Additive and reversible.** No column is dropped, no key changes, no row is deleted. Every data move in §8 has a recorded inverse.
4. **RLS is the wall.** Every new table: adopted into a space, RLS enabled, deny-all restrictive policy, `service_role` grant, entity group row, and the 0111 policy + grant loop inlined in the same migration (the 0124 lesson).
5. **Code style** for new files: tabs, no alignment padding, UK English in copy. Edits inside existing files follow that file.

## 2. Data model — diff against the chain at 0140

### 2.1 Statuses and workflows (W4) — `0142_work_statuses.sql`

- `ticket_statuses.status_category text not null check (status_category in ('todo','in_progress','done'))`, backfilled from `category`: inbox / backlog / next → `todo`; doing / waiting / verify → `in_progress`; done / cancelled → `done`.
- `ticket_statuses.resolution text check (resolution in ('done','cancelled','duplicate','wont_do'))` — only on `done`-category statuses. Done + Closed → `done`; Cancelled → `cancelled`.
- A `before insert or update` trigger on `ticket_statuses` derives whichever of the two category columns the writer left out: a new Work status supplies `status_category` and gets `category` (`todo` → `next`, or `backlog`/`inbox` when the name says so; `in_progress` → `doing`; `done` → `done`, or `cancelled` when `resolution = 'cancelled'`); an old-route status supplies `category` and gets `status_category`.
- `tickets.resolution text` and `tickets.resolved_at timestamptz`, maintained by the status sync trigger: entering a `done`-category status stamps both (resolution from the status); leaving clears both. Backfill: `resolved_at = coalesce(completed_at, cancelled_at)`.
- `ticket_workflows.description text`, `ticket_workflows.archived_at timestamptz`.
- **`ticket_workflow_map`** — which workflow applies: `(id, project_id null, issue_type_id null, workflow_id not null)`, unique on `(space_id, project_id, issue_type_id)` with nulls treated as values. `project_id null` = space level; `issue_type_id null` = every type. Resolution order for a ticket: project + type → project + any type → space + type → space default (`ticket_workflows.is_default`). Seeded empty: every type uses the space default until someone overrides it. A non-null `projects.workflow_id` (unused until now) is copied in as a project-level row.
- Functions: `ticket_workflow_for(p_space, p_project, p_type) returns uuid`; `ticket_status_in(p_workflow, p_status_category, p_legacy_category default null) returns uuid` (category default first, then sort order); `ticket_status_for` and `ticket_status_for_legacy` stay for the old paths.
- The sync trigger additionally **re-homes** a ticket's status into the ticket's own workflow: same name there, else that workflow's status for the same `status_category` (the legacy category narrowing the choice). It runs on every status write and on a type, kind, parent or project change. This is what lets `tix`, the webhooks and every other old path go on resolving statuses in the space default workflow: the database lands the ticket on the counterpart. An edit that does not change the status never touches `started_at`, `completed_at`, `cancelled_at` or `resolved_at`.
- `tickets_seed_workflow` writes both category columns and the resolutions.

### 2.2 Issue types and hierarchy (W5, W6) — `0141_work_issue_types.sql` (first, because the workflow map and the status trigger refer to types)

- **`issue_types`**: `id, name, slug, level smallint check (level in (1, 0, -1))` (1 = Epic, 0 = standard, −1 = Sub-task), `legacy_kind text` (the `tickets.kind` it carries, null for the new ones), `has_steps boolean`, `icon text, colour text, sort_order int, archived_at`; unique `(space_id, slug)`.
- Seed per space (function `work_seed_types(p_space)`, called by a trigger on `spaces` insert and once for existing spaces):

| Type | slug | level | legacy_kind | has_steps |
|---|---|---|---|---|
| Epic | epic | 1 | — | no |
| Story | story | 0 | — | no |
| Task | task | 0 | task | no |
| Bug | bug | 0 | — | no |
| Sub-task | subtask | −1 | — | no |
| Run-book | runbook | 0 | runbook | yes |
| Test | test | 0 | test | yes |
| Guide | guide | 0 | guide | yes |
| Setup | setup | 0 | setup | yes |
| Audit | audit | 0 | audit | yes |

- **`project_issue_types`** `(project_id, issue_type_id)` — the types a project offers. No rows = every type in the space.
- `tickets.type_id uuid references issue_types(id) on delete set null` and `tickets.epic_id uuid references tickets(id) on delete set null`.
- Trigger `tickets_sync_type` (before insert or update of `type_id, kind, parent_task_id`): a row written by an old path (no `type_id`) takes the type from its `kind` (`task` with a parent → Sub-task; `reminder` → Task); a row written by Work (type given) has `kind` set from the type's `legacy_kind` (`task` for Epic / Story / Bug / Sub-task) unless the kind is `reminder`. **Habits are skipped entirely** (W14): `type_id` stays null and no Work query returns them.
- Trigger `tickets_check_epic`: `epic_id` must point at a ticket whose type is level 1 in the same project, and an Epic cannot itself have an `epic_id`. Moving a ticket to another project clears an `epic_id` that no longer fits.
- Sub-tasks stay on `parent_task_id`, one level (existing rule).

### 2.3 Projects, categories, components, the default project (W2, W6, W11) — `0143_work_projects.sql`

- `areas` are **project categories** in every label and route; the table and `projects.area_id` keep their names (no rename migration). `areas.kind` stays for the old Area chip until the old surface is gone.
- `projects`: `is_default boolean not null default false` (one per space, partial unique index), `lead_user_id uuid references auth.users`, `start_on date`, `target_on date`, `links jsonb not null default '[]'` (`[{label, url}]`), `board_type text not null default 'kanban' check (board_type in ('kanban','scrum'))`, `board_columns jsonb` (null = derived from the workflow; else `[{name, status_ids[]}]`).
- **Default project** per space, named **General**, `prefix null` so its tickets keep taking the space's `PW-n` keys from the space counter (0135's taker, unchanged). Category: Life. Created by `work_seed_default_project(p_space)` — trigger on `spaces` insert, and once for existing spaces. In URLs and JQL its key is the space prefix (`PW`).
- Trigger `tickets_default_project` (before insert): a non-habit ticket with no project lands in the default project. Capture therefore needs no change to reach it, and the status stays Inbox (W11).
- **`components`** `(id, project_id not null, name, description, lead_user_id, sort_order, archived_at, migrated_from_project_id uuid)`, unique `(project_id, lower(name))`; **`ticket_components`** `(ticket_id, component_id)`.
- **Sub-projects removed**: §8.3. A trigger then refuses a new `projects.parent_id`.

### 2.4 Labels (W13) — `0144_work_labels.sql`

- **`label_fields`** `(id, name, slug, is_system boolean, sort_order)`, unique `(space_id, slug)`. Seeded per space: **Labels** (`labels`), **Location** (`location`), **Tool** (`tool`). More can be added per space; each is a JQL field by its slug.
- **`labels`** `(id, field_id, name, slug, colour, archived_at)`, unique `(field_id, slug)`; slug = lower-cased, trimmed name.
- **`ticket_labels`** `(ticket_id, label_id)`.
- Backfill: §8.4.
- **Mirror triggers** on `tickets` (after insert or update of `tags`, `where_ctx`, `tools`): the *delta* between old and new values is applied to `ticket_labels` (added values attach, removed values detach). This keeps every old writer correct — `tix new --where home --tools pc`, capture's suggestions, the Telegram path — without those paths knowing about labels. Work itself writes `ticket_labels` only and never the old columns.
- Old columns `where_ctx`, `tools`, `time_window` (+ `time_from`, `time_to`, `days`), `someday`, `urgent`, `urgency` stay in place for one release; no Work code reads or writes them.

### 2.5 Watchers, saved filters, notifications, rich text — `0145_work_collab.sql`

- **`ticket_watchers`** `(ticket_id, watcher_id references auth.users on delete cascade, created_at)`, primary key on the pair. Auto-watch: reporter, assignee, every commenter, everyone mentioned.
- **`saved_filters`** `(id, name, slug, description, jql text not null, query jsonb not null, shared boolean not null default true, is_system boolean not null default false, sort_order, created_at, updated_at)`; unique `(space_id, slug)`. Shared filters are visible to the space; unshared ones to their creator only (restrictive policy). Seeded per space: **Now** (`location = home AND tool = pc AND statusCategory != Done`), **My open work**, **Inbox**, **Due this week**, **Recently resolved**.
- **`notifications`** `(id, recipient_id not null, actor_id, event text check (event in ('mention','assignment','status_change','comment')), ticket_id, doc_page_id, comment_id, title, body, url, read_at, delivered jsonb not null default '{}', created_at)`. Space policies from the loop **plus** a restrictive policy so only the recipient reads, updates or deletes a row.
- `user_settings.notification_prefs jsonb not null default '{}'` — per user: `{in_app, telegram, email, push}` × event, plus `quiet` hours. Defaults: in-app on for all; Telegram on for the instance owner; email on for everyone else; push on where a subscription exists.
- `push_subscriptions` already exists (0039) with `lib/push.ts`; reused as is.
- Rich text: `tickets.description_doc jsonb`, `ticket_comments.body_doc jsonb` (Tiptap JSON). The plain `description` / `body` columns stay the searchable, exportable text and are written alongside. An old-path write to the text column alone clears the stale `_doc` (trigger), and the editor then opens from the text.
- Recently viewed is a preference, not a table: `ui_prefs.work.recent` (last 20 keys). Board and filter-bar state live in `ui_prefs.work` too.

### 2.6 Docs (W9) — `0146_docs.sql`

- **`doc_spaces`** `(id, key, name, description, icon, home_page_id, archived_at)`, unique `(space_id, key)`; key shape `^[A-Z][A-Z0-9]{1,9}$`. One seeded per space: key `HOME`, name "Home".
- **`doc_pages`** `(id, doc_space_id not null, parent_id references doc_pages on delete set null, title, body jsonb not null default '{}', body_text text not null default '', position int, version int not null default 1, restricted boolean not null default false, archived_at, updated_by, created_at, updated_at)`. Tree order = `position` within a parent. Trigram index on `title`, and `body_text` for search.
- **`doc_page_versions`** `(id, page_id, version, title, body, body_text, note, created_at)`, unique `(page_id, version)`. Written by a trigger on every change of title or body, so a version can never be skipped by a caller. Restore = write an old version's content as a new version.
- **`doc_page_links`** `(page_id, ticket_id, source text check (source in ('manual','mention')))`, primary key on the pair. One row serves both directions.
- **`doc_page_restrictions`** `(page_id, grantee_id, can_edit boolean)`. When `doc_pages.restricted` is true the page and its descendants are visible only to the creator and the listed users; `app.doc_page_visible(page)` / `app.doc_page_editable(page)` (security definer, to avoid the 0130 policy recursion) back restrictive policies on pages, versions, links and restrictions.
- **`doc_templates`** `(id, slug, name, description, body jsonb, origin text check (origin in ('ui','repo')), version, shared)`, unique `(space_id, slug)`. Repo JSON in `docs/docs/templates/*.json`, synced like ticket templates.
- Entity group: **`organisation.docs`** (see deviation D5).

A column that names a person is never called `user_id` in a registered table: `app.adopt_table` reads that name as the pre-P12 ownership column and drops it. Hence `watcher_id`, `recipient_id`, `grantee_id`.

### 2.7 Registry

New tables go through **`app.register_table(table, section, group, parent, parent_col)`** (0141): adopt, enable RLS, deny-all, `service_role` grant, entity group row and the policy + grant loop in one call. 0146 ends with a self-check over all seventeen tables (RLS on, the four space policies present and permissive, no `deny all` left, registered, granted) and fails the migration otherwise.

`lib/access/registry.ts` — `organisation.tickets` gains `ticket_workflow_map, issue_types, project_issue_types, components, ticket_components, label_fields, labels, ticket_labels, ticket_watchers, saved_filters, notifications`; new group `organisation.docs` = `doc_spaces, doc_pages, doc_page_versions, doc_page_links, doc_page_restrictions, doc_templates`. The same rows go into `entity_groups` in each migration.

## 3. Query object and JQL (`lib/work/query.ts`, `lib/work/jql.ts`)

### 3.1 The query object

```ts
type WorkQuery = { where: Node | null; orderBy: Array<{ field: Field; dir: "asc" | "desc" }> };
type Node =
	| { op: "and" | "or"; nodes: Node[] }
	| { op: "not"; node: Node }
	| { field: Field; cmp: Cmp; value?: string | number | Array<string | number> };
type Cmp = "=" | "!=" | "in" | "not in" | "~" | "<" | ">" | "<=" | ">=" | "is empty" | "is not empty";
```

The filter bar builds this directly; the JQL parser compiles to it; `toJql(query)` prints it back, so the bar and the JQL box round-trip. Saved filters store both.

### 3.2 Grammar

```
query    := [ expr ] [ "ORDER BY" order { "," order } ]
expr     := term { "OR" term }
term     := factor { "AND" factor }
factor   := "NOT" factor | "(" expr ")" | clause
clause   := field cmp value
          | field ( "IN" | "NOT IN" ) "(" value { "," value } ")"
          | field "IS" [ "NOT" ] "EMPTY"
cmp      := "=" | "!=" | "~" | "<" | ">" | "<=" | ">="
value    := quoted string | bare word | number
order    := field [ "ASC" | "DESC" ]
```

Keywords and field names are case-insensitive. No functions in v1. Two value conventions that are literals, not functions: `me` for the calling user on `assignee` / `reporter`, and relative dates on date fields (`today`, `-7d`, `+2w`, `-1m`), resolved in Europe/London when the query runs — a saved filter keeps the relative form.

### 3.3 Fields

| Field | Matches | Notes |
|---|---|---|
| project | project key (prefix), name or id | the default project answers to the space prefix |
| type | issue type name or slug | |
| status | status name | |
| statusCategory | `To Do` / `In Progress` / `Done` | also `todo`, `in_progress` |
| assignee, reporter | display name, id, or `me` | reporter = `created_by` |
| label, location, tool | label name within that field | any other label field by its slug |
| component | component name | |
| epic | epic key or title | |
| sprint | sprint name or id; `active` | |
| points | number | |
| created, updated, started, resolved, due | `YYYY-MM-DD` or relative | compared as London days; due = `deadline_on` |
| text | `~` only: title, description, key, aliases | |

### 3.4 Execution

`public.work_search(p_query jsonb, p_limit int, p_offset int)` — `security invoker`, so the caller's RLS applies. It walks the node tree and builds the predicate from a fixed field → SQL map; every value goes through `format('%L')`; an unknown field, operator or order column raises. It always excludes deleted rows, habits and spawn templates. It returns ids in order plus the total; the route then reads those rows with one select.

## 4. Routes — `/api/work/*` (all behind the gate, all through `createUserClient()`)

| Route | Methods | Purpose |
|---|---|---|
| `/api/work/meta` | GET | types, workflows + statuses, label fields + labels, projects, people assignable — one call for the filter bar and forms |
| `/api/work/home` | GET | Your work: assigned to me, due soon, recently viewed, mentions |
| `/api/work/tickets` | GET, POST | GET `jql=` **or** `q=` (query object as JSON), `limit`, `offset`; POST creates |
| `/api/work/tickets/[key]` | GET, PATCH, DELETE | the issue with labels, components, watchers, children, epic, doc links; PATCH accepts `status_id`, `type_id`, `labels`, `components`, `epic`, `assignee_id`, `description_doc`… |
| `/api/work/tickets/[key]/comments` | GET, POST | rich comments; writes notifications |
| `/api/work/tickets/[key]/watch` | POST, DELETE | watch / unwatch |
| `/api/work/projects` | GET, POST | list grouped by category; create |
| `/api/work/projects/[key]` | GET, PATCH | overview (progress by category, key dates, links); settings |
| `/api/work/projects/[key]/components` | GET, POST, PATCH, DELETE | components |
| `/api/work/boards/[key]` | GET, PATCH | board columns + cards (Kanban: whole project; Scrum: active sprint); PATCH = board config |
| `/api/work/sprints`, `/api/work/sprints/[id]` | as `/api/sprints` | the 0123 handlers, re-exported |
| `/api/work/workflows`, `/[id]` | GET, POST, PATCH, DELETE | workflows, statuses, the workflow map |
| `/api/work/types`, `/[id]` | GET, POST, PATCH | issue types; a project's picks |
| `/api/work/labels` | GET, POST, PATCH | label fields and labels |
| `/api/work/filters`, `/[id]` | GET, POST, PATCH, DELETE | saved filters |
| `/api/work/notifications` | GET, PATCH | my notifications; mark read |
| `/api/work/notifications/settings` | GET, PATCH | channel settings |
| `/api/work/docs/spaces`, `/pages`, `/pages/[id]`, `/pages/[id]/versions`, `/pages/[id]/links`, `/templates` | — | §7 |

`/api/tickets/*` is unchanged in shape. Two behaviour changes behind it: a status resolved in the default workflow is re-homed into the ticket's own workflow by the database (§2.1), and the webhooks are re-pointed (GitHub → the In Progress status named **In Review**; Vercel → **Done**), both falling back to the category lookup when a workflow has no status of that name.

## 5. Pages

| Path | What |
|---|---|
| `/work` | **Your work** — assigned to me, due soon, recently viewed, mentions |
| `/work/projects` | projects grouped by category; create |
| `/work/projects/[key]` | **Overview** — description, links, key dates, lead, progress |
| `/work/projects/[key]/board` | **Board** — Kanban (whole project) or Scrum (active sprint); drag between columns |
| `/work/projects/[key]/backlog` | **Backlog** — sprints (planned, active) over the backlog; sprint planning; burndown |
| `/work/projects/[key]/settings` | details, issue types, workflows, components, board |
| `/work/issues` | issue navigator — filter bar, JQL box, saved filters; `?filter=<slug>` and `?jql=` |
| `/work/browse/[key]` | the issue — full page (there is no dialog to merge, §0) |
| `/work/notifications` | the inbox behind the bell |
| `/docs`, `/docs/[space]`, `/docs/[space]/[page]`, `…/history`, `/docs/templates` | §7 |

Redirects: `/organisation/tasks` and `/organisation/tickets` → `/work`; `/organisation/tickets/[key]` → `/work/browse/[key]` (Telegram messages, commit links and `tix` output keep landing); `/organisation/projects` → `/work/projects`; `/organisation/projects/[id]` → that project's overview; `/organisation/tickets/sprints` → `/work/projects`. `/organisation/tickets/templates` and `/review` keep their URLs. Nav (`lib/nav/sections.ts`), ⌘K groups, the Organisation index cards and the dashboard cards are re-pointed. **Clarify is removed** (component, route, the Inbox tab): the Inbox is the saved filter `status = Inbox`.

## 6. Notifications (W8)

- **Writer** `lib/work/notify.ts`: called by the Work routes and by `/api/tickets/*` writes. Events — `mention` (an @person chip in a description, comment or doc), `assignment`, `status_change` (to watchers and the assignee), `comment` (to watchers). Never to the actor. One row per recipient per event.
- **Delivery** `lib/system/notifyDeliver.ts` (service client; runs in `after()`): per recipient, per their `notification_prefs` — in-app (the row itself), Telegram (the instance owner, via the existing bot), email through Resend (`lib/system/email.ts`), web push (`lib/push.ts`). Each successful channel is stamped into `notifications.delivered`; a failing channel never fails the request.
- **UI**: bell with unread count in the shell; `/work/notifications` inbox (mark read, mark all read); Settings → Notifications (a channel × event grid, push subscribe button).
- **Env names** (values never in the repo): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_USER_ID`, `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUBLIC_BASE_URL`.

## 7. Docs

- A **doc space** holds a page tree; a P12 space can hold several doc spaces. Permissions are the P12 roles on `organisation.docs`, narrowed per page by a restriction.
- **Editor**: the shared Tiptap editor (§Part C). Body stored as Tiptap JSON with a plain-text rendition for search and diff.
- **Versions**: every save that changes title or body writes a version (trigger). History lists versions; **diff** compares the text renditions of two versions line by line; **restore** writes the old content as a new version.
- **Links**: an @ticket-key chip in a page writes a `doc_page_links` row (`source = mention`); a link can also be added by hand from either side. The issue page lists its pages; the page lists its issues.
- **Templates**: UI-made templates and repo JSON (`docs/docs/templates/*.json`), chosen when a page is created.
- Moving `claude/*.md` into Docs is not in this run (W10).

## 8. Migration plan for existing tickets

Every step runs inside its migration, replayed from zero and then rehearsed on a restore of the hosted dump before `db push`. Each prints counts with `raise notice` and asserts its own invariant.

1. **Status categories** (0142): the twelve statuses map as below. No ticket changes status.

| Status | legacy category | status_category | resolution |
|---|---|---|---|
| Inbox | inbox | To Do | |
| Backlog | backlog | To Do | |
| On Hold | backlog | To Do | |
| Selected for Development | next | To Do | |
| Waiting on my Decision | next | To Do | |
| In Progress | doing | In Progress | |
| Waiting on 3rd Party | waiting | In Progress | |
| In Review | verify | In Progress | |
| Testing | verify | In Progress | |
| Done | done | Done | done |
| Closed | done | Done | done |
| Cancelled | cancelled | Done | cancelled |

2. **Types** (0141): every non-habit ticket gets a `type_id` from its `kind`; a `task` with a parent becomes a Sub-task. Asserts no non-habit ticket is left without a type. Inverse: `update tickets set type_id = null`.
3. **Sub-projects → components** (0143): for each project with a parent — a component of the same name on the parent (`migrated_from_project_id` set), its tickets attached to that component and moved to the parent, its sprints moved to the parent (an active sprint that would collide becomes planned), the sub-project archived (row kept, `parent_id` kept). The re-key trigger is disabled for the statement, and the migration asserts that no `ticket_key` changed. Hosted has no sub-projects, so this moves nothing there. Inverse: `migrated_from_project_id` names the project each ticket came from.
4. **Default project** (0143): General is created; every non-habit ticket with no project moves into it (hosted: about 104). Keys do not change (the project has no prefix; asserted). Inverse: `update tickets set project_id = null where project_id = <General>`.
5. **Someday → Backlog** (0143): a ticket with `someday = true` that is still in a To Do status moves to the Backlog status; one `ticket_activity` row each records it (and names the status it left, which is the inverse). A someday ticket already In Progress or In Review stays where it is. `someday` itself is left as it was.
6. **Labels** (0144): Location from `where_ctx` (`home` → Home, `out` → Out, `place` → the place's name; `anywhere` is the absence of a label), Tool from each element of `tools` except `none`, Labels from `tags`. Habits are skipped. Inverse: truncate `ticket_labels`.
7. **Resolution** (0142): `resolution` / `resolved_at` backfilled for tickets already in a Done-category status.

## 9. Build parts (one commit + push + `db push` per part)

| Part | Scope |
|---|---|
| **A** | Migrations 0141–0146, registry + entity groups, replay from zero, rehearsal on the hosted restore, `db push` |
| **B** | `lib/work/*` (query object, JQL parser, serialisers), `work_search` (0147), `/api/work/*`; webhooks re-pointed |
| **C** | Tiptap editor component with @person and ticket-key chips; doc ↔ text helpers |
| **D** | Work pages, redirects, nav / ⌘K / dashboard re-point, Clarify removed |
| **E** | Notification writer, delivery, bell + inbox, settings panel |
| **F** | Docs section |
| **G** | Spec and doc updates |

Not in this run: work logging and estimates (W7, v1.1); `claude/*.md` into Docs (W10); Ideas (W15).

## 10. Deviations and choices made where the decisions were silent

| # | Choice | Why | How to reverse |
|---|---|---|---|
| D1 | The legacy eight-value `category` column stays, derived automatically for new statuses | W16 keeps `tix` and the webhooks untouched, and both address statuses by those categories | drop the column once `tix` speaks status categories |
| D2 | 0137 is treated as shipped; its twelve statuses are mapped | it has been live since 2026-09-23 | — |
| D3 | The old context columns are still written by the old routes (and mirrored into labels by trigger) | `tix new --where/--tools` and capture suggestions must keep working (W16) | remove the fields from the old whitelist |
| D4 | An **Audit** issue type is seeded beside the nine named ones | `audit` is an existing `kind`; every kind needs a type | archive the type |
| D5 | Docs permissions use entity group `organisation.docs`, not a new `docs` section | a new section means changing the section checks on three access tables and every grant UI | add the section later and move the group |
| D6 | Unprojected tickets move into a default project **General** with no prefix | W2 puts every ticket in a project; a prefix-less project keeps `PW-n` keys | §8.4 |
| D7 | `me` and relative dates are accepted as literal values | filters such as "assigned to me, due this week" are unusable without them; no function syntax is added | remove from the resolver |
| D8 | Tags are backfilled into the Labels field | the decisions seed a Labels field and name no source for it | truncate those rows |
| D9 | The issue opens as a full page only | the merge's centred dialog never shipped (§0) | — |
| D10 | Storage objects were not re-dumped | these migrations touch no bucket; the 2026-09-15 storage copy stands | — |

## 11. As built

### Part A — schema (2026-09-29)

- **Migrations 0141–0146**, in this order: `0141_work_issue_types`, `0142_work_statuses`, `0143_work_projects`, `0144_work_labels`, `0145_work_collab`, `0146_docs`. Seventeen new tables; `app.register_table`; registry groups `organisation.tickets` (+11) and `organisation.docs` (6).
- **Replay from zero:** the whole chain 0001 → 0146 plus the seed applied to an empty database. It ran on a **separate throwaway stack** (`MyceliumReplayA`, its own ports), because `supabase db reset` on the main local stack was refused by the session's permissions; nothing on the main stack was wiped.
- **Rehearsal on production data:** the public rows of the hosted dump loaded into a second throwaway stack at 0140, then 0141–0146 applied. Result over 176 tickets: **0 keys changed, 0 `updated_at` changed, 0 start / finish timestamps changed, 0 old columns changed, 0 habits touched**; 104 unprojected tickets moved into General; 15 someday tickets moved Selected for Development → Backlog (8 were already in Backlog); 164 tickets typed (126 Task, 27 Sub-task, 10 Test, 1 Guide); Location on 47 tickets (Home), Tool on 59 (PC 53, Phone 21, Stickers 1), Labels on 72 (81 labels); resolution stamped on 89 (79 done, 10 cancelled).
- **Two faults the rehearsal caught, fixed before the push:** (1) the restrictive policies on `doc_page_restrictions` were named `<table>_select` … `_delete`, the same names as the loop's permissive policies, so they replaced them and the table was closed to everyone — renamed `…_owner_*`, and the 0146 self-check now fails the migration on any such collision; (2) a someday ticket in In Review was pulled back to Backlog — the move now applies to To Do statuses only.
- **Tests:** `lib/work/schema.test.ts` (18, on the local stack): seeds per space, old-path inserts (default project, type from kind, Inbox, space key), label mirroring by delta, stale-document clearing, habits untouched, type → kind, epic rules, the 0135 re-key still working, resolution, no invented start date, status category ↔ legacy category, workflow re-homing, the project guard, doc versions and tree integrity.

### Part B — query object, JQL, API (2026-09-30)

- **Migrations 0147–0148.** `0147_work_search` — `work_search` and its helpers (security invoker; every value through `format('%L')`; an unknown field, operator, order column or label field raises `22023`, a bad date `22007`). `0148_work_status_guards` — a new ticket always gets a status (the ticket's own workflow first, so a workflow with no Inbox still works); re-categorising a status re-syncs its tickets' resolution and finish stamps without touching `started_at`; `work_rehome(space)` moves tickets at once after a map or default change; a doc space cannot be deleted by a signed-in user while it holds a live page (checked with definer rights, because RLS hides restricted pages from the caller); an unshared page template is its creator's alone.
- **`lib/work/`**: `query.ts` (the object, validation, `toJql`, the filter bar's `barToQuery` / `queryToBar`), `jql.ts` (tokeniser + recursive-descent parser, errors carry a position), `server.ts` (serialisers, search, the write whitelist), `tickets.ts` (create / patch / detail with activity, People mentions, calendar sync, labels, components, watchers, notifications), `doc.ts` (document ↔ text, mentions, line diff), `notify.ts` + `lib/system/notifyDeliver.ts` (writer and delivery), `notifyPrefs.ts`, `automation.ts`, `projects.ts`, `boards.ts`, `config.ts`, `docs.ts`, `docTemplates.ts`.
- **39 route files under `/api/work/`**, as §4, plus: `/api/work/projects/[key]/backlog`, `/types`, `/components/[id]`; `/api/work/boards/[key]/move` (status + rank in one call); `/api/work/workflows/[id]/statuses` and `/map`; `/api/work/docs/pages/[id]/restrictions`; `/api/work/docs/for-ticket/[key]`.
- **Webhooks re-pointed (W16):** GitHub → the status named In Review in the ticket's own workflow; Vercel → Done; each falls back to the workflow's status for the category when it has no status of that name. Forward only, in terms of the three categories.
- **Delivery needs no service-role access to data.** It acts as the recipient through `withUser()`; the service client is used only to read the recipient's email address from `auth.users`.
- **Tests:** 615 pass (was 331). New: JQL parser 28, `work_search` through PostgREST with user JWTs 12 (including a second user seeing nothing), automation 8, documents 10, projects + boards 85, config 65, docs 73, schema triggers 21. **Isolation test: 0 leaks over 221 endpoints × 2 users and 143 tables.**
- **Additions beyond the decisions:** JQL field `key`; `ORDER BY` also takes `rank`, `title`; Your work has an "In progress" list (mine or unassigned), because in a space of one nothing is assigned.
- **Known limits:** second-user paths of the docs restriction and private filters are covered by RLS policy and the isolation test, not by route-level tests; `lib/tickets/sprints.ts` still decides "done" from the legacy category (correct, since the database derives it).
