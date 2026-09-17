# Checklists — guides, test runs and any tick-box exercise, stored in Mycelium

> **Superseded by `claude/tickets-spec.md` §9 (2026-09-17).** The §3 shapes survive byte-for-byte as `tickets.steps_definition` / `steps_state`, the per-key merge as `PATCH /api/tickets/[key]/steps`, and the house-style page as the render for `kind ∈ {runbook, test, guide, audit, setup}` (`components/tickets/StepsPage.tsx`). Nothing below is built as a standalone table.

*Written 2026-09-11 from Phil's instruction: "I want all checks to be stored forever. Link it to the projects database in a new table for guides and testing and any other time you could think we need to go through a checkbox exercise. I want it to be a payload that stores all the ones that we've done or not done. I also want to be able to add answers into some of the boxes if it needs info. If something later in the page needs the info from the response or Claude Code / Cowork needs the response they can read it from the database directly. Make sure links are available every opportunity." Status: **spec agreed in principle; build after cutover** (see "Why not now").*

---

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | One table, `checklists`, **one row per run**. The step definition is embedded in the row as a snapshot; the state (ticks, answers, toggles) is a second JSONB column. | A run is self-contained: one `select` gives Claude everything. Re-running a test plan later is a new row with the definition it was run against, not a pointer to a definition that has since changed. |
| 2 | Definitions are authored as files in the repo, `docs/checklists/<slug>.json`, and snapshotted into the row when a run starts. | Claude Code writes them like any other doc; they are versioned with the code they test; the page never depends on a file at render time. |
| 3 | Registry placement: section `platform`, group **`checklists`** — owner-only shape like the rest of platform. | Checklists carry infrastructure detail (project refs, hosts, env-var names). Widening to team-shareable later is a policy change, not a schema change. |
| 4 | The page lives in the app at `/other/checklists/[slug]`, not as an artifact. | An artifact page cannot call Mycelium's API (CSP blocks every fetch). Inside the app the page uses the session and RLS like everything else. |
| 5 | Claude reads state through the same API with `API_SECRET` (acts as Phil), or by SQL through the service path a session already uses. Never a special read endpoint. | One access path, already fenced and audited. |
| 6 | The house style is the v2 cutover artifact ("Mycelium Cutover", 2026-09-11): dark technical, sticky TOC with per-phase counts, numbered step cards with a linked "where" chip, copy buttons, PowerShell/Git Bash toggle, `{{key}}` substitution of answers into commands and links, verdict + comparison table, prerequisites/time/cost box, inline security notes, a verification block and a "why this works" aside per phase, a troubleshooting table, a links section. | Phil's stated preferences (memory `/preferences.md`, how-to section). The React port must reproduce it, not reinterpret it. |

### Why not now

The first checklist to store — the cutover run-book — is being executed **against the database that would hold it**, while that database is being migrated and the app redeployed. So the cutover run keeps its state in the artifact's own store (document `checklists/multi-user-cutover`, one JSON payload in exactly the shape below), and is **imported into the table after cutover** as its first row. Every checklist after that starts life in the table.

Adding the table before cutover is also blocked by two invariants: one worktree owns `supabase/migrations/**` (the `multi-user` branch), and the registry test fails on any table not in `entity_groups` — so the table must be a registered migration on that branch or a numbered one after 0115, and a session with a build gate must ship it.

---

## 2. Data model

```sql
-- 0116_checklists.sql (number after whatever main carries at the time)
create table if not exists public.checklists (
	id                 uuid        primary key default gen_random_uuid(),
	slug               text        not null,
	kind               text        not null check (kind in ('guide', 'runbook', 'test', 'audit', 'setup')),
	title              text        not null,
	definition         jsonb       not null,          -- snapshot, see §3
	definition_version int         not null default 1,
	state              jsonb       not null default '{"steps":{},"answers":{},"toggles":{}}'::jsonb,
	status             text        not null default 'open' check (status in ('open', 'done', 'abandoned')),
	started_at         timestamptz not null default now(),
	completed_at       timestamptz,
	updated_at         timestamptz not null default now(),
	-- space_id + created_by are added by app.adopt_table('checklists', null, null) in the same migration,
	-- which also registers the table and generates its policies (P12 pattern).
	constraint checklists_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);
-- one open run per slug per space
create unique index if not exists checklists_one_open_per_slug
	on public.checklists (space_id, slug) where status = 'open';
create index if not exists checklists_space_updated_idx on public.checklists (space_id, updated_at desc);
```

Registry: add `{ section: "platform", group: "checklists", tables: ["checklists"] }` to `lib/access/registry.ts` and the matching `entity_groups` row; `lib/access/registry.test.ts` and the isolation test then cover it for free. Owner-only policy shape (`space_id = app.personal_space()`), `user_grants` already refuses `platform`.

`updated_at` is maintained by the API on every write (a trigger is fine too; the app already has `set_updated_at`-style helpers if one exists — check before adding).

---

## 3. Payload shapes

### 3.1 `definition` (snapshot of `docs/checklists/<slug>.json`)

```json
{
	"slug": "multi-user-cutover",
	"kind": "runbook",
	"title": "Mycelium Cutover",
	"version": 2,
	"toggles": {
		"route": {"label": "Route", "options": {"staging": "Staging rehearsal", "direct": "Straight to cutover"}, "default": "staging"},
		"shell": {"label": "Shell", "options": {"ps": "PowerShell", "bash": "Git Bash"}, "default": "ps"}
	},
	"values": [
		{"key": "dump", "label": "Backup folder", "placeholder": "A:\\Backups\\mycelium\\2026-09-11"},
		{"key": "team", "label": "Vercel team / account slug"}
	],
	"intro": {"verdict_html": "…", "comparison": {"columns": [], "rows": []}, "changes_html": [], "prerequisites": [], "time": [], "cost": []},
	"phases": [
		{
			"id": "1", "title": "Hosted configuration", "lede_html": "…",
			"steps": [
				{
					"id": "1.3",
					"title": "Site URL and redirect allow-list",
					"where": {"label": "Supabase → Authentication → URL Configuration", "url": "https://supabase.com/dashboard/project/vokfwbkwuccikordcnxz/auth/url-configuration", "kind": "dashboard"},
					"route": null,
					"body_html": "<p>…</p>",
					"blocks": [
						{"label": "Redirect URLs — two entries", "text": "https://mycelium.sporebit.com/**\nhttps://*-{{team}}.vercel.app/**"},
						{"label": "dump", "shells": {"ps": "cd A:\\Projects\\Mycelium\n…", "bash": "cd /a/Projects/Mycelium\n…"}}
					],
					"fields": [{"key": "vercel_plan", "label": "Vercel plan", "placeholder": "Hobby / Pro"}],
					"notes": [{"kind": "security", "html": "…"}]
				}
			],
			"verify_html": ["…"],
			"why_html": "…"
		}
	],
	"rollback_html": "…",
	"troubleshooting": [{"symptom": "…", "cause": "…", "fix": "…"}],
	"links": [{"label": "…", "url": "…", "note": "…"}]
}
```

Rules: `where.kind` ∈ `dashboard | terminal | claude-code | browser | page | decision`; a step whose `where.url` is set renders the chip as a link. `{{key}}` in any `text`, `shells.*`, `where.url` or `links[].url` is substituted from `state.answers` (with `values[].placeholder` as the fallback), and a link whose substitution still contains `<…>` points at the values step instead of 404ing. Blocks with `shells` show the pane for the current `shell` toggle. Steps with `route` set are hidden unless the toggle matches, and are excluded from counts.

`*_html` fields are trusted content authored by Claude in the repo and reviewed by Phil; sanitise on render anyway (`DOMPurify` or the app's existing sanitiser).

### 3.2 `state`

```json
{
	"toggles": {"route": "staging", "shell": "ps"},
	"steps": {"1.1": {"done": true, "at": "2026-09-12T10:03:41.120Z"}},
	"answers": {"team": "sporebit", "c_tasks": "1234", "vercel_plan": "Hobby"}
}
```

Ticks carry the time they were ticked. Unticking deletes the key (the row's `updated_at` still moves). Answers are strings, keyed by `values[].key` or `fields[].key`. This is byte-for-byte the shape the cutover artifact stores today (it also carries `slug`, `kind`, `title`, `definition_version`, `updated_at` at the top level — drop those on import; they are columns).

---

## 4. API (all through `createUserClient()`; RLS is the wall)

| Route | Verb | Does |
|---|---|---|
| `/api/checklists` | GET | List runs in the caller's space: slug, title, kind, status, started_at, done/total counts (route-aware). |
| `/api/checklists` | POST `{slug}` or `{definition}` | Start a run: snapshot `docs/checklists/<slug>.json` (read server-side from the repo bundle — `import` the JSON or read from `docs/` at build time) into a new row; 409 if an open run for the slug exists. |
| `/api/checklists/[slug]` | GET `?run=<id>` | The open run (default) or a specific one. Returns the full row. |
| `/api/checklists/[slug]` | PATCH `{steps?, answers?, toggles?}` | **Merge per key** (`jsonb` deep merge on `state`, null deletes a key), set `updated_at`. Two tabs then cannot clobber each other's ticks. Rate-limited like other writes. |
| `/api/checklists/[slug]/complete` | POST | `status = done`, `completed_at = now()`. Idempotent. |
| `/api/checklists/[slug]/abandon` | POST | `status = abandoned`. |

Claude's read path is the same GET with `Authorization: Bearer <API_SECRET>` (middleware → `principal: system` acting as Phil), e.g. from Claude Code: `curl -s -H "Authorization: Bearer $API_SECRET" https://mycelium.sporebit.com/api/checklists/multi-user-cutover | jq .state.answers`. From a session with the local stack: `select state->'answers' from checklists where slug = 'multi-user-cutover' and status = 'open';`.

---

## 5. Pages

- `/other/checklists` — list, newest first, progress bars, kind chips, "Start" from the definitions present in `docs/checklists/`.
- `/other/checklists/[slug]` — the run. Port of the v2 artifact's structure and CSS to the app's v2 primitives (dark technical is already the app's look; use the existing `Button`, cards and mono token rather than a second style sheet). Client-side state mirrors the row; writes are debounced PATCHes; a `onSnapshot`-equivalent is not needed — poll `updated_at` every 30 s or use Supabase Realtime on the row if the app already subscribes elsewhere.
- Nav: under Other → Settings → "Checklists" (owner-only, like Platform).

---

## 6. Import of the cutover run

After cutover: Cowork reads the artifact document (`checklists/multi-user-cutover`) and writes two files to the repo — `docs/checklists/multi-user-cutover.json` (the definition, extracted from the v2 page) and `docs/checklists/runs/multi-user-cutover.2026-09.json` (the state). Claude Code inserts the row with `scripts/import-checklist.ts <definition> <state> --status done` running as Phil (`withUser(PHIL_UID)`), and the artifact is kept read-only as the historical copy.

---

## 7. Claude Code prompt (run after cutover, on main)

```
Build the checklists feature from claude/checklists-spec.md as one Part on main:
1. Migration <next number>_checklists.sql exactly per §2, using app.adopt_table so space_id/created_by/policies follow the P12 pattern; register platform.checklists in lib/access/registry.ts and entity_groups; npm test must stay green (registry + isolation).
2. API routes per §4 with per-key JSONB merge on PATCH, rate limiting via lib/system/rateLimit, and the API_SECRET read path working unchanged.
3. Pages per §5, porting the structure and behaviour of the v2 "Mycelium Cutover" artifact (docs/checklists/multi-user-cutover.json is the definition; treat it as the reference render) — TOC with counts, linked where-chips, copy buttons, shell toggle, {{key}} substitution into commands and links, route filtering, fields, verify and why blocks, troubleshooting table, links.
4. scripts/import-checklist.ts and the import of docs/checklists/runs/multi-user-cutover.2026-09.json as the first row, status done.
5. docs/checklists/README.md: how to author a definition (§3.1 rules) and how Claude reads answers (§4).
Build gate before every push. Report file paths and commit hashes; no code in the report.
```

---

## 8. For the global-instructions prompt (backlog; write once the format is finalised)

What it must encode, so any project produces the same thing: every guide/test/tick-box exercise is a checklist page in the house style (§1 row 6); every step states exactly where (linked) and exactly what (command/query/value/prompt, with a `cd` at the top of terminal blocks and both shells where they differ); steps that need information get answer boxes; state lives in that project's own database as `{steps, answers, toggles}` with timestamps, or in the artifact store only when the project's database is the thing being changed; later steps and Claude read answers from the store, never from chat scrollback; verdict first, comparison table, prerequisites/time/cost, security notes inline, a verification block and a "why this works" aside per phase, troubleshooting, links; delivered as a shareable link and a standalone HTML file.
