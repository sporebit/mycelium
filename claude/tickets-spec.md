# Tickets — backlog, GTD and life tasks, stored in Mycelium

*Written 2026-09-14 from Phil's 38 multiple-choice decisions (Q1–Q35 below; Q36–Q38 on the import map in §13.2 and §17.7) plus the earlier stress-test. Replaces the Tasks feature in place and **absorbs** `claude/checklists-spec.md` (its data shapes survive as columns on a ticket), Reminders, Habits and `venture_steps`. Status: **spec agreed; build after cutover, first on main, everything in one stream** (Q25). The few remaining assumptions in §17 are applied as defaults unless Phil objects.*

---

## 0. What this is in one paragraph

One `tickets` table replaces `tasks`. A ticket is anything with a done state: a code change, "book MOT", "change bedding" every fortnight, a 34-step cutover run-book, a habit. Tickets sit in a four-level tree — **Area → Project (or sub-project) → Ticket → Sub-task** — carry a per-project key (`MYC-142`, `HOME-7`), GTD lists (Inbox, Next Actions, Waiting For, Someday, Logbook), and three **context facets** (Where / Tool / Time window) plus **story points**, so a "Now" view answers "what can I do right now, here, with what I've got?" Claude — Cowork, Claude Code, scheduled runs — reads and writes tickets through the API, creates them freely, and may close them **with evidence** (merge + deploy + smoke). The ticket DB is the canonical backlog; `claude/backlog.md` becomes a generated export. Non-technical users see Todo / Doing / Waiting / Done and the GTD lists; the rest is under the hood. Model: Things 3's mental model + Linear's discipline + the existing capture pipeline — deliberately not Jira.

---

## 1. Decision record (Phil, 2026-09-14)

| # | Decision | Notes |
|---|---|---|
| 1 | **One model.** Tickets absorb tasks (rows migrated, views kept), checklists (step lists / templates on a ticket), reminders (tickets with a fire time), habits (Q17) and venture_steps (Q24). | One table, one API, one UI. |
| 2 | **Fixed four levels:** Area → Project / sub-project → Ticket → Sub-task, plus checklist steps inside any ticket. | Sub-projects are real projects (own board, parent-linked) sharing the parent's key prefix and sequence (Q11). Enforced by trigger: a sub-project has no children; a sub-task has no children. |
| 3 | **Everlight work stays out.** | Personal projects and life only. |
| 4 | Other users: **partner, Kirsty, family/friends** via P12 team spaces. | Design for sharing from day one. |
| 5 | **Assignee + waiting-on.** One assignee per ticket (a member of the ticket's space) plus a `waiting_on_person_id` → People for the Waiting status. | |
| 6 | **DB canonical; `claude/backlog.md` becomes a generated, read-only export** written by the weekly run. | Every Claude session reads/writes through the API. |
| 7 | **Claude creates tickets freely into Inbox, moves them through any status, and may set Done when it has evidence** (merge + deploy + smoke). | Flag 1, §2. `verified_by` records Phil's live check separately. |
| 8 | **Statuses configurable per project, defaulting to the fixed set** Inbox → Backlog → Next → Doing → Waiting → Verify → Done / Cancelled. | Every status maps to a fixed **category**; lists, automation and the Now view bind to categories, never names (Flag 2). |
| 9 | Code "confirmed": **referencing commit/PR merged to main → Verify; successful production deploy + passing smoke → Done**, evidence written on the ticket. | |
| 10 | Life "confirmed": **evidence where possible + nudge.** Calendar match / forwarded receipt / Telegram reply → Claude proposes done; the scheduled-day check-in asks otherwise; manual tick always works. | |
| 11 | **Per-project key prefix** (`MYC-142`, `HOME-7`, `DSA-3`); sub-projects share the root's prefix. | Unprojected (Inbox) tickets use the space prefix (§17). |
| 12 | **Full GTD:** Inbox → Clarify (actionable? 2-minute rule / delegate / defer) → Next Actions / Projects / Waiting For / Someday-Maybe / Reference, plus a **guided Weekly Review**. | |
| 13 | **Three fixed context facets — Where, Tool, Time window — plus story points** (energy/effort as Fibonacci points). | Typed fields, exact filters. |
| 14 | Now view: **auto with one-tap override.** Device class + clock detected; Where is sticky per user; a chip row flips any facet. | |
| 15 | **Scheduled ("when") + Deadline**, either blank. | |
| 16 | **NOW score stays under the hood (FROZEN scoring untouched); users see one "urgent" flag.** | Contexts filter first, the score orders what's left. |
| 17 | **Recurring tickets; Habits folds in.** Two recurrence modes: `spawn` (each occurrence is a ticket row) and `series` (one ticket, many completions — habits). Heatmap and streaks move to `ticket_completions`. | Flag 5. |
| 18 | Capture: **straight to Inbox** from Telegram / iOS Shortcut; Claude fills project/contexts/dates as *suggested*; the review queue only when a capture would create a Person or Project. Attachments (return label, booking PDF) in a private `tickets` bucket. | |
| 19 | Rundowns: **on demand ("Plan this") + nightly for anything scheduled tomorrow without one.** Sonnet + web search for life tickets; code tickets are planned by Claude Code through the skill, not by the app. Monthly £ cap via `api_usage`. | |
| 20 | Templates: **authored in the UI ("Save as template") and by Claude as repo JSON; personal + team-shared.** | The checklists §3 definition shape is the template body. |
| 21 | Default views for new users: **GTD lists + Now as the home tab.** Kanban / table / calendar opt-in per user. | Phil keeps the seven views. |
| 22 | Nudges: **morning-briefing block (Phil), scheduled-day check-in (all users, tick / snooze / reschedule / not needed), weekly-review reminder (all users).** | Non-Phil users: web + push only (P12). |
| 23 | GitHub: **keys in commits + webhook + `tix` CLI + Claude Code skill, AND two-way GitHub Issues sync**, opt-in per repo. | Flag 3. |
| 24 | First import: **tasks + projects + backlog.md; reminders + habits + venture_steps; other projects' backlogs after a harvest pass in each.** Purchases/wishlist stay as Purchases. | |
| 25 | **First after cutover, everything in one stream, absorbing Checklists' slot.** Quotes and Day log follow. | Flag 4: one stream still means gated Parts. |
| 26 | Inbox (unprojected) tickets take the **space prefix** (personal default = initials, `PW-57`). **Amended 2026-09-23 (Cowork, 0135):** a space-keyed ticket is **re-keyed the first time it gets a project** with a prefix (`PW-14` → `DSA-3`); the old key is kept in `key_aliases` and keeps resolving everywhere (`/api/tickets/[key]`, ⌘K, `tix`, commit matching). After that, **keys are stable on move** between projects. `MYC-` is for the Mycelium project only. | Commit references keep resolving — through the live key or an alias. |
| 27 | Defaults: **check-in 18:00; weekly review Sunday 18:00** — per user in `ui_prefs`. | Before the Day log's 21:30 prompt. |
| 28 | **Where fixed** (anywhere / home / out / a Place); **Tool open** (chips none / phone / PC / car + free text). | |
| 29 | **Purchases stay separate, linkable both ways** — `ticket_links.kind = purchase`; a purchase can spawn a ticket. | Not imported. |
| 30 | Agent access (Da Boi tools list / create / move / plan) is **v1.1**, after the Now view and Clarify flow are verified live. | |
| 31 | GitHub **Issues sync off by default, enabled per repo**; the GitHub App is installed on every sporebit repo so keys and webhooks work everywhere. | Flag 3 applied. |
| 32 | AI rundown cap **£10/month** — alert at 80 %, stop at 100 %. | `api_usage` tag `tickets.rundown`. |
| 33 | **Story points shown as numbers for everyone**; no S/M/L labels. Energy chip = Low (≤2) / Normal (≤5) / All. | |
| 34 | **Full tree for everyone, Things-style** — areas and projects in the sidebar, sub-tasks on tickets. Simplicity comes from the lists and Now view, not hidden levels. | |
| 35 | Team space permissions: **areas and workflow edits = owner/admin; any member creates projects and tickets; viewers read.** | Matches P12 role defaults. |

---

## 2. Flags (raised once; complied with unless Phil reopens)

1. **Claude may close tickets (Q7/Q9) — this changes the recorded "done" rule** ("builds + tests + Phil verified live"). Resolution built in: `Done` = merged + deployed + smoke green, settable by automation with evidence links; **`verified_by` / `verified_at`** is Phil's live check, a separate field. The export renders unverified Done items as `done (unverified)`; the weekly-review wizard lists them. `claude/instructions.md`'s Backlog paragraph changes on ship (§16).
2. **Configurable statuses (Q8) would break automation and the GTD lists** if names were the contract. So: `ticket_statuses.category ∈ {inbox, backlog, next, doing, waiting, verify, done, cancelled}` is mandatory on every status; a project workflow may rename, recolour, reorder or add statuses, but every one belongs to a category and every category is present at least once. Next Actions = category `next`; Waiting For = `waiting`; automation moves by category.
3. **Two-way GitHub Issues sync (Q23) doubles the failure surface** (loops, conflicting edits, which side is canonical). Built with: tickets canonical; sync opt-in per project; ticket → Issue only when flagged (`sync_to_github`) or via "Open on GitHub", never for every ticket; Issue → Inbox ticket for issues opened on GitHub; state and title/body sync with a `github_synced_at` guard and our own bot login ignored on inbound (loop guard); comments one-way GitHub → ticket. Recommend leaving it off for solo repos — the webhook + keys path already does the useful work.
4. **"Everything in one go" (Q25) is a scope decision, not a build-structure one.** The stream is one branch (`tickets`) owning `supabase/migrations/**`, but it runs as gated Parts A–H (§15) — build gate + Phil live check between each. Expect 6–8 Claude Code sessions. Quotes and Day log wait; nothing else ships to main meanwhile.
5. **Folding Habits (Q17) risks the one-tap habit tile.** Kept: a Habits strip on Today showing today's `series` tickets with single-tap completion; the heatmap and streak table re-point to `ticket_completions`. History migrates from `daily_logs.notes` JSON — verify by count per habit before dropping the old read path.
6. **Renaming `tasks` → `tickets` is a large mechanical diff** (routes, `components/compost/`, `lib/compost/now-filter.ts`, Today surface, ⌘K). Mitigation: `/api/tasks/*` stay as thin re-exports of `/api/tickets/*` for one release; the FROZEN now-filter keeps its signature and is fed pre-filtered rows.
7. **Life evidence detection is weak in v1** — only Google Calendar matches and the forwarded-receipt path. The scheduled-day check-in is the real mechanism; don't oversell detection.

---

## 3. Concepts

### 3.1 Hierarchy

```
Area            (areas)          e.g. Mycelium · Home · Health · Ventures · Trips
└─ Project      (projects)       e.g. MYC · HOME · DSA ; has prefix, workflow, board
   └─ Sub-project (projects.parent_id)  e.g. MYC / PC monitoring — shares MYC-n keys
      └─ Ticket   (tickets)      MYC-142 "M4 temps/fans/power"
         └─ Sub-task (tickets.parent_id)  one level only
            · steps  (tickets.steps_definition / steps_state — checklist inside a ticket)
```

Areas are Things' "Areas of responsibility": permanent, never "done". Projects finish. A ticket with no project lives in the space's Inbox until clarified.

### 3.2 GTD mapping

| GTD list | Definition in the model |
|---|---|
| Inbox | category `inbox` (captured, unclarified) |
| Next Actions | category `next`, not blocked by an open dependency; sub-tasks: the first open one per ticket |
| Projects | `projects` with `status = active`; the Weekly Review flags any active project with no `next`/`doing` ticket |
| Waiting For | category `waiting` (+ `waiting_on_person_id`) |
| Someday / Maybe | `someday = true` (any category except done/cancelled; usually `backlog`) |
| Calendar | `scheduled_on` / `deadline_on` → Today / Upcoming |
| Reference | not a ticket — Clarify offers "Save as KB page" (P12 Phase 8) or a `ticket_links` URL on a project |
| Logbook | categories `done`, `cancelled` |
| Weekly Review | §8.4 wizard |

### 3.3 Contexts (Q13) — GTD's four filters

| Facet | Field | Values |
|---|---|---|
| Where | `where_ctx`, `place_id` | `anywhere` · `home` · `out` · `place` (→ `places`) |
| Tool | `tools text[]` | any-of: `none` · `phone` · `pc` · `car` · free text (e.g. `printer`, `drill`) |
| Time window | `time_window`, `time_from`, `time_to`, `days` | `anytime` · `office_hours` (Mon–Fri 09:00–17:00) · `evenings` (18:00–22:00) · `weekend` · `custom` |
| Energy / effort | `points smallint` | Fibonacci 1 · 2 · 3 · 5 · 8 · 13 |

Examples from Phil: Book MOT = anywhere / phone / office_hours; Upgrade PC = home / pc / anytime; Design garden fence = home / {pc, phone} / anytime.

---

## 4. Data model

All tables adopted with `app.adopt_table(...)` (P12 pattern: `space_id`, `created_by`, generated policies), registered in `lib/access/registry.ts` + `entity_groups` under section `organisation`, entity group **`organisation.tickets`** (replacing `organisation.tasks`). Owner-only shape where noted. Numbers assume main is at 0115 after cutover — renumber if not.

```sql
-- 0116_tickets_schema.sql

-- 4.1 Areas
create table if not exists public.areas (
	id          uuid primary key default gen_random_uuid(),
	name        text not null,
	colour      text,
	sort_order  int  not null default 0,
	archived_at timestamptz,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);

-- 4.2 Projects — EXTEND the existing 0014 table in place
alter table public.projects
	add column if not exists area_id             uuid references public.areas(id) on delete set null,
	add column if not exists parent_id           uuid references public.projects(id) on delete restrict,
	add column if not exists prefix              text,                -- null on sub-projects (inherit root)
	add column if not exists next_seq            int  not null default 1,
	add column if not exists workflow_id         uuid,                -- null = space default
	add column if not exists status              text not null default 'active'
		check (status in ('active','paused','done','archived')),
	add column if not exists github_repo         text,                -- owner/name
	add column if not exists github_issues_sync  boolean not null default false,
	add column if not exists sort_order          int not null default 0;
create unique index if not exists projects_prefix_per_space on public.projects (space_id, prefix) where prefix is not null;
alter table public.projects add constraint projects_prefix_shape check (prefix is null or prefix ~ '^[A-Z][A-Z0-9]{1,4}$');
-- trigger: parent_id must point at a root project (no grandchildren); sub-projects have prefix null

-- 4.3 Workflows and statuses (Q8)
create table if not exists public.ticket_workflows (
	id         uuid primary key default gen_random_uuid(),
	name       text not null,
	is_default boolean not null default false,
	created_at timestamptz not null default now()
);
create unique index if not exists ticket_workflows_one_default on public.ticket_workflows (space_id) where is_default;
create table if not exists public.ticket_statuses (
	id          uuid primary key default gen_random_uuid(),
	workflow_id uuid not null references public.ticket_workflows(id) on delete cascade,
	name        text not null,
	category    text not null check (category in ('inbox','backlog','next','doing','waiting','verify','done','cancelled')),
	colour      text,
	sort_order  int not null default 0,
	unique (workflow_id, name)
);
-- seed per space on creation: Inbox/inbox · Backlog/backlog · Next/next · Doing/doing · Waiting/waiting · Verify/verify · Done/done · Cancelled/cancelled
-- trigger: a workflow must contain every category at least once

-- 4.4 Tickets — RENAME tasks and extend
alter table public.tasks rename to tickets;
alter table public.task_comments rename to ticket_comments;
alter table public.task_activity rename to ticket_activity;
alter table public.tickets
	add column if not exists key                  text,                -- MYC-142; unique per space
	add column if not exists seq                  int,
	add column if not exists key_aliases          text[] not null default '{}', -- 0135: every earlier key (re-key on first project); GIN-indexed, each still resolves
	add column if not exists parent_id            uuid references public.tickets(id) on delete cascade, -- sub-task (already exists from 0004? keep whichever name; one column)
	add column if not exists kind                 text not null default 'task'
		check (kind in ('task','habit','reminder','runbook','test','guide','audit','setup')),
	add column if not exists status_id            uuid references public.ticket_statuses(id),
	add column if not exists someday              boolean not null default false,
	add column if not exists assignee_id          uuid references auth.users(id) on delete set null,
	add column if not exists waiting_on_person_id uuid references public.people(id) on delete set null,
	add column if not exists scheduled_on         date,
	add column if not exists deadline_on          date,                -- replaces due_date (backfill, keep due_date as generated alias for one release)
	add column if not exists remind_at            timestamptz,         -- reminders fold
	add column if not exists where_ctx            text not null default 'anywhere' check (where_ctx in ('anywhere','home','out','place')),
	add column if not exists place_id             uuid references public.places(id) on delete set null,
	add column if not exists tools                text[] not null default '{none}',
	add column if not exists time_window          text not null default 'anytime' check (time_window in ('anytime','office_hours','evenings','weekend','custom')),
	add column if not exists time_from            time,
	add column if not exists time_to              time,
	add column if not exists days                 smallint[],          -- 1..7, custom windows only
	add column if not exists points               smallint check (points in (1,2,3,5,8,13)),
	add column if not exists urgent               boolean not null default false,
	add column if not exists now_score            numeric,             -- computed by the FROZEN scorer, cached
	add column if not exists recurrence_rrule     text,                -- RFC 5545 RRULE
	add column if not exists recurrence_mode      text check (recurrence_mode in ('spawn','series')),
	add column if not exists series_id            uuid references public.tickets(id) on delete set null, -- spawn mode: the template occurrence
	add column if not exists rundown_md           text,
	add column if not exists rundown_generated_at timestamptz,
	add column if not exists rundown_model        text,
	add column if not exists steps_definition     jsonb,               -- checklists spec §3.1 shape (snapshot)
	add column if not exists steps_state          jsonb not null default '{"steps":{},"answers":{},"toggles":{}}'::jsonb, -- §3.2 shape
	add column if not exists template_id          uuid,
	add column if not exists suggested            jsonb,               -- Claude's guesses at capture: {project_id, where_ctx, tools, time_window, points, scheduled_on}
	add column if not exists source               text not null default 'ui' check (source in ('ui','telegram','shortcut','claude','github','import','recurrence','template')),
	add column if not exists sync_to_github       boolean not null default false,
	add column if not exists github_issue_number  int,
	add column if not exists github_issue_url     text,
	add column if not exists github_synced_at     timestamptz,
	add column if not exists verified_by          uuid references auth.users(id),
	add column if not exists verified_at          timestamptz,
	add column if not exists completed_at         timestamptz,
	add column if not exists cancelled_at         timestamptz,
	add column if not exists sort_order           int not null default 0;
create unique index if not exists tickets_key_per_space on public.tickets (space_id, key) where key is not null;
create index if not exists tickets_now_idx on public.tickets (space_id, status_id, scheduled_on, deadline_on);
create index if not exists tickets_project_idx on public.tickets (project_id, status_id);
create index if not exists tickets_series_idx on public.tickets (series_id) where series_id is not null;
-- triggers: (a) key = prefix || '-' || seq, prefix from root project or spaces.ticket_prefix, seq from that owner's next_seq, assigned on insert (0122).
--               Amended 0135 (2026-09-23): `key_aliases text[]` on tickets. On `update of project_id`, a ticket whose key still carries the SPACE
--               prefix (never project-keyed) takes the new root project's prefix + next seq; the old key is appended to key_aliases. A key is never
--               reused while it is live or an alias (one taker, tickets_take_key(), for both triggers). Once project-keyed, stable on every move.
--               Resolvers (fetchTicketByKey / resolveTicketRef, the ⌘K term search) match ticket_key OR key_aliases and prefer the live key.
--               One-off in 0135: every MYC-n outside the Mycelium project (79 unprojected incl. habits MYC-97…108, plus those in GARDN/SELL/MADRD) re-keyed, old key aliased.
--           (b) depth: parent_id may not point at a ticket that itself has parent_id;
--           (c) assignee must be a member of the ticket's space (team_members) or the space owner;
--           (d) completed_at set/cleared on category change to/from done.

-- 4.5 Evidence, attachments, links
create table if not exists public.ticket_links (
	id         uuid primary key default gen_random_uuid(),
	ticket_id  uuid not null references public.tickets(id) on delete cascade,
	kind       text not null check (kind in ('commit','pr','deploy','smoke','url','attachment','calendar_event','email','github_issue','purchase')),
	ref        text,          -- sha, PR number, deployment id, storage path, event id
	url        text,
	label      text,
	meta       jsonb,
	at         timestamptz not null default now()
);
create index if not exists ticket_links_ticket_idx on public.ticket_links (ticket_id, kind);

-- 4.6 Completions (series recurrence = habits; also every spawn occurrence writes one)
create table if not exists public.ticket_completions (
	id           uuid primary key default gen_random_uuid(),
	ticket_id    uuid not null references public.tickets(id) on delete cascade,
	completed_on date not null,                 -- Europe/London day
	completed_by uuid references auth.users(id),
	at           timestamptz not null default now(),
	unique (ticket_id, completed_on)
);

-- 4.7 Dependencies (blocks / blocked by)
create table if not exists public.ticket_dependencies (
	blocker_id uuid not null references public.tickets(id) on delete cascade,
	blocked_id uuid not null references public.tickets(id) on delete cascade,
	primary key (blocker_id, blocked_id),
	check (blocker_id <> blocked_id)
);

-- 4.8 Templates (Q20) — body is the checklists §3.1 definition plus ticket defaults
create table if not exists public.ticket_templates (
	id          uuid primary key default gen_random_uuid(),
	slug        text not null,
	name        text not null,
	kind        text not null default 'task',
	definition  jsonb not null,   -- {title, body_md, steps_definition, where_ctx, tools, time_window, points, project_id?, sub_tasks:[...]}
	shared      boolean not null default false,   -- visible to the whole space (team) vs creator only
	origin      text not null default 'ui' check (origin in ('ui','repo')),
	version     int not null default 1,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now(),
	unique (space_id, slug)
);

-- 4.9 Mentions (port of people-mentions on tasks)
alter table public.people_mentions rename column task_id to ticket_id;  -- if that is the column; check first

-- 0117_tickets_migrate.sql — see §13 (tasks rows, projects, reminders, habits, venture_steps, status backfill)
-- 0118_api_tokens.sql — see §14.4 (platform, owner-only)
```

Registry: `{ section: "organisation", group: "tickets", tables: ["areas","projects","ticket_workflows","ticket_statuses","tickets","ticket_comments","ticket_activity","ticket_links","ticket_completions","ticket_dependencies","ticket_templates"] }`; remove the old `organisation.tasks` group and the `reminders` group; `api_tokens` under `platform` owner-only. `npm test` (registry + isolation) must stay green.

`spaces.ticket_prefix text` + `spaces.next_seq int` are added for unprojected tickets (§17.1). `ui_prefs.now_context` holds each user's sticky Where/Tool/energy overrides (never localStorage, per the spec-index rule).

---

## 5. Now view (Q14) — the filter, then the FROZEN score

```
candidates = tickets in the user's accessible spaces
	where category in ('next','doing')            -- + 'backlog' when the "include backlog" chip is on
	and someday = false
	and (assignee_id is null or assignee_id = me)
	and (where_ctx = 'anywhere' or where_ctx = ctx.where or (where_ctx = 'place' and place_id = ctx.place_id))
	and (tools = '{none}' or tools && ctx.tools)  -- any-of
	and time_window_contains(now_london, time_window, time_from, time_to, days)
	and (ctx.max_points is null or points is null or points <= ctx.max_points)
	and not exists (open blocker in ticket_dependencies)
order by now_score desc, urgent desc, deadline_on nulls last, scheduled_on nulls last
```

`ctx` is resolved per request: **Tool** from device class (`navigator.userAgentData`/viewport: phone → `{phone}`, desktop → `{pc, phone}`) unless overridden; **Where** from `ui_prefs.now_context.where` (sticky, default `home`), overridable by one tap (Home / Out / Anywhere / a Place); **time** = Europe/London clock; **energy** chip = `max_points` (Low = ≤2, Normal = ≤5, All). `now_score` is produced by the existing `lib/compost/now-filter.ts` scorer, unchanged (FROZEN) — it receives the pre-filtered set; contexts never enter the score. `urgent` is a manual flag shown as one glyph.

The Now tab is the home tab for every user (Q21). A "Why is this here?" popover names the matching facets.

---

## 6. Statuses and workflows (Q8)

Each space gets a default workflow seeded with the fixed set. A project may point at another workflow in the same space. Non-technical rendering collapses categories: `inbox|backlog|next` → **Todo**, `doing|verify` → **Doing**, `waiting` → **Waiting**, `done|cancelled` → **Done**, with a "show detail" toggle in settings. Transitions are free (no state-machine lock) except: automation only moves *forward* by category order and never out of `done`/`cancelled`; entering `waiting` prompts for `waiting_on_person_id`; entering `done` on a `spawn` occurrence writes a completion and spawns the next occurrence; entering `done` on a `series` ticket is disallowed — completions are logged instead. The existing status machine (0024) is replaced by category rules; its transition log lives on in `ticket_activity`.

---

## 7. Automation and evidence

### 7.1 Code tickets (Q9)
- Commit messages carry keys (`MYC-142: …` or `[MYC-142]`); regex `\b[A-Z][A-Z0-9]{1,4}-\d+\b`.
- GitHub webhook → `POST /api/tickets/github` (HMAC `X-Hub-Signature-256` verified; secret name `GITHUB_WEBHOOK_SECRET`): `push` to the default branch and `pull_request.closed` (merged) → for each referenced ticket: `ticket_links` commit/pr rows; category `doing`/`next` → **Verify**.
- Vercel deployment webhook (`deployment.succeeded`, Pro plan) → `POST /api/tickets/vercel`: for tickets in Verify whose commit SHAs are contained in the deployed commit range → run the project's smoke check (`projects.smoke_url` GET expecting 200 + JSON `ok:true`; for Mycelium: `/api/health`) → **Done** with `deploy` + `smoke` links; `verified_by` stays null until Phil taps **Verified live**.
- Non-Vercel repos (DropShipAuto, Polysnipe): CI or Claude Code calls `tix move KEY done --evidence <url>`.
- Claude Code's own session-end report goes on the ticket as a comment through the skill (§14.2), not in chat scrollback.

### 7.2 Life tickets (Q10)
- **Scheduled-day check-in** (Q22): at the user's check-in time (default 18:00, `ui_prefs.tickets.checkin_time`) on `scheduled_on`, one push (Telegram for Phil) per open ticket with inline buttons **Done · Snooze (tomorrow) · Reschedule · Not needed**; replies map to done / scheduled_on+1 / a date picker link / cancelled. Batched into one message when >3.
- **Evidence** (v1): a Google Calendar event created after the ticket whose title shares ≥2 significant tokens with the ticket title within ±14 days of `deadline_on` → Claude comments "Looks booked — [event]. Done?" with buttons; a receipt parsed by the Receipts pipeline whose merchant matches a ticket title token → same. Forwarded-email detection is v2 (needs Resend inbound).
- Nothing auto-closes a life ticket without a button press.

---

## 8. Capture, nudges, recurrence, review

### 8.1 Capture (Q18)
`classifyCapture` gains intent `ticket` (short-circuit list: "add ticket", "todo", "remind me", "book", "call", "buy", "fix"…). Extraction (Haiku): title, `kind` (reminder if a time is given), `suggested` {project by prefix or name match, where/tools/time_window/points from verbs and nouns — "call" → phone + office_hours; "PC" → home + pc; "MOT" → anywhere + phone + office_hours}, scheduled/deadline from relative dates. Row lands in **Inbox** with `source = telegram|shortcut`; Telegram replies with the key and the guesses ("HOME-31 · anywhere · phone · office hours — reply `fix` to change"). Photos/PDFs in the same message → `ticket_links` attachment in the private `tickets` bucket (signed URLs, the receipts pattern). A capture that would create a Person (waiting-on) or a Project goes through the captures review queue as pending kind `ticket_link_person` / `ticket_new_project` — the standing rule (never auto-create a person) holds.

### 8.2 Nudges (Q22)
- **Morning briefing block (Phil):** today's scheduled + overdue + Verify-awaiting-verification, grouped by project, in the existing `/api/briefings/morning`.
- **Scheduled-day check-in (all users):** §7.2; web-push for non-Phil users.
- **Weekly Review reminder (all users):** one push at `ui_prefs.tickets.review_day/time` (default Sunday 18:00) linking to the wizard.
- Cron: `/api/cron/tickets-nightly` (cron-job.org, 02:00 London): spawn occurrences due within 7 days, generate missing rundowns for tomorrow's scheduled tickets (§9.1), recompute `now_score` cache; `/api/cron/tickets-checkins` every 15 min 17:00–22:00 (sends check-ins whose time has passed today); the reminders cron re-points at `kind = reminder` tickets.

### 8.3 Recurrence (Q17)
`recurrence_rrule` (RFC 5545, `rrule` npm) + `recurrence_mode`. **spawn**: the series ticket is a hidden template (`series_id` null, `kind` any, never shown in lists); the nightly job creates the next occurrence (`series_id` → template, `source = recurrence`) 7 days ahead or on completion of the previous one when the rule is `after_completion` (stored as `FREQ=DAILY;INTERVAL=n` + `meta.after_completion = true`). **series**: one visible ticket (habits: `kind = habit`, `FREQ=DAILY`); completing writes `ticket_completions`; the Habits strip, heatmap and streak table read completions. Habits config (`/api/habits-config`) becomes "create/edit a series ticket"; `/api/habits-history` and `/api/streak` read `ticket_completions`.

### 8.4 Clarify and Weekly Review (Q12)
**Clarify** (Inbox card stack, also the "Clarify" button on any ticket): Actionable? → **No**: Someday · Reference (save as KB page / add link to a project) · Bin. **Yes**: Under 2 minutes? → Do it now (marks done) · Delegate (assignee or waiting-on person) · Defer: accept/adjust the suggested project, contexts, points, scheduled/deadline → lands in Next (or Backlog if no date and not next). Multi-step? → Add sub-tasks or Convert to project.
**Weekly Review** (`/organisation/tickets/review`, sealed like `/review/[isoWeek]` — a block is added to that page per the Day-log pattern): 1 Inbox to zero · 2 Waiting For (each with a "message" action via the person's channels) · 3 Projects without a next action · 4 Someday (promote / keep / bin) · 5 Stale (no activity 21+ days) · 6 Done-unverified (Flag 1) · 7 The week ahead (deadlines, scheduled). Completing writes `review_runs` (existing table if present, else a `ticket_activity` row on a per-space review ticket).

---

## 9. Rundowns, steps, templates (Checklists absorbed)

### 9.1 Rundowns (Q19)
`POST /api/tickets/[key]/plan` → `rundown_md`. Life kinds: Sonnet with Anthropic web search (opening hours, the exact page to book on, documents needed, cost, a suggested sub-task list); prompt gets the ticket, contexts, project, related People and Places, the user's location (Doncaster) and today's date. Code kinds: **not generated by the app** — the Claude Code skill writes the plan as a comment with repo context. Nightly job generates for tomorrow's scheduled tickets lacking one (life kinds only). `api_usage` tag `tickets.rundown`; monthly cap default £10 with the Day-log-style alert; ≈£0.02–0.05 per life rundown. Regenerate button; rundown shown above steps.

### 9.2 Steps
`steps_definition` / `steps_state` are byte-for-byte the checklists spec §3.1 / §3.2 shapes — phases, steps with `where` chips, `blocks` with shell panes, `fields` (answer boxes), `{{key}}` substitution, route toggles, verify and why blocks, troubleshooting, links, an `actor` per step (Claude Code / You / Gate). A plain checklist is one phase of plain steps. PATCH merges per key (checklists §4). Claude reads answers with `tix answers KEY` or the API. `kind ∈ {runbook, test, guide, audit, setup}` tickets render the full house-style page; `task` tickets render steps as a simple list. The cutover run (`checklists/multi-user-cutover` in the artifact store) imports as ticket `MYC-<n>`, kind `runbook`, category done (§13).

### 9.3 Templates (Q20)
"Save as template" on any ticket copies title pattern, body, steps definition, contexts, points, sub-tasks into `ticket_templates` (`origin = ui`). Claude authors `docs/tickets/templates/<slug>.json` in the repo (`origin = repo`, synced by `scripts/sync-ticket-templates.ts` at build); e.g. `book-holiday`, `start-a-return`, `cutover-runbook`. "New from template" fills a ticket and its sub-tasks. `shared = true` templates are visible to everyone in the space (team); personal-space templates are the creator's.

---

## 10. Sharing (P12)

Tickets are `organisation.tickets`, grantable by team role and section toggle like the rest of Organisation. A team space has its own areas, projects, workflow, templates and Inbox. **Permissions inside a team (Q35):** areas and workflow/status edits = owner or admin; projects and tickets = any member; viewers read. Enforced in the API by role (RLS already scopes the space); the UI hides what the role can't do. Everyone sees the full tree (Q34). Assignee must be a member of the ticket's space (trigger, §4.4c); `waiting_on_person_id` must be a Person in the same space. Personal tickets never appear to anyone else (space isolation — the isolation test covers the new tables for free once registered). The Now view, sticky Where, check-in time and review day are per user (`ui_prefs`). Non-Phil users: web + push only; no Telegram, no AI rundowns unless the instance owner enables AI features for them (P12 open item A).

---

## 11. API (all via `createUserClient()`; RLS is the wall; token principals per §14.4)

| Route | Verb | Does |
|---|---|---|
| `/api/tickets` | GET | List with filters: `project`, `area`, `category`, `list=inbox|next|waiting|someday|today|upcoming|logbook`, `now=1` (+ `where`, `tools`, `max_points` overrides), `assignee`, `q`, `updated_since`; paginated. |
| `/api/tickets` | POST | Create (title required); `template`, `parent`, `project`, contexts, dates; returns the key. |
| `/api/tickets/[key]` | GET / PATCH / DELETE | Full row + links + completions summary + sub-tasks; PATCH any field; DELETE = cancel (soft). |
| `/api/tickets/[key]/move` | POST `{status|category, evidence?}` | Transition; automation callers pass `evidence` (links written first). |
| `/api/tickets/[key]/steps` | PATCH `{steps?, answers?, toggles?}` | Per-key JSONB merge (checklists §4). |
| `/api/tickets/[key]/comments` | GET / POST | Comments (markdown). |
| `/api/tickets/[key]/links` | POST | Evidence / attachment / url. |
| `/api/tickets/[key]/plan` | POST | Generate rundown (§9.1). |
| `/api/tickets/[key]/complete` | POST `{on?}` | Series completion (habits) or done for the rest. |
| `/api/tickets/[key]/verify` | POST | Sets `verified_by/at` (Phil's live check). |
| `/api/tickets/bulk` | POST | Whitelisted fields (status, project, contexts, dates, assignee), all-or-nothing, activity logged. |
| `/api/tickets/clarify` | GET | Inbox queue with suggestions. |
| `/api/tickets/review` | GET / POST | Weekly-review payload; POST seals it. |
| `/api/tickets/templates` (+`[slug]`) | GET / POST / PATCH | Templates. |
| `/api/tickets/export` | GET `?project=MYC&format=backlog-md|json` | Backlog export (§16). |
| `/api/tickets/github` · `/api/tickets/vercel` | POST | Webhooks (§7.1, §14.3). Public prefix, signature-verified. |
| `/api/projects` (+`[id]`), `/api/areas` | CRUD | Prefix, workflow, GitHub settings; area ordering. |
| `/api/tasks/*` | * | Thin re-exports of the above for one release (Flag 6). |
| `/api/cron/tickets-nightly` · `/api/cron/tickets-checkins` | GET | Bearer `CRON_SECRET`. |

Rate limiting via `lib/system/rateLimit` on writes. All routes honour `Authorization: Bearer mtk_…` (§14.4) as a user principal with scope checks, in addition to the session cookie and `API_SECRET` (acts as Phil).

---

## 12. Pages

- `/organisation/tickets` — **Now** (home tab; chip row: Where · Tool · Energy · Include backlog), then GTD tabs: Inbox (clarify stack) · Today · Upcoming · Next · Waiting · Someday · Logbook. Kanban / table / calendar opt-in (Settings → Tickets), preserved from the seven views. Habits strip on Today.
- `/organisation/tickets/[key]` — ticket page: header (key, project breadcrumb, status, assignee, waiting-on, dates, contexts, points, urgent), rundown, steps (house style for run-book kinds), sub-tasks, dependencies, links/evidence, comments, activity. Keyboard shortcuts (FROZEN list) unchanged; new: `c` contexts, `p` plan.
- `/organisation/tickets/review` — Weekly Review wizard (§8.4); a block on `/review/[isoWeek]`.
- `/organisation/projects` — areas as groups, projects as cards (progress, next action, prefix); `/organisation/projects/[id]` — board (columns = workflow statuses), sub-projects, templates, GitHub settings.
- Settings → Tickets: workflows (rename/add statuses within categories), default views, check-in time, review day, Where presets, AI rundown cap. Settings → Security → API tokens (§14.4).
- Today surface: NowBlock reads the Now query; the Journal/Habits card re-points to completions. ⌘K indexes keys and titles.
- Mobile: swipe right = done / complete, swipe left = reschedule sheet, long-press = bulk — as today.

---

## 13. Import (Q24)

`0117_tickets_migrate.sql` + `scripts/import-tickets.ts`:
1. **tasks → tickets** (rename, §4.4). Backfill: `deadline_on = due_date`; `status_id` from the old status via a mapping table (todo→Backlog, next/now→Next, doing→Doing, blocked→Waiting, done→Done, cancelled→Cancelled — confirm the 0024 status list first); `points` null; `where_ctx = anywhere`, `tools = {none}`; `key` assigned per project in `created_at` order; `parent_id` from the 0004 subtask column; comments/activity/mentions carried by the renames.
2. **projects**: existing rows in the live DB (not visible from Cowork — Claude Code lists them at the start of Part A) get a `prefix` and `area_id` from the map below, extended for anything the list adds; Phil confirms the additions in one multiple-choice round. **Proposed area / project / prefix map (2026-09-14, pending Phil's confirmation):**

| Area | Project (prefix) | Source / notes |
|---|---|---|
| Mycelium | **MYC** (root) with sub-projects, one per backlog stream: Multi-user P12 · Security/RLS · Repo hygiene · Loam & Glow v2 · Bugs · PTP import · Schema integrity · PC monitoring · Receipts · Desk device · Worktrees · June-era · Meta · Tickets · Quotes · Day log | `claude/backlog.md`; all share `MYC-n` keys; sub-projects are boards, mergeable later |
| Side projects | **DSA** DropShipAuto · **POLY** Polysnipe · **THRST** thirstmaxxing · **TRIPR** trip-research tool · **LOO** smart toilet | Claude projects / memory; if any already exists in `ventures`, the venture project is used instead (§13.6) |
| Home | **HOME** household life tasks (bedding, MOT, returns, doctors' calls) · **GARDN** garden & home improvement | HOME likely moves to the household team space when Phil's partner is onboarded (§17.7) |
| Tech & admin | **PC** PC hardware, builds, office/desktop set-up · **MAIL** email infrastructure migration · **SEC** domains + personal online security | Claude projects "Office Set Up", "Email Management", "Personal Online Security" |
| Health & fitness | **FIT** training-plan tasks (PTP, programme changes) · **HLTH** appointments, tests, prescriptions | Tasks *about* fitness/health; the data stays in those sections |
| Trips | **TRIPS** general · **MADRD** Ye – Madrid road trip (archived: July 2026 has passed) | New trips = new projects under the area |
| Creative | **CARDS** custom Pokémon cards / surprise-packs · **YAWN** yawn board game | |
| For others | **BASIS** Basis Holistics (Alex's brand) · **AKETN** Aketon Road land ownership (Jake G) · **GRAND** grandad's MP3s / playlist | Shareable later via team spaces or direct grants |
| Ventures (existing section) | one project per `ventures` row, prefix from the name at import | §13.6 |
| — not imported — | Everlight (Q3); superseded older Claude projects (FastAPI-era "Calendar Management", "Fitness Tracker App" — absorbed into Mycelium) | |

Personal space prefix **PW** for Inbox tickets (Q26; re-keyed to the project prefix on first project assignment, old key aliased — 0135). Prefix rule `^[A-Z][A-Z0-9]{1,4}$`, unique per space. **Map accepted as proposed (Q36, 2026-09-14).** Existing `projects` and `ventures` rows: Claude Code lists them with proposed prefix + area as the first step of Part A; Phil confirms in one multiple-choice round; then the import runs (Q37).
3. **backlog.md → tickets**: Cowork produces `docs/tickets/import/backlog-2026-09.json` (one object per bullet: sub-project by section, title = bold lead or first clause, body = the rest, status by prefix — idea→Backlog (+`someday` when "parked"/"idea"), committed→Next, in-progress→Doing, blocked→Waiting, done→Done with `verified_by` = Phil when the doc says verified — `source = claude` for `[claude]` items, notes → comments). The script inserts as Phil.
4. **reminders → tickets** `kind = reminder`, `remind_at`, category Next; the reminders cron re-pointed; old table dropped after a count check.
5. **habits → series tickets**: one per configured habit (`/api/habits-config` source), `FREQ=DAILY`; history from `daily_logs.notes` JSON into `ticket_completions` — assert counts per habit match before the old read path is removed.
6. **venture_steps → tickets** under a `Ventures` area, one project per venture (prefix from name), steps as tickets in order, done state carried; Founder agent tools re-pointed (`add_venture_step` → create ticket).
7. **Cutover run-book**: the artifact-store document → `docs/tickets/import/multi-user-cutover.json` (definition + state) → ticket `MYC-<n>`, kind `runbook`, Done, `verified_by` Phil.
8. **Other projects** (DropShipAuto, Polysnipe, garden, board game, trips…): Phil runs the harvest prompt in each Claude project with the addendum in §14.5; each produces the same JSON shape; imported under their own areas/prefixes.
9. Purchases/wishlist untouched (not selected).

Verification: row counts (tasks = tickets minus imports), zero tickets without `status_id` or `key`, every project has a prefix, `npm test` green, isolation test green, Phil opens Now / Inbox / a project board / a run-book ticket live.

---

## 14. Cross-project automation — "every project I use"

### 14.1 The contract
Every project Phil works on — repo or not — has a `projects` row (prefix, area, optional GitHub repo). Every Claude surface reads open tickets at session start and writes state at session end through the API. Life projects (garden, trips, home) get tickets from Telegram; code projects additionally get evidence from GitHub/Vercel. `claude/backlog.md`-style docs in other Claude projects are retired the same way once their import lands.

### 14.2 `tix` CLI + Claude Code skill
- `scripts/tix.mjs` in the Mycelium repo, published as `npx @sporebit/tix` (or copied into `~/.claude/skills/tickets/`): env `MYCELIUM_URL` and `MYCELIUM_TICKETS_TOKEN` (an `mtk_` token, §14.4 — value never in a repo or doc).
- Commands: `tix ls --project MYC --list next|doing|waiting` · `tix show KEY` · `tix new "title" --project MYC --kind task --where home --tools pc --points 3` · `tix move KEY verify --evidence https://github.com/…/commit/<sha>` · `tix done KEY --evidence <deploy-url>` · `tix comment KEY "…"` (session reports go here) · `tix answers KEY` (steps answers, checklists habit) · `tix steps KEY --tick 1.3 --answer team=sporebit` · `tix plan KEY --body-file plan.md` (code rundown written by Claude Code).
- **Global skill `tickets`** (`~/.claude/skills/tickets/SKILL.md`, so every repo has it): at session start run `tix ls` for the repo's project (prefix in the repo's `CLAUDE.md`: `Tickets project: MYC`); reference keys in every commit; before finishing, `tix comment` the report and `tix move` what changed; never `tix done` without an evidence URL; never create People.
- Cowork sessions in other Claude projects use the same API with a project-scoped token; the weekly Mycelium run exports backlog.md; the fortnightly nudge reads `updated_since` instead of the doc.

### 14.3 GitHub App / webhooks
One GitHub App ("Mycelium Tickets") installed on the sporebit repos: webhook events `push`, `pull_request`, `issues`, `issue_comment` → `/api/tickets/github`; permissions issues:write, metadata:read, contents:read. Vercel webhook per Vercel project → `/api/tickets/vercel`. Secrets named `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `VERCEL_WEBHOOK_SECRET` — recorded by name in `docs/tokens.md`. Issues sync rules per Flag 3; **off by default, `projects.github_issues_sync` per repo (Q31)**.

### 14.4 API tokens (replaces the single `API_SECRET` for tickets)
`0118_api_tokens.sql`: `api_tokens(id, user_id, name, token_hash, scopes jsonb, created_at, last_used_at, expires_at, revoked_at)` — `platform`, owner-only. Token shown once on creation (`mtk_` + 32 random bytes base62), stored as SHA-256. Middleware: `Authorization: Bearer mtk_…` → hash lookup → principal = that user with `scopes` `{projects: ["MYC","DSA"], verbs: ["read","write"], routes: ["tickets"]}`; a write outside scope is 403 and audited. Page: Settings → Security → API tokens (create / revoke / last used). `API_SECRET` continues to work for legacy routes; ticket routes accept both during the transition, then only tokens.

### 14.5 Prompts to keep (deliverables of Part H)
- **Global Claude instructions paragraph** (Phil's claude.ai settings): "Every project I work on has a ticket project in Mycelium (`MYCELIUM_URL`, token in my env, prefix in the project's CLAUDE.md or project doc). Read my open tickets for the project before starting; create tickets in Inbox for anything we agree to do; reference keys in commits; move tickets by category, never backwards; mark Done only with an evidence URL; put session reports in ticket comments, not chat; read checklist answers from the ticket, never from scrollback; every guide/test/run-book is a ticket with steps in the house style (actor, exact where, exact what, answer boxes, verify + why per phase). Questions to me are always multiple choice."
- **Repo `CLAUDE.md` snippet:** `Tickets project: <PREFIX> — use the tickets skill; keys in commits; report via tix comment.`
- **Harvest addendum** (append to `claude/harvest-prompt.md` for other projects): "Output every outstanding, in-progress or recently finished item as JSON `[{title, body, status: backlog|next|doing|waiting|done, someday, where_ctx, tools, time_window, points, scheduled_on, deadline_on, source: 'harvest'}]` grouped by sub-project; nothing invented; unknown fields null."
This supersedes the backlog "global-instructions prompt for checklists" item — checklists are tickets now.

---

## 15. Build plan — one stream, gated Parts (Q25, Flag 4)

Branch `tickets` (worktree), owns `supabase/migrations/**` after cutover; migrations 0116–0118 (renumber if main moved). Each Part: `rm -rf .next && npx next build`, `npm test` (registry + isolation), commit, push; Phil's live check where marked before the next Part starts.

| Part | Scope | Gate |
|---|---|---|
| A | Schema (0116), rename + compatibility routes, registry, seeds, key trigger, import script + 0117 (tasks, projects, backlog.md JSON, reminders, habits, venture_steps, cutover run-book) | Counts per §13; **Phil: Now / Inbox / board / run-book page open live with real data** |
| B | API (§11), Now query + chips + auto-detect, GTD tabs, ticket page, Clarify stack, non-technical rendering | Phil: clarify five Inbox items on the phone |
| C | Contexts UI, points, sticky Where, energy chip, ⌘K keys, Today NowBlock re-point, Habits strip + completions heatmap/streak | Habit counts match the old heatmap |
| D | Steps (checklists port, house style), templates (UI + repo sync), `book-holiday` / `start-a-return` / `cutover-runbook` templates | Phil: run a template end to end |
| E | Capture intent `ticket` (Telegram + Shortcut) with suggestions and attachments; check-ins; morning-briefing block; weekly-review reminder; crons | Phil: capture from Telegram, get the check-in, tap Done |
| F | Recurrence engine (spawn/series), rundown generation + nightly job + cap, Weekly Review wizard | Phil: one weekly review sealed |
| G | API tokens (0118), `tix` CLI, global skill, GitHub App webhook (push/PR → Verify), Vercel webhook + smoke → Done, Issues sync (opt-in) | A real MYC ticket closed by evidence from a Claude Code session |
| H | Sharing polish (assignee/waiting-on pickers, team templates), export → backlog.md, weekly-run rewiring, prompts (§14.5), spec docs, `docs/tickets/README.md` | Weekly run regenerates backlog.md; instructions updated (§16) |

Claude Code prompt (Part A; later Parts follow the same shape with their §):

```
Build Tickets Part A from claude/tickets-spec.md on branch tickets (worktree owns supabase/migrations/**):
1. Migration 0116_tickets_schema.sql exactly per §4 (areas; projects extended; ticket_workflows/ticket_statuses with the category constraint and per-space default seed; tasks→tickets rename + columns + indexes + the four triggers; ticket_links, ticket_completions, ticket_dependencies, ticket_templates; spaces.ticket_prefix/next_seq), all via app.adopt_table; registry organisation.tickets replaces organisation.tasks; npm test green.
2. Migration 0117_tickets_migrate.sql + scripts/import-tickets.ts per §13 steps 1–7 (read docs/tickets/import/*.json; run as Phil via withUser). Print the count assertions.
3. /api/tasks/* re-exported from new /api/tickets/* stubs (GET/PATCH parity only in this Part).
4. Build gate before every push. Report file paths, commit hashes and the count table; no code in the report; post the report with `tix comment` once Part G exists — until then, a file at docs/tickets/reports/part-a.md.
```

---

## 16. Rule and doc changes when Tickets ships

- `claude/instructions.md` **Backlog** paragraph → "The ticket DB is canonical (`/organisation/tickets`, project MYC). `claude/backlog.md` is a generated export (weekly run, `GET /api/tickets/export?project=MYC&format=backlog-md`) — never hand-edited. `Done` = merged + deployed + smoke green (automation may set it with evidence); `Verified` = Phil's live check (`verified_by`), shown as `done (unverified)` until then. Claude creates tickets in Inbox freely, tags its own as `source = claude`." Field text re-paste required.
- **Start of every conversation** → read `claude/context.md` + `tix ls --project MYC --list doing,next,waiting` (or the API) instead of backlog.md.
- Weekly run: rebuild context from the API; export backlog.md. Fortnightly nudge: `updated_since` query.
- `claude/checklists-spec.md`: header note "Superseded by `claude/tickets-spec.md` §9 (shapes retained)". Backlog Checklists section → done-by-absorption.
- `claude/spec-organisation.md`: Tasks section rewritten as Tickets; Habits section points at completions; Reminders (studio spec) folded.
- `claude/spec-platform.md`: capture intent `ticket`; API tokens under Identity & access; webhooks in the public-prefix list.
- The Meta item "global-instructions prompt for checklists" → delivered by §14.5.

---

## 17. Remaining assumptions (applied as defaults; say the word and they become a multiple-choice round)

1. Attachments bucket `tickets`, private, signed URLs, 10 MB per file.
2. Renamed compatibility routes (`/api/tasks/*`) removed one release after Part H.
3. Non-technical status collapse (§6) is a per-user toggle, on by default for new users, off for Phil.
4. Life rundowns only from the app; code plans only via the skill (§9.1).
5. `kind` vocabulary as §4.4; `purchase` is a link kind, not a ticket kind (Q29).
6. v1.1 (after Part H + live verification): Da Boi ticket tools (Q30); forwarded-email evidence; rundowns-at-creation per project.
7. **Decided (Q38):** when Phil's partner is onboarded, the **HOME** project and its tickets move into a household team space (prefix chosen then, e.g. `HH`); until then it lives in Phil's personal space. Moving a project between spaces re-keys its tickets (the one exception to stable keys — old keys redirect).

Decided in Q26–Q35 and folded into the sections above: space prefix + stable keys (§4.4 trigger a), check-in and review defaults (§8.2), Where fixed / Tool open (§3.3), purchases linkable (§4.5), Issues sync off by default (§14.3), £10 cap (§9.1), numeric points for everyone (§5), full tree for everyone and team permissions (§10).

---

## 18. Revision 2026-09-23 — statuses and "When" (Phil, Cowork; supersedes §6's default set, Q8's status names and Q16's urgent flag)

### 18.1 Decisions

| # | Decision |
|---|---|
| R1 | **One 12-status workflow for every space and surface** (Tickets and life Tasks alike), in this display / board order: Inbox · Selected for Development · In Progress · In Review · Testing · Waiting on 3rd Party · Waiting on my Decision · On Hold · Done · Closed · Backlog · Cancelled. |
| R2 | **Done vs Closed:** Done = shipped with evidence (merge + deploy + smoke, or a manual tick). **Closed = Phil verified it live** — moving to Closed sets `verified_by` / `verified_at`; the "Verified live" button becomes "Close". The export's `done (unverified)` = Done; Closed = verified. |
| R3 | **Waiting on my Decision is category `next`** — it shows in Now and Next Actions, because only Phil can unblock it. |
| R4 | The legacy `urgency` labels (today / this week / this month / someday) are **retired from tickets**. They are replaced by a **When** picker that always writes a date: **Within a week** (deadline = today + 7) · **Within a month** (today + 30) · **End of the month** (last day of the current month) · **On the weekend** (Phil picks a specific weekend from the next eight: `scheduled_on` = Saturday, `deadline_on` = Sunday) · **Someday** (`someday = true`, no dates) · **Pick a date**. Dates are Europe/London. The choice is stored in `tickets.due_window`; a window label never goes stale because the label is only shown while the date is in the future. |
| R5 | **Overdue is a flag, not a status.** `deadline_on < today (London)` and category not `done` / `cancelled` → a red **OVERDUE** pill replaces the window label on rows, board cards, the ticket page, Now and ⌘K; an Overdue count in the counts endpoint and the morning briefing. |
| R6 | **Calendar: scheduled dates only.** Deadline windows (week / month / end of month) never create a calendar event; `scheduled_on` does (existing `syncTicketToGoogle`). A weekend pick sets `scheduled_on`, so it reaches the calendar — as an all-day Sat–Sun event. Blocked in practice until Google is reconnected (MYC-147). |
| R7 | **Existing urgency labels re-dated from `created_at`** (open tickets without a `deadline_on`): today → created date, this_week → +7, this_month → +30, someday → `someday = true`. Phil chose the honest version: old items show Overdue immediately. |
| R8 | **The manual `urgent` flag is removed** from the UI; the column stays, reset to false so it no longer orders Now invisibly. The FROZEN NOW scorer does not read `urgency` or `urgent` and is untouched. |

### 18.2 Status → category map (automation, Now and GTD lists bind to categories, §2 Flag 2)

| Status | Category | Legacy `status` | Category default? |
|---|---|---|---|
| Inbox | inbox | new | ✓ |
| Selected for Development | next | new | ✓ (was "Next") |
| In Progress | doing | in_progress | ✓ (was "Doing") |
| In Review | verify | review / pending_review | ✓ (was "Verify") — GitHub merge lands here |
| Testing | verify | testing | |
| Waiting on 3rd Party | waiting | waiting_third_party / blocked | ✓ (was "Waiting") |
| Waiting on my Decision | next | new | |
| On Hold | backlog | on_hold | |
| Done | done | completed | ✓ — Vercel deploy + smoke lands here |
| Closed | done | completed | set by "Close" (verified) |
| Backlog | backlog | new | ✓ |
| Cancelled | cancelled | cancelled | ✓ |

**Why a category-default flag is needed:** `ticket_status_for(space, category)` picks the lowest `sort_order`, so with the new order a derived `backlog` would resolve to **On Hold** (sort 7) before **Backlog** (sort 10). Add `ticket_statuses.is_category_default boolean` (one per workflow + category, partial unique index) and resolve by it. Also: legacy `status` → a **specific status**, not just its category (on_hold → On Hold, testing → Testing), so the finer values survive the 0117 sync trigger.

### 18.3 Build (migration 0137, branch `tickets`, which owns `supabase/migrations/**`)

- **0137_status_when_revision.sql:** rename in place per workflow (ids kept, so every ticket keeps its status): Next → Selected for Development, Doing → In Progress, Verify → In Review, Waiting → Waiting on 3rd Party; insert Testing, Waiting on my Decision, On Hold, Closed; set `sort_order` per R1; add + backfill `is_category_default`; update `ticket_status_for` and the 0117 trigger's legacy mapping; update the per-space seed function so new spaces get the 12. Move Done tickets with `verified_by` set → Closed. Add `tickets.due_window text check (due_window in ('week','month','month_end','weekend','someday','date'))`. Backfill per R7. `urgent = false` everywhere. RLS unchanged (no new tables). Replay on the local stack first; `supabase db push`.
- **Code:** `lib/tickets/when.ts` (pure: window → dates in London, the weekend list, `isOverdue(t, today)` on `deadline_on ?? due_date` excluding done/cancelled; unit tests incl. month-end and a Saturday/Sunday "today"); a `WhenPicker` used by the ticket page, the Clarify defer panel, the bulk bar and the new-ticket form; an `OverduePill`; replace every urgency select/pill on the tickets and tasks surfaces; `POST /api/tickets` stops defaulting `urgency = 'this_week'`; `PATCH` accepts `due_window` and derives the dates server-side; the "Close" button + `/verify` moves to Closed; briefings HOT logic, `lib/blockers.ts` and `KeyBlockers` re-point from `urgency === 'today'|'this_week'` to overdue / due within 7 days; counts gain `overdue`; Google sync gives a weekend pick a Sat–Sun all-day span. Purchases keep their own `urgency` (separate table, untouched). The `urgency` column stays for one release, unwritten.
