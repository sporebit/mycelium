# Day log (Journal v2) — feature spec

*Written 2026-09-14 from Phil's 30-answer design round. Status: **committed, builds after cutover on `main`** as one build stream in five parts (§12); migration numbered after 0115 and after whatever starts first — checklists, quotes or this. **Replaces the 0003 Journal.** Section: Journal (top-level nav, as today). Every decision below is Phil's unless marked `[claude]`; flags raised once are in §11; the three answers that needed interpreting are in §2.1.*

---

## 1. What it is

Every evening Mycelium opens a conversation — on Telegram, or on the day's page in the app — and interviews Phil about the day: where he went, who with, what they ate and drank, what was memorable, what it cost. It digs deeper when there is more to dig into, asks "who's Max?" the first time a name appears, never asserts facts about the world, and closes with a line of 1–5 scores (mood, energy, sleep, productivity by default) that is asked every night even when the interview is skipped. The conversation is stored verbatim; a narrative summary is the readable journal entry; structured facts are extracted **per turn** (so later probes are grounded in what was already said) and, at close, become pending entities in the captures review queue. Approved facts accumulate on People: days together, facts learned in passing, places and food shared, milestones and quotes.

What it is for (decision 1, all four): **People pages**, **life-log search** (`/api/ask`, ⌘K), **agent context** (The Boys know what Phil has been doing), **weekly/yearly review**.

Why it replaces the old journal rather than sitting beside it: one canonical record of a day. The 0003 entries migrate in (§4.5).

## 2. Decisions (2026-09-14)

| # | Area | Decision |
|---|---|---|
| 1 | Consumers | People pages · life-log search · agent context · weekly/yearly review — all four in v1. |
| 2 | Floor | Three modes per night — see §2.1. Skipping is fine; no nagging. |
| 3 | Depth | **Mycelium decides from what Phil said** (a long, multi-scene message earns more probes; a short one earns fewer), within the turn cap (decision 23) and the minimum probes of full mode. |
| 4 | Existing journal | **Replace it.** `/journal` re-pointed at the new day rows; 0003 entries migrated (§4.5). |
| 5 | Channel | **Both**: Telegram for the nightly conversation; the app page `/journal/[date]` for reading back, editing, continuing the conversation and reviewing extractions. Same engine, two transports, one transcript. |
| 6 | Trigger | **Fixed time + snooze.** Default 21:30 Europe/London (setting). "later" or the Snooze button re-prompts in 60 min (setting). Nothing after 03:00 — the day closes as `skipped`. |
| 7 | Missed days | **Full catch-up**: the next prompt interviews yesterday first, then today. Any past day can be opened on demand ("log Saturday", or the date page in the app). The catch-up prompt carries the same Quick/Skip buttons, so a skipped day can be closed in one line. |
| 8 | Input | **Text + Telegram voice notes (existing Whisper path) + photos.** Replies are text. |
| 9 | Style | **Slot schema, editable in Settings, plus open-ended follow-ups** — see §2.1. |
| 10 | Tone | **One of The Boys** runs it. Which agent is undecided (§10); default Da Boi `[claude]`. Reactions never repeat within a night; no "sounds amazing" filler. |
| 11 | World facts | **Never assert.** It asks, it never tells. No web search anywhere in the loop. |
| 12 | Seeds | **Calendar events, Spotify + media, Apple Health + weather.** Not transactions/receipts (bank lag). |
| 13 | Storage | **Transcript (immutable) + narrative summary + structured facts.** |
| 14 | Fact types | People + places · food/drink/spend · events + milestones · mood/energy/health — all four. |
| 14a | Scores | **Every night, whatever the mode, a set of 1–5 scores** — mood, energy, sleep (last night), productivity by default; the list is a setting ("etc etc"). Added by Phil mid-session 2026-09-14. |
| 15 | Structure | **Scenes.** A day = ordered scenes (Quayside → beach → arches → pod), each with place, people, slots, narrative. |
| 16 | Extraction timing | **Per turn** (delta extraction, Haiku), so facts-so-far can steer the next probe. Pending entities are generated once, at close. |
| 17 | People writes | **Review queue for everything**: person links, new people, facts, place links. Nothing reaches People unreviewed. Consistent with Quotes decision 9. |
| 18 | Unknown names | **Ask once, in the chat** ("Who's Max?"). The answer becomes the pending person's note. Never asked again for that name (name → answer stored on the day, then on the pending person). |
| 19 | Per person | Days together (count, first/last seen, scene timeline) · facts + preferences · places + food together · milestones + quotes (quotes routed into the Quotes pipeline as pending kind `quote`). |
| 20 | Surface | **People detail → "Days" tab**, next to the planned Quotes tab. No Today card in v1. |
| 21 | Models | **Sonnet for the conversation, Haiku for extraction.** Sonnet also writes the close-of-day narrative `[claude]` (one call; it is the thing Phil reads back). Ids in `lib/config/models.ts`. |
| 22 | Context per turn | **Seeds + facts-so-far + one-line person cards** (name, relationship, last seen) for anyone mentioned. Not last-7-days summaries, not full person files. |
| 23 | Guardrail | **Nightly turn cap** (setting, default 15 model turns) with a graceful close, **plus a monthly £ alert** from `api_usage` (setting, default £5) sent once via Telegram. |
| 24 | Continuity | **At most one carry-over.** Extraction may flag one `open_thread` per day; a later night may ask about it once, then it is cleared. |
| 25 | Editing | **Transcript immutable; summary, scenes and facts editable** on the day page. Edited rows carry `edited_by_user = true` and re-extraction never overwrites them. |
| 26 | Visibility | **Space-scoped (`space_id`/`created_by`), grantable later, plus person↔user linking**: a People row can be linked to another Mycelium user, who then sees the scenes they were part of (decision 30). |
| 27 | Others' sensitive detail | **Extract everything.** If Phil said it, it is a fact on that person's record. See §11 flag 2. |
| 28 | Photos | **Attach to the scene by timing, no vision.** Private bucket, signed URLs. Captions optional, typed by Phil. |
| 29 | v1 scope | **Everything decided here, one build stream** — delivered in five parts (§12) so each is buildable and testable. |
| 30 | Linked user sees | **Scene basics only**: date, place, participants' names, the scene narrative, photos marked shareable. Never facts — about them or anyone else. |

### 2.1 Interpretations `[claude]` — confirm or correct

- **Decision 2 (answered "2, 3 and 4")** is read as three modes per night, offered as Telegram inline buttons on the prompt: **Talk** (full interview: minimum three probes, then Sonnet judges depth), **Quick** (a three-field template reply — `who / where / one line` — recorded as a single-scene day with no follow-ups and no LLM chat turn; extraction still runs once), **Skip** (day closed as `skipped`, nothing else tonight). Ignoring the prompt = Skip at 03:00.
- **Decision 14a ("always ask")** is read as: the scores are the true floor. Talk and Quick end with the score line; **Skip asks for the scores and nothing else** (one message, digits in order — no LLM call). Ignoring the prompt still records no scores. `sleep` means last night's sleep, asked in the evening.
- **Decision 9 (answered "all of them")** is read as: a **slot list in `user_settings`** (default: where · who · ate/drank · cost · memorable · anything else) drives the required probes per scene; the model may add **open-ended follow-ups** beyond the slots; "pure schema" is what Quick mode is. Not every slot is asked every scene — a slot already answered in passing is not re-asked (facts-so-far is how the model knows).
- **Decision 7 with decision 2:** full catch-up only when Phil presses Talk on the catch-up prompt; Quick/Skip close the missed day in one step.

## 3. Data model

```sql
-- one row per user-day; the transcript is append-only (API never rewrites it)
create table daylog_days (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references spaces(id) on delete cascade,
	created_by uuid references auth.users(id) on delete set null,
	day date not null,                          -- Europe/London calendar date
	status text not null default 'pending'
		check (status in ('pending', 'prompted', 'open', 'closing', 'closed', 'skipped')),
	mode text check (mode in ('talk', 'quick', 'legacy')),
	persona_agent_id uuid,                      -- The Boys agent used tonight (FK to the agents table; confirm name)
	transcript jsonb not null default '[]',     -- [{role, at, text, channel, media_id}] append-only
	summary text,                               -- narrative, editable
	summary_edited_by_user boolean not null default false,
	extraction jsonb not null default '{}',     -- working state, patched per turn (§5.3); frozen at close
	extraction_version int not null default 1,
	seeds jsonb,                                -- what was injected at prompt time (audit + replay)
	scores jsonb not null default '{}',         -- {"mood": 4, "energy": 3, "sleep": 5, "productivity": 2} — keys from settings, values 1–5 (check via a small validator function)
	open_thread text,                           -- at most one carry-over (decision 24)
	open_thread_asked_at timestamptz,
	turn_count int not null default 0,          -- model turns tonight (cap: decision 23)
	cost_pence numeric(8,2) not null default 0, -- snapshot from api_usage for this day
	prompted_at timestamptz,
	snoozed_until timestamptz,
	last_activity_at timestamptz,
	closed_at timestamptz,
	legacy_journal_id uuid,                     -- 0003 row this was migrated from
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (space_id, created_by, day)
);

create table daylog_scenes (
	id uuid primary key default gen_random_uuid(),
	day_id uuid not null references daylog_days(id) on delete cascade,
	position int not null,
	title text not null,                        -- "Quayside, fish and chips"
	place_id uuid references places(id) on delete set null,
	place_text text,                            -- as said, before/without a Places link
	time_hint text,                             -- "lunch", "~14:00", "evening" — never a fabricated timestamp
	narrative text,                             -- per-scene, editable; what a linked user sees
	narrative_edited_by_user boolean not null default false,
	hidden_from_linked boolean not null default false,  -- [claude] safety valve, §11 flag 2
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index daylog_scenes_day on daylog_scenes (day_id, position);

-- who was in a scene; rows exist only after review approval (decision 17)
create table daylog_scene_people (
	scene_id uuid not null references daylog_scenes(id) on delete cascade,
	person_id uuid not null references people(id) on delete cascade,
	primary key (scene_id, person_id)
);
create index daylog_scene_people_person on daylog_scene_people (person_id);

-- approved facts (decision 14); pending ones live in the review queue, not here
create table daylog_facts (
	id uuid primary key default gen_random_uuid(),
	day_id uuid not null references daylog_days(id) on delete cascade,
	scene_id uuid references daylog_scenes(id) on delete set null,
	kind text not null check (kind in
		('food', 'drink', 'spend', 'event', 'milestone', 'person_fact', 'place_fact', 'media', 'health', 'other')),
	subject_person_id uuid references people(id) on delete set null,  -- whose fact (Kirsty: tap water); null = Phil's
	text text not null,                         -- human-readable, one line
	data jsonb,                                 -- {item, amount_pence, currency, who_paid, venue, rating, ...}
	confidence text not null default 'stated' check (confidence in ('stated', 'inferred')),
	edited_by_user boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index daylog_facts_day on daylog_facts (day_id);
create index daylog_facts_person on daylog_facts (subject_person_id) where subject_person_id is not null;
create index daylog_facts_text_trgm on daylog_facts using gin (text gin_trgm_ops);

create table daylog_media (
	id uuid primary key default gen_random_uuid(),
	day_id uuid not null references daylog_days(id) on delete cascade,
	scene_id uuid references daylog_scenes(id) on delete set null,
	storage_path text not null,                 -- private bucket `daylog`
	taken_at timestamptz,                       -- Telegram message time; EXIF if present
	caption text,
	shareable boolean not null default false,   -- decision 30
	created_at timestamptz not null default now()
);

-- decision 26: link a People row to another Mycelium user
alter table people
	add column linked_user_id uuid references auth.users(id) on delete set null,
	add column linked_at timestamptz;
create unique index people_linked_user on people (space_id, linked_user_id) where linked_user_id is not null;
```

Rules:
- RLS per the post-P12 pattern on all five tables (enable + restrictive deny-all + service_role grant, then the real policies via `app.accessible_spaces`); register entity group **`journal.daylog`** (all five tables; `daylog_media` follows the day). Use the same adoption helper as checklists/quotes; confirm the name against `docs/multi-user-handoff.md`.
- **Linked-user read policy** (decision 30), RLS-native so it cannot leak through a route bug:
	```sql
	create policy daylog_scenes_linked_select on daylog_scenes for select to authenticated
	using (
		not hidden_from_linked
		and exists (
			select 1 from daylog_scene_people sp
			join people p on p.id = sp.person_id
			where sp.scene_id = daylog_scenes.id and p.linked_user_id = auth.uid()
		)
	);
	```
	Same shape on `daylog_scene_people` (rows of a visible scene) and `daylog_media` (`shareable and` scene visible). **No** such policy on `daylog_days` or `daylog_facts` — a linked user never sees the day row, the transcript, the summary, or any fact. Participant names come through the existing People read path the viewer already has (their own People rows), else display the name text only.
- `transcript` is append-only: the API exposes `POST …/messages`, never a PATCH on `transcript`. `extraction` is writable only by the extraction step until `closed_at`, then frozen (re-extraction bumps `extraction_version` and never overwrites `edited_by_user` rows).
- Settings live in `user_settings.daylog` jsonb: `{enabled, prompt_time: "21:30", snooze_minutes: 60, cutoff: "03:00", turn_cap: 15, min_probes: 3, slots: [...], scores: ["mood", "energy", "sleep", "productivity"], persona_agent_id, seeds: {calendar, spotify, media, health, weather}, monthly_alert_pence: 500}`. Behaviour, not UI → `user_settings`, not `ui_prefs`. Adding a score key in Settings starts it appearing the next night; old days simply lack it.
- Daily boundary Europe/London everywhere (existing rule).
- Per-person aggregates are a **view**, not stored: `people_daylog_stats(person_id, days_together, first_seen, last_seen)` over approved `daylog_scene_people` joined to `daylog_days`.

## 4. Flow

### 4.1 Prompt (cron)
- cron-job.org hits `/api/cron/daylog` (Bearer `CRON_SECRET`) **every 15 minutes between 20:00 and 03:15 Europe/London**. No LLM call in this route. It: creates today's `daylog_days` row if missing (`pending`); when `prompt_time` (or `snoozed_until`) is reached and status is `pending`, gathers seeds (§4.2), sends the Telegram prompt with inline buttons **Talk · Quick · Skip · Snooze**, sets `prompted`; closes `open` days idle > 2 h (§4.4); marks `prompted`/`pending` days `skipped` at the cutoff. If yesterday is `skipped` (or never created), the prompt says so and offers the same buttons for yesterday first (decision 7).
- The prompt text is a template plus the seeds, e.g. *"Evening. Calendar had **Whitby** today, 14 km walked, dry and 17°. Talk, Quick or Skip?"* — no LLM needed to write it.

### 4.2 Seeds (decision 12)
Queried at prompt time, stored on `seeds`, injected into the system context and quoted in the opener: calendar events for the day (`events`), Spotify plays (top 3 tracks/artists of the day), media items whose status changed today, Apple Health steps/sleep (once the import is live — degrade silently), weather summary (`/api/weather` cache). Budget: ≤ 400 tokens; each source is a setting toggle.

### 4.3 Conversation (Talk mode)
- **Transport**: Telegram webhook and the app page both call the same `runTurn(dayId, message)` in `lib/daylog/engine.ts`. **Telegram routing rule** (§11 flag 4): while the user's day is `open` (or `prompted` and the message is a button press / first reply), inbound text, voice and photos route to the day log; the existing capture path is reached with a `/c ` prefix or after `done`. Voice notes go through the existing Whisper path (`/api/capture-audio` internals, reused, not duplicated); failures reply in Telegram and keep `file_id`, per the existing rule.
- **Model call (Sonnet)**: system prompt = persona base (the chosen Boy's system prompt, reused from `lib/ai/`) + the day-log rules block (below) + the slot list; cache breakpoint after this static block (must exceed ~1024 tokens to cache — pad with the rules, not filler). Then the transcript so far (cached incrementally — breakpoint on the previous assistant turn), then a final user-side block with **facts-so-far + person cards + seeds** (dynamic, uncached, ≤ 1.5k tokens). Output ≤ 120 tokens.
- **Rules block** (the prompt is the product; tune here):
	1. Ask one question per turn. Never assert anything about the world, places, dates or people that Phil did not say tonight; if unsure, ask.
	2. Probes follow the slot list per scene; skip slots already answered (see facts-so-far). After the slots, at most one open-ended follow-up per scene.
	3. Depth from richness: a message with several scenes or strong feeling earns more probes; a flat one-liner earns the minimum (`min_probes`) then the close.
	4. Unknown name (not in person cards, not answered tonight) → ask "who's X?" once, then move on.
	5. No repeated reaction words within a night; no praise filler. One short acknowledgement at most, then the question.
	6. If `open_thread` from a previous day is present and not yet asked, ask about it once, early.
	7. Close when Phil says done/stop, when the cap is hit, or when nothing is left: one line recapping the scenes, then the **score line** — the configured keys in order, e.g. "mood / energy / sleep / productivity, 1–5?" The reply "4 3 5 2" is parsed by the engine, not the model (digits in key order; a partial reply gets 1–5 buttons for the missing keys; words like "four" are accepted).
- **Per-turn extraction (Haiku, delta)** runs after each of Phil's messages, before the Sonnet call, so the probe is grounded: input = compact `extraction` JSON so far + the last exchange; output = a **patch** (tool-use with a strict `input_schema`): `{scenes: [{ref, title, place_text, time_hint, people: [names], upsert: true}], facts: [{scene_ref, kind, subject, text, data, confidence}], unknown_names: [], name_answers: {Max: "Kirsty's dog"}, open_thread?, mood?, energy?, sleep_quality?, quotes: [{text, speaker}]}`. Merged server-side by `ref`. Nothing here touches People — it is working state.
- **Turn cap**: at `turn_cap − 1` the rules block tells the model to close; the engine refuses further model calls for the day and replies with a fixed "that's tonight's lot — the day page has the rest" line.

### 4.4 Close
Triggered by done/stop, the cap, or 2 h idle (cron). Steps, in `after()` + a cron sweep for robustness `[claude]`:
1. `status = closing`. **Sonnet** writes the day narrative and one line per scene from the transcript (one call, ~3k in / ~500 out), with the instruction *"only what Phil said; no adjectives he didn't use"*.
2. Scenes inserted from `extraction` (structural rows, no review); place text resolved against Places by name — a match links `place_id`, no match leaves `place_text` and creates a **pending place** (review).
3. **Pending entities** (existing review path, `entity_review_rules`), one per item: `daylog_person_link` (known alias → person, per scene), `daylog_new_person` (with the name answer as note), `daylog_fact`, `daylog_place`, `quote` (into the Quotes pipeline unchanged). Approval inserts the `daylog_scene_people` / `daylog_facts` rows, creates the person via the existing People path, links the place.
4. `scores` saved on the day row (Health reads them — they are Health facts kept with the day, §11 flag 9). A day is never `closed` without the score line having been sent; a missing reply leaves `scores` empty and the day closes at the cutoff.
5. Summary + facts text embedded into the existing memory index (`/api/memory` machinery, 0002) so `/api/ask` and ⌘K find the day. Weekly review reads days by ISO week. Agent context diet: the last 3 day summaries, capped at ~300 words total, for the persona agent and Da Boi only.
6. `cost_pence` snapshotted from `api_usage` rows tagged `daylog:<day_id>`. Monthly total checked; alert once when it crosses `monthly_alert_pence`.
7. Telegram reply: the recap + a link to `/journal/<date>` + "N items to review".
8. `status = closed`.

Quick mode: the template reply is parsed by one Haiku extraction call into a single scene, then the score line; steps 2–8 run; no Sonnet narrative (the one line *is* the summary). **Skip mode**: the score line only, then `skipped` with `scores` filled — zero LLM calls.

### 4.5 Migrating the 0003 journal
Claude Code reads migration 0003 and the `/journal` code first. Each legacy entry → one `daylog_days` row (`day` from its timestamp in Europe/London; `mode = 'legacy'`; `transcript = [{role: 'user', text}]`; `summary` = its AI summary; `legacy_journal_id`); voice audio references preserved on `daylog_media` if they exist as files. Two entries on one day → the later one appended to the same transcript. The old table is kept for one release and dropped in a follow-up migration; old `/api/journal/*` routes are retired and the dashboard "Journal" card in the registry re-pointed (grep for both).

## 5. API (all through `createUserClient()`; RLS is the wall)

| Route | Verb | Does |
|---|---|---|
| `/api/journal/days` | GET `?from=&to=&status=` | Day list, newest first, with scene count, people, mood/energy, cost. |
| `/api/journal/days/[date]` | GET | Day + scenes + approved people/facts + media (signed URLs) + pending count. Creates the row if missing (`pending`). |
| `/api/journal/days/[date]` | PATCH | Whitelist: `summary`, `scores` (validated 1–5 against the configured keys), `open_thread`. Sets the matching `edited_by_user`. Never `transcript`/`extraction`. |
| `/api/journal/scores` | GET `?from=&to=&key=` | Score series for charts (Health and the weekly review read this). |
| `/api/journal/days/[date]/messages` | POST `{text \| media}` | Append + run a turn (app transport). Returns the reply. |
| `/api/journal/days/[date]/close` | POST | Force close (§4.4). |
| `/api/journal/days/[date]/reextract` | POST | Re-run extraction on the frozen transcript (bumps `extraction_version`; skips `edited_by_user` rows). |
| `/api/journal/scenes/[id]` | PATCH / DELETE | `title, place_id, place_text, time_hint, narrative, hidden_from_linked, position`. |
| `/api/journal/facts/[id]` | PATCH / DELETE | `kind, subject_person_id, text, data, scene_id`. |
| `/api/journal/media/[id]` | PATCH / DELETE | `caption, scene_id, shareable`. |
| `/api/journal/shared` | GET `?from=&to=` | **As the viewer**: scenes visible through `linked_user_id` (decision 30). Powers the "with Phil" cards on the viewer's own day pages. |
| `/api/people/[id]/days` | GET | Stats (view) + scene timeline + person facts + places/food together + milestones. |
| `/api/people/[id]/link` | POST `{user_id}` / DELETE | Link/unlink a People row to a Mycelium user **who shares a team with the caller** (§11 flag 3). |
| `/api/cron/daylog` | POST (Bearer `CRON_SECRET`) | §4.1 + the close sweeper. |
| `/api/telegram/webhook` | — | Existing route; gains the day-log routing rule (§4.3) and the four callback buttons. |

Claude's read path is the same GETs with `API_SECRET`, as for checklists and quotes. CSV/text export of a date range (`/api/journal/export`) uses headers without underscores and `YYYY-MM-DD HH:MM:SS` datetimes `[claude]`.

## 6. Pages

- **`/journal`** — day list (month groups, newest first): date, scene titles, people chips, score dots, cost, pending-review badge; a **scores strip** at the top (30-day sparkline per key — the one chart this feature gets). "Log a past day" opens any date.
- **`/journal/[date]`** — the day page. Top: narrative summary (editable). Then the **scene cards** in order: title, place chip (→ Places), people chips (→ People), photos strip, per-scene narrative (editable), approved facts grouped by kind, `hidden from linked` toggle. Below: the **scores row** (one 1–5 control per configured key, editable). Then the **conversation**: full transcript, read-only, with a composer that continues it while the day is `open` (same engine). Pending extractions for this day link to the review page. Legacy days render the same way with a "migrated from the old journal" note.
- **People detail → Days tab** (decision 20): stats header (days together, first/last seen), scene timeline (date · place · one line), facts + preferences (with the source day link), places + food together (grouped by place), milestones, and the link/unlink control (§5). People list rows get `days_together` next to the planned quote count.
- **Captures review** — new pending kinds render as cards: person link (scene + matched person, or picker), new person (name + Phil's answer), fact (kind chip + text + subject), place (text + Places search), quote (existing card).
- **Settings → Journal panel**: enabled, prompt time, snooze, cutoff, turn cap, min probes, slot list (reorderable), **score keys** (reorderable; default mood · energy · sleep · productivity), persona agent picker, seed toggles, monthly alert.
- Loam & Glow v2 primitives; Journal keeps its existing accent; no new stylesheet.

## 7. Cost model `[claude]` — back-of-envelope, list prices, 12-exchange Talk night

| Piece | Model | Tokens / night | ≈ per night |
|---|---|---|---|
| Conversation | Sonnet | ~17k uncached in, ~45k cached in, ~0.7k out | $0.07–0.10 |
| Per-turn extraction ×12 | Haiku | ~12k in (schema cached), ~1.8k out | $0.02 |
| Close narrative | Sonnet | ~3k in, ~0.5k out | $0.015 |
| Quick-mode extraction | Haiku | ~1k in | <$0.005 |
| Voice notes (3 min) | Whisper | — | $0.02 |
| Embedding + seeds + cron | — | negligible | — |
| **Total, Talk every night** | | | **≈ $0.13–0.16 → £3–4/month** |

Realistic mix (four Talk, two Quick, one Skip a week): **£1.50–2.50/month**. The one-line lever if that ever matters: point the conversation at Haiku in `lib/config/models.ts` (≈ £1/month all-in). What would blow it up: full person files per turn (×3), web search (banned), per-turn Sonnet extraction (×5). All three are excluded by decisions 11, 16, 21, 22.

## 8. Tests

- Unit: `mergePatch` (scene `ref` upsert, fact dedupe, `edited_by_user` untouched on re-extract); slot-skip logic (answered slots not re-asked); turn-cap close; Europe/London day boundary at 00:30 BST; Quick-mode template parse; **score-line parse** ("4 3 5 2", "4,3,5,2", "four three", partial → buttons, out-of-range rejected); the linked-select policy (a viewer sees exactly the scenes their person is in, nothing hidden, no facts, no day rows).
- Route tests: PATCH whitelists (transcript rejected); `messages` refuses when `closed`; cron is 401 without the bearer; `/api/journal/shared` returns 0 rows for an unlinked user; `link` refuses a user who shares no team.
- Isolation: the standard per-endpoint isolation script covers every new route — plus the **cross-user positive case** (a linked user sees the shared scene and only that).
- Prompt regression: a fixture transcript (Phil's Whitby night, §9) replayed through the extraction; assert scenes = 4, people = {Kirsty, Max}, unknown_names = {Max} on turn 1 and empty after the answer, one milestone, no world facts in any assistant turn.
- Manual (Phil, live): one full night on Telegram end to end — prompt with seeds, voice note, photo, "who's Max?", close, recap link, review queue, approve, Days tab shows it; one Quick night; one Skip + next-night catch-up; one linked-user check from a second account.

## 9. Example night (target behaviour, Da Boi voice)

> **M** 21:30 — Evening. Calendar had **Whitby**, 14 km walked, dry, 17°. *[Talk] [Quick] [Skip] [Snooze]*
> **P** Went to Whitby with Kirsty and Max. Quayside for fish and chips, walk down to the beach, tried to see the whale arches but they were missing, then a pod in Staintondale.
> **M** Four scenes, got it. Who's Max?
> **P** Kirsty's dog.
> **M** Right. Quayside first — what did you each have?
> **P** Cod and chips with mushy peas; Kirsty had a bowl of chips and half my cod with curry sauce. Tap water — she reckons restaurant tap water tastes different.
> **M** Noted, that's going on her record. Who paid, and roughly what?
> **P** Me, about £30.
> **M** Beach — anything worth keeping?
> **P** Max had a great time. I sat on a rock and watched them from a distance.
> **M** And the arches being missing — what did you do instead?
> **P** Photos at the top of the hill. Kirsty soft-launched us with one of them.
> **M** That's a milestone; logged. The pod — where exactly, and was it any good?
> **P** Staintondale, a glamping pod. Decent. Done.
> **M** Whitby with Kirsty and Max: Quayside, beach, the hill, pod in Staintondale. Mood / energy / sleep / productivity, 1–5?
> **P** 5 3 4 1
> **M** Closed. mycelium.sporebit.com/journal/2026-09-13 — 9 items to review.
>
> *Skip night:* **M** 21:30 — Evening. Nothing on the calendar. *[Talk] [Quick] [Skip] [Snooze]* → **P** taps Skip → **M** Mood / energy / sleep / productivity, 1–5? → **P** 3 2 4 4 → **M** Logged.

Note what it does not do: it never says the arches were removed in 2024 (decision 11); it does not react with "sounds amazing" three times; it asks about the beach once and moves on.

## 10. Open decisions (Phil)

1. **Which Boy** runs it (decision 10). Default Da Boi `[claude]`; a dedicated agent row is the alternative if his other duties pollute the voice.
2. Default prompt time — 21:30 assumed.
3. Initial slot list — `where · who · ate/drank · cost · memorable · anything else` assumed.
4. Whether `days_together` should count Quick-mode days (assumed yes — a scene is a scene).
5. The initial score keys beyond mood · energy · sleep · productivity — stress, social, pain are the obvious candidates; fewer is better for nightly compliance.

## 11. Flags raised once `[claude]`

1. **Per-turn extraction + review-for-everything = live grounding, lagging record.** Probes are grounded tonight, but "last seen Kirsty" on her page only moves when the pending link is approved. If the queue backs up, the Days tab lies by omission. The pending badge is the safety net; an auto-approve rule for *known-alias person links only* is the obvious relief valve if it becomes a chore.
2. **"Extract everything" about others + linked users.** Decision 30 keeps facts off the shared surface, and the RLS policy makes that structural, not a route convention. What it does not cover: People exports, `/api/ask` answers, and agent replies could surface a fact about Kirsty to a future *granted* teammate. Keep `journal.daylog` **ungranted** until there is a real need, and treat `daylog_facts` as owner-only even if scenes are ever granted.
3. **Linking without consent.** Setting `linked_user_id` pushes Phil's scenes onto another user's pages. Mitigation in §5: only a user who already shares a team with the caller can be linked — team membership is the consent step; no new invite flow.
4. **Telegram routing ambiguity.** The bot already takes captures, reminders and shopping lists; a reply to the journal and a capture look identical. The open-window rule (§4.3) plus the `/c ` escape is the smallest fix; expect one or two misroutes while the habit forms. The app composer has no such ambiguity.
5. **Everything in one build.** Decision 29 skips the free prototype. The prompt (§4.3 rules) will need tuning in production instead; keep the rules block in a file, not inline code, so tuning is a text edit and a redeploy, not a rebuild. Parts in §12 keep each stage shippable.
6. **Persona memory, and other users.** `agent_memory` is one row per agent and Phil-only. The persona must not store day-log facts there — the day tables are the record; the agent only *reads* the last 3 summaries via its context diet. Corollary: The Boys stay Phil-only under P12, so if a second user (a linked Kirsty, say) ever switches the day log on, `persona_agent_id` is null for them and the engine falls back to a plain interviewer prompt — the rules block must stand on its own without a Boy's system prompt in front of it.
7. **Full catch-up doubles the load exactly after a skipped night.** Survivable only because the catch-up prompt carries Quick/Skip (§2.1). If catch-up nights get skipped too, the backlog compounds — the cutoff-skip rule stops it at one day.
8. **Sonnet vs "as cheap as possible".** £3–4/month is not expensive; the Haiku fallback is a one-line change (§7). Recorded so the choice is deliberate, not drift.
9. **Scores are Health facts stored on a Journal row.** Health surfaces read them via `/api/journal/scores`. If Health ever gets its own daily-check-in table, migrate rather than double-enter. Also: four self-reported 1–5s every night is a dataset that only pays off if the keys stay stable — renaming a key in Settings should migrate old values, not orphan them.
10. **Journal replacement touches more than the journal.** The dashboard card registry, `/api/ask` memory index, the weekly review and possibly the morning briefing reference the old journal. Claude Code greps for `journal` across `app/`, `components/`, `lib/` before Part A and lists every touchpoint in the PR.

## 12. Build parts (one branch `daylog`, one migration, five parts; each builds, tests and is verifiable live)

- **Part A — loop + transcript + summary + scores.** Migration (§3, all tables; linked-user policy included but unused until E), 0003 migration (§4.5), `lib/daylog/engine.ts`, Telegram routing + buttons, cron route, Sonnet conversation with the rules block, close narrative, the score line in all three modes + `/api/journal/scores`, `/journal` + `/journal/[date]` (transcript, summary, scores row, sparkline strip), Settings panel, `api_usage` tagging. Verifiable: a full night end to end with no extraction, and a Skip night that records scores only.
- **Part B — extraction + review.** Per-turn Haiku delta extraction, scenes at close, pending kinds in the review queue, `daylog_facts`/`daylog_scene_people` on approval, quotes hand-off, re-extract route, scene/fact editing on the day page, Quick mode.
- **Part C — People.** `people_daylog_stats` view, `/api/people/[id]/days`, the Days tab, list-row count.
- **Part D — seeds, photos, guardrails, continuity.** Seed queries + toggles, photo intake to the `daylog` bucket + scene attach + strip, turn cap + monthly alert, `open_thread` carry-over, memory-index embedding, weekly review block, agent context diet.
- **Part E — linked users.** `people.linked_user_id`, `/api/people/[id]/link` (team check), `/api/journal/shared`, the "with Phil" cards, `hidden_from_linked` + `shareable` toggles, the cross-user isolation test.

### 12.1 Part B as built (2026-09-21) `[claude]`

Shipped on `tickets` → `main` as `7ce1514` `4c8a1cf` `660e5bb` `05dc074` `d6d3bcf` `3a1544c`, migrations **0129** and **0130**. Production smoke 50/50 (a Talk night and a Quick night on test days, cleaned up after): ~3.1p a Talk night with extraction, ~0.2p a Quick night. Phil's live check is the `smoke-test-daylog-part-b` template.

Where the code lives: `lib/daylog/extraction.ts` (pure — `mergePatch`, `sameFact`, `collapseScenes`, `parseQuickTemplate`, `pendingItems`, the tool schema and the extraction prompt; unit-tested, including the §9 night as a patch fixture), `lib/daylog/extract.ts` (the Haiku calls, person cards, the grounding block), `lib/daylog/materialise.ts` (close steps 2–3), `lib/daylog/approve.ts` (what an approval writes), `lib/daylog/rows.ts` (the day page read model). The interviewer's rules gained a "context block" section in `lib/daylog/rules.md`.

Deviations from the text above, each deliberate:

1. **The pending kinds live in `pending_entities`**, not as captures: 0129 widens its `entity_type` check with `daylog_person_link`, `daylog_new_person`, `daylog_fact`, `daylog_place`. Rows carry no `capture_id`; `additional_data` holds `{day_id, day, key, …}`. They surface on Capture review → New entities, grouped by day (`?tab=entities&day=<day id>`). Quotes alone go through captures: a `source = daylog` quote capture at low confidence, so the Quotes pipeline is unchanged.
2. **One who-was-there item per person per day**, carrying the list of scenes — not one per scene (§4.4 step 3). Four scenes with two people would otherwise be eight identical approvals (flag 1).
3. **"Approve N as proposed"** on each day group clears who-was-there links and facts in one go; new people and places always need a decision.
4. **Per-scene narrative costs no extra call**: the close narrative already ends with one bullet per scene; the bullets are assigned to scenes only when their count equals the scene count, else scenes start without a narrative.
5. **Re-extract is additive only.** It never updates or deletes a scene or a fact, edited or not — stronger than "skips `edited_by_user` rows". New scenes and new review items are added; item keys make it idempotent; a scene deleted by hand is not resurrected.
6. **Facts dedupe fuzzily** (`sameFact`: ≥ 75% of the shorter fact's content words, same subject). Without it a re-extract re-queued reworded copies of facts already reviewed.
7. **Quick mode**: the `who / where / one line` parse is deterministic and stands on its own; the one Haiku call only adds facts, and the result is collapsed to the single scene Quick is defined as.
8. A bare "done" skips the extraction call (nothing new to read).
9. Person cards are name + relationship; "last seen" waits for Part C's `people_daylog_stats`.
10. The `hidden_from_linked` toggle is accepted by `PATCH /api/journal/scenes/[id]` but not shown on the card until Part E.
11. The narrator filter (`I / me / we / Phil`) hard-codes the name "Phil"; a second user's own name would not be filtered. Revisit with Part E.

**§3 correction — the linked-user policies as written above recurse.** The `daylog_scenes` policy reads `daylog_scene_people` and the `daylog_scene_people` policy reads `daylog_scenes`; Postgres applies policies inside policy subqueries, so every statement on either table failed with "infinite recursion detected in policy" — including the owner's own inserts. Part A never touched scenes, so it surfaced with Part B's first close. **0130** replaces the subqueries with `app.daylog_scene_visible_to_linked(scene_id)` (SECURITY DEFINER, the 0110 pattern); the rule is unchanged. Part E should build on that function, not on the SQL in §3.

### 12.2 Part C as built (2026-09-21) `[claude]`

Shipped as `66768d9` `86e3157` `d697a64` `2e688df` `e77d11d` (+ the fix commit before it), migration **0131**. Production smoke 20/20 (two Quick days and one Talk turn with a made-up person and place, cleaned up after). Phil's live check is the `smoke-test-daylog-part-c` template.

- **`people_daylog_stats`** (0131) is a `security_invoker` view, registered in `DERIVED_RELATIONS` (`lib/access/registry.ts`). A day counts once however many scenes the person was in; Quick days count (§10 decision 4 taken as assumed). A linked user gets nothing from it — they can read scene rows but never `daylog_days`, and the view joins through days.
- **`GET /api/people/[id]/days`** returns `{stats, timeline, facts, places, milestones}`; the shaping is pure (`lib/daylog/person.ts`, unit-tested). Facts are those whose subject is the person; milestones are theirs **or** any from a scene they were in; places group by linked place, else by the spoken name case-insensitively, and carry the food / drink / spend facts of those scenes.
- **`/api/people`** rows carry `days_together`; the People list shows it next to mentions and quotes.
- **Deviation — a block, not a tab.** The person page has no tabs (Quotes took the same route); Days is a full-width block under the three columns (`components/daylog/PersonDays.tsx`). The link / unlink control in §6 waits for Part E.
- **Person cards now carry last seen** (decision 22, deferred from Part B), and fall back to the first line of the person's notes when no relationship is set — that is where a "who's X?" answer is kept. Found by the smoke: with a bare-name card the interviewer asked "Who's Zorblax?" about someone already in People. `rules.md` rule 5 now ties the question to the *names not yet explained* list and says a card, however thin, means known.
- The extraction prompt now says reported speech always goes under `quotes` as well as any fact — a regression run of the Part B smoke showed the per-turn call missing a quote that the re-extract then caught.

## 13. Claude Code prompt (build)

> Read `AGENTS.md`, `docs/multi-user-handoff.md`, `claude/daylog-spec.md`, `claude/spec-organisation.md`, `claude/spec-studio-drops-ventures.md` (Journal) and `claude/quotes-spec.md` (review-queue conventions). Branch `daylog` off `main` after cutover. First, grep `journal` across `app/`, `components/`, `lib/` and list every touchpoint of the 0003 journal in the PR description. Migration `supabase/migrations/<next>_daylog.sql` per §3 using the post-P12 adoption helper and entity-group registration (`journal.daylog`); RLS per invariant; the linked-user select policies exactly as §3. Build Part A per §12 and stop for Phil's live check before Part B. Engine in `lib/daylog/engine.ts` with the rules block in `lib/daylog/rules.md` (loaded at runtime, not inlined). Models via `lib/config/models.ts` (Sonnet chat + narrative, Haiku extraction). Reuse the Whisper path from `/api/capture-audio` and the outbound `/api/telegram/send`; add the routing rule and callback buttons to the webhook. Routes per §5; pages per §6 with existing primitives; tests per §8 including the prompt-regression fixture from §9. `rm -rf .next && npx next build`, `npm test`, isolation script (with the cross-user positive case once Part E lands). Update `claude/spec-studio-drops-ventures.md` §Journal, `claude/spec-organisation.md` §People/§Captures and the backlog. Do not push migrations until Phil says the branch owns `supabase/migrations/**`.
