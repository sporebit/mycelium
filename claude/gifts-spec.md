# Gifts — feature spec

*Written 2026-09-14 from Phil's design round. Status: **committed, builds after cutover on `main`** (migration numbered after 0115, and after whichever of checklists / quotes / gifts Phil starts first — migrations are numbered by build order). Section: Organisation. Every decision below is Phil's unless marked `[claude]`; flags raised once are in §12.*

---

## 1. What it is

A place to dump gift ideas the moment they appear — "Jake wants a decent chef's knife" — with who it's for, why it suits them, which occasion, a link to buy, price, and notes that accumulate over time. Then a set of occasions with real dates that push those ideas back at Phil before the date arrives, and a phase 2 that makes the ideas better: suggestions drawn from what the app already knows about the person, an on-demand price/alternatives check, bundling several ideas into one gift, generating the card message, and generating the gift artefact itself.

**The problem it solves is not storage, it is forgetting.** A gift list nobody opens is worthless, so the occasion engine and the reminders are phase 1, not phase 2. Everything else in the design follows from that.

## 2. Decisions (2026-09-14)

| # | Area | Decision |
|---|---|---|
| 1 | Timing | After cutover, on `main`. Migration `<next>_gifts.sql` after 0115. |
| 2 | Model | **New `gifts` table** with a **convert-to-purchase action**, not an extension of `purchases`. Discipline: gift ideas live in Gifts; things Phil buys for himself live in Purchases; the only bridge is "I've decided to buy this", which writes a `purchases` row and links it. |
| 3 | Occasions | **Real `gift_occasions` table with dates**, not an enum on the gift. Recurring (birthdays from People, Christmas, Valentine's) and one-off (graduation, new job, wedding). Gifts link to a concrete occasion instance. |
| 4 | Occasion instances | One row per **instance** ("Kirsty's birthday 2026"), not per recurring definition — so budget, gifts and history are per year. `recurrence = 'annual'` means a cron creates next year's row once this one passes, carrying budget and lead times forward and linking back. |
| 5 | Visibility | **Owner-only, like finance.** Gifts, occasions, bundles and comments are never visible to anyone else in a space, granted or not. A gift list is exactly the thing the recipient must not read. |
| 6 | Capture | **iOS Shortcut + Telegram + UI.** New `classifyCapture` intent `gift_idea`; voice/Telegram captures go through the **captures review queue** like every other automated entity; UI-created gifts bypass review. Read-back reply on capture. Never auto-creates a person. |
| 7 | Lifecycle | `idea → shortlisted → bought → given`, plus `rejected`. **Rejected rows are kept, never deleted** — they are what stops the suggester re-proposing the same thing. |
| 8 | Money | **Per-gift `target_price` and `paid_amount` + `paid_at`, and a `budget` per occasion.** The occasion view totals committed (shortlisted+bought target prices) and paid against budget. No Spending/transaction reconciliation in v1 (§12 flag 5). |
| 9 | Reminders | **All four channels**: morning briefing / rundowns entry, Telegram nudge at lead times, a Gifts dashboard card, and a **generated task** when the lead window opens. Default lead times 30 and 7 days, per-occasion overridable. |
| 10 | Notes | A **comments thread** per gift (ideas evolve over months), not a single notes field. Mirrors the task-comments pattern. `[claude]` — Phil asked for "comment/notes I can add"; thread chosen over a text field. |
| 11 | Recipient | `for_person_id` → People, resolved through aliases. No match or many matches → **unresolved**, picked in review; `for_label` holds the free text meanwhile. Never auto-create a person. |
| 12 | Phase 2 scope | All four build modes wanted. **Order: suggestions → bundles → wrapper (card/tag text) → artefact generation.** Price check ships alongside suggestions. |
| 13 | Suggestion inputs | People profile + notes, **their quotes** (once Quotes ships), **past gifts given** (incl. rejected + reason), and **tasks/mentions** referencing them. |
| 14 | Price check | **On-demand only** — Sonnet + Anthropic web search, same pattern as Quotes research. A snapshot with a confidence label and sources. No scrapers, no background monitoring. |
| 15 | Route | `/organisation/gifts`, next to Purchases and Media. |

## 3. Data model

`[claude]` on every column name and on the two helper assumptions flagged inline. Claude Code confirms against the repo before writing the migration.

### 3.1 `gift_occasions`

```sql
create table gift_occasions (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references spaces(id) on delete cascade,
	created_by uuid references auth.users(id) on delete set null,
	name text not null,                 -- "Kirsty's birthday 2026", "Christmas 2026"
	kind text not null default 'other'
		check (kind in ('birthday','christmas','valentines','anniversary','graduation',
			'new_job','wedding','new_baby','housewarming','thank_you','other')),
	person_id uuid references people(id) on delete set null,   -- null for shared occasions (Christmas)
	occurs_on date not null,
	recurrence text not null default 'none' check (recurrence in ('none','annual')),
	source text not null default 'manual' check (source in ('manual','person_dob','fixed')),
	previous_occasion_id uuid references gift_occasions(id) on delete set null,
	budget numeric(10,2),
	lead_days int[] not null default '{30,7}',
	reminder_task_id uuid,              -- the task generated when the window opened (dedup)
	notes text,
	archived_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index gift_occasions_space_date on gift_occasions (space_id, occurs_on);
create index gift_occasions_person on gift_occasions (person_id);
```

### 3.2 `gifts`

```sql
create table gifts (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references spaces(id) on delete cascade,
	created_by uuid references auth.users(id) on delete set null,
	title text not null,
	description text,
	reason text,                        -- why it suits them; the field the wrapper and suggester both use
	for_person_id uuid references people(id) on delete set null,
	for_label text,                     -- free text while unresolved, or a non-People recipient
	occasion_id uuid references gift_occasions(id) on delete set null,
	needed_by date,                     -- defaults from the occasion, overridable
	status text not null default 'idea'
		check (status in ('idea','shortlisted','bought','given','rejected')),
	rejected_reason text,
	origin text not null default 'manual' check (origin in ('manual','capture','suggested')),
	url text,
	retailer text,
	category text,
	currency text not null default 'GBP',
	target_price numeric(10,2),
	paid_amount numeric(10,2),
	paid_at date,
	given_at date,
	bundle_id uuid references gift_bundles(id) on delete set null,
	purchase_id uuid references purchases(id) on delete set null,   -- convert action; confirm the table name
	price_check jsonb,
	price_checked_at timestamptz,
	suggestion jsonb,                   -- why the suggester proposed it, and from what
	raw_text text,                      -- transcript / message exactly as captured; null for UI-created
	capture_id uuid,                    -- FK to the captures table; spec-organisation lists it as raw_captures (?)
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index gifts_space_status on gifts (space_id, status, needed_by);
create index gifts_person on gifts (for_person_id);
create index gifts_occasion on gifts (occasion_id);
create index gifts_title_trgm on gifts using gin (title gin_trgm_ops);  -- pg_trgm: verify enabled on hosted
```

### 3.3 `gift_bundles` (phase 2c, table created in the phase 1 migration so the FK exists)

```sql
create table gift_bundles (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references spaces(id) on delete cascade,
	created_by uuid references auth.users(id) on delete set null,
	name text not null,
	for_person_id uuid references people(id) on delete set null,
	occasion_id uuid references gift_occasions(id) on delete set null,
	presentation_note text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
```

### 3.4 `gift_comments`

Mirror the existing task-comments table exactly — same columns, same author handling, same activity conventions. `[claude]`: Claude Code copies the shape rather than inventing one; if task comments are stored generically (a polymorphic comments table), reuse that instead of a new table.

### 3.5 People

Occasions of `source = 'person_dob'` need a date on the People row. **Claude Code must check whether `people` already has one.** If not, add in the same migration:

```sql
alter table people add column date_of_birth date;
alter table people add column birth_year_known boolean not null default true;
```

`birth_year_known = false` means only day and month are meaningful (store an arbitrary year and never display it). Do not add this if an equivalent column already exists.

### 3.6 Rules

- RLS per the post-P12 pattern on all four tables: enable + restrictive deny-all + service_role grant, then **owner-only** policies (the `platform`/finance shape, not the shared `app.accessible_spaces` shape — decision 5). Register the entity group `organisation.gifts` in `entity_groups`; an unregistered table fails a test. Use the same adoption helper the checklists/quotes migrations use (`app.adopt_table` per `claude/checklists-spec.md`) — confirm the exact name against `docs/multi-user-handoff.md`.
- `status = 'given'` ⇒ `given_at` not null (set by the API, not a constraint).
- `status = 'rejected'` rows are excluded from every default view and **included** in suggestion context.
- Deleting a person sets `for_person_id` null and leaves the gift; deleting an occasion sets `occasion_id` null and leaves `needed_by` intact.
- `updated_at` maintained the way other tables do it — check before adding a second mechanism.

## 4. Capture pipeline

1. Inbound via `/api/capture-audio` (Shortcut voice), `/api/capture` (Shortcut text) or the Telegram webhook — no new endpoints.
2. `classifyCapture` gains intent `gift_idea`. LLM path (Haiku, `lib/config/models.ts`), not the pre-classifier short-circuit list. Same intent-expansion work as the `quote` intent.
3. Extraction returns:
	```json
	{
		"title": "decent chef's knife",
		"person": "Jake",
		"reason": "keeps complaining his knives are blunt",
		"occasion": "birthday",
		"url": null,
		"target_price": null,
		"needed_by_relative": null
	}
	```
	Rules: "get X a Y" / "Y for X" / "X wants a Y" → person X, title Y. "for his birthday / for Christmas" → occasion kind, matched to an **existing open occasion for that person** if one exists, otherwise left unresolved for review (never auto-create an occasion). Anything after "because / he said / she's always" → `reason`.
4. Person → People alias match. Exactly one → resolved. Zero or many → unresolved, `for_label` keeps the raw name.
5. A **pending entity** of kind `gift_idea` via the existing review path (`entity_review_rules`); raw transcript on `raw_text`.
6. Read-back reply to the channel, immediately, before approval: `Saved for review — gift idea for Jake: "decent chef's knife" (birthday)`, with `(person unresolved)` appended when applicable.
7. Review page shows title, recipient (or the picker), occasion (or the picker), reason, and a **near-duplicate warning** (`similarity(title, existing.title) > 0.6` for the same recipient, pg_trgm) with keep/merge/discard. Approve → insert into `gifts` with `origin = 'capture'`.

## 5. Occasions engine

- **Seeding.** On first run, create occasions from People dates of birth (`source = 'person_dob'`, `recurrence = 'annual'`) and the fixed calendar Phil turns on (`source = 'fixed'`: Christmas 25 Dec, Valentine's 14 Feb). One-offs are created by hand or from a capture.
- **Roll-forward.** `/api/cron/gift-occasions` (daily, Bearer `CRON_SECRET`, cron-job.org) — for every `recurrence = 'annual'` occasion whose `occurs_on` has passed, create next year's row if one does not already exist, carrying `budget`, `lead_days`, `kind`, `person_id`, setting `previous_occasion_id`. **Idempotent** — keyed on (person_id, kind, year) so a double run creates nothing (§12 flag 7).
- **Person-dob sync.** The same cron reconciles birthday occasions against People dates of birth, so editing a date of birth fixes the next instance.

## 6. Reminders (all four — decision 9)

Driven by one daily job, `/api/cron/gift-reminders` (Bearer `CRON_SECRET`):

| Channel | Behaviour |
|---|---|
| Task | When an occasion first enters its **longest** lead window (default 30 days), create one task — "Gift for Kirsty — birthday, 23 May" — due `occurs_on - 7`, linked back; id stored in `reminder_task_id` so it is created once. Marking a gift `bought` for that occasion completes the task. |
| Telegram | A nudge at each `lead_days` entry via the existing `/api/telegram/send`, and one final nudge at 2 days if nothing is `bought`. **Text is deliberately vague** — "2 occasions in the next 30 days, 1 with nothing bought" — see §12 flag 3. Detail lives behind the link. |
| Morning briefing / rundowns | Occasions inside any lead window appear with counts: ideas, shortlisted, bought. No new infra — an entry in the existing surface. |
| Dashboard card | A Gifts card in the Everything registry: next three occasions, days remaining, and who has nothing yet. |

Nothing fires for an occasion where a gift is already `given`.

## 7. Phase 2 — in build order

### 7a. Suggestions (first)

`POST /api/gifts/suggest` `{person_id, occasion_id?, budget?, count?}`.

Context assembled server-side (decision 13): People profile + aliases + notes; that person's **quotes** (once Quotes ships — degrade cleanly when the table does not exist); **past gifts** to them with status and `rejected_reason`; **task mentions** of them, filtered to the last ~12 months and capped.

Call: Sonnet + Anthropic web search (the app already talks to Anthropic; no new vendor). Usage logged to `api_usage` like every other call. Returns N candidates, each `{title, reason, url?, est_price?, confidence, based_on[]}` — `based_on` is mandatory and names the evidence used ("he's mentioned blunt knives twice", "you gave him a whetstone in 2025"). Candidates are written as `gifts` rows with `origin = 'suggested'`, `status = 'idea'`, and the payload in `suggestion`. Phil keeps, edits or rejects; rejection stores a reason and feeds the next run.

The UI must show `based_on` next to every suggestion. A suggestion that can't say what it's based on is a shopping-site listicle and should be presented as one.

### 7b. Price check (alongside 7a)

`POST /api/gifts/[id]/price-check` — Sonnet + web search on `title` and `url`. Writes `price_check`:

```json
{
	"checked_at": "2026-11-02 09:14:00",
	"best_price": 48.00,
	"currency": "GBP",
	"retailer": "…",
	"url": "https://…",
	"alternatives": [{"title": "…", "price": 39.99, "retailer": "…", "url": "https://…", "why": "same steel, shorter handle"}],
	"confidence": "medium",
	"sources": [{"title": "…", "url": "https://…"}]
}
```

On demand only. **Never writes `target_price`** — it is a snapshot, shown with its timestamp and confidence label, and Phil copies it across if he agrees.

### 7c. Bundles

Group gifts into one `gift_bundles` row for a person+occasion, with a running total and a `presentation_note`. The occasion view shows a bundle as one line with its children nested. Useful in December; cheap to build.

### 7d. Wrapper — card, tag, and the "why I got you this" note

`POST /api/gifts/[id]/message` `{kind: "card" | "tag" | "note"}` → short text generated from `reason`, `description`, the relationship on the People row, and the occasion. Editable, stored (`gift_messages` jsonb on the gift, or a small table — Claude Code's call). This is what makes `reason` worth filling in.

### 7e. Artefact generation (last)

Where the gift *is* a made thing:

- **Playlist** — the existing Spotify connector generates and saves it; the gift's `url` becomes the playlist link.
- **Print / poster / card artwork** — Higgsfield connector, same open wiring question as Quotes merch v1.1 (Cowork calls it on request, vs the app calling the API with a key). Not decided.
- **Photo book / compilation** — out of scope; note it and stop.

Last for a reason — see §12 flag 4.

## 8. Convert to purchase (decision 2)

A `Buy this` action on a gift with `status = 'shortlisted'`: creates a `purchases` row (`list_type = 'shopping'`, want/need, category, url, price carried across), stores its id on `gifts.purchase_id`, and moves the gift to `bought`. One-way. The gift stays the record of who and why; the purchase is the record of buying it. Claude Code confirms the real `purchases` column names (0017/0018/0029/0030/0085) before wiring.

## 9. API

All through `createUserClient()`; RLS is the wall. Claude's read path is the same GET with the `API_SECRET` header, as for checklists and quotes.

| Route | Verb | Does |
|---|---|---|
| `/api/gifts` | GET `?q=&person=<id>&occasion=<id>&status=&month=YYYY-MM` | List. Default excludes `rejected`. |
| `/api/gifts` | POST | Manual create (bypasses review). |
| `/api/gifts/[id]` | GET / PATCH / DELETE | PATCH whitelists `title, description, reason, for_person_id, for_label, occasion_id, needed_by, status, rejected_reason, url, retailer, category, target_price, paid_amount, paid_at, given_at, bundle_id`. |
| `/api/gifts/[id]/comments` | GET / POST / DELETE | Notes thread (decision 10). |
| `/api/gifts/[id]/convert` | POST | Convert to a purchase (§8). |
| `/api/gifts/[id]/price-check` | POST | Price + alternatives snapshot (§7b). |
| `/api/gifts/[id]/message` | POST | Card / tag / note text (§7d). |
| `/api/gifts/suggest` | POST | Suggestion run (§7a). |
| `/api/gifts/export` | GET `?occasion=&format=csv|txt` | Export. CSV headers **without underscores** ("Target Price", "Paid Amount"); datetimes `YYYY-MM-DD HH:MM:SS`. |
| `/api/gift-occasions` | GET / POST | List (upcoming first) / create. |
| `/api/gift-occasions/[id]` | GET / PATCH / DELETE | Incl. `budget`, `lead_days`, `archived_at`. |
| `/api/gift-bundles` (+`[id]`) | GET / POST / PATCH / DELETE | Phase 2c. |
| `/api/people/[id]/gifts` | GET | That person's gifts; People list gets a `gift_idea_count`. |
| `/api/cron/gift-occasions` | POST (Bearer `CRON_SECRET`) | Roll-forward + dob sync (§5). |
| `/api/cron/gift-reminders` | POST (Bearer `CRON_SECRET`) | Reminders (§6). |

## 10. Pages

- **`/organisation/gifts`** — default view **By occasion**, soonest first: an occasion header (name, date, days remaining, budget vs committed vs paid) with its gifts beneath, then "No occasion" at the bottom. Other views: **By person**, **All ideas**, **Given** (history, newest first). Search box; status chips; export honours the current filter.
- **Gift card** — title, recipient chip → person page, occasion chip, status pill, target/paid price, link-out icon, `based_on` line for suggested rows, comment count. Status advances in place.
- **Detail** (Sheet on desktop, bottom sheet on mobile, same as tasks) — every PATCH field; the comments thread; raw transcript read-only under the title for captured rows; `Buy this` / `Price check` / `Card message` actions; `Reject` with a reason.
- **Occasion detail** — budget, lead times, the gift list, the generated task link, and the roll-forward link to next year's instance.
- **People detail** — a **Gifts** tab (ideas + history for that person) and `Suggest gifts` button. **People list** — idea count per row.
- **Captures review** — the gift-idea card described in §4.7.
- **Dashboard** — the Gifts card (§6).
- Loam & Glow v2 primitives; Organisation accent; no new stylesheet.

## 11. Tests

- Unit: capture extraction rules (person/title/reason/occasion split); occasion roll-forward idempotency incl. the double-run case and 29 February; lead-window boundaries (exactly 30 days out fires once, not daily); budget totals with nulls; the convert action's field mapping.
- Route: list filters and the `rejected` exclusion; PATCH whitelist; export headers and datetime format; both crons 401 without the bearer; `price-check` never mutates `target_price`.
- Isolation: the standard per-endpoint isolation script must cover every new route; **owner-only means a granted space member sees zero rows** — that is a distinct assertion from the shared-entity case and must be written explicitly.
- Manual (Phil, live): one Shortcut capture end to end — read-back, review, approve, appears under the right occasion; a task generated at the lead window; a Telegram nudge; convert to purchase; export.

## 12. Flags raised once `[claude]`

1. **Three features now queue on the next migration number** — checklists, quotes, gifts. Whichever Phil starts first takes it; the other two renumber before merge. Do not start two of them in parallel worktrees while `supabase/migrations/**` has a single owner.
2. **The price check is a snapshot, not a tracker.** It will sometimes be out of date or simply wrong, and it will rarely beat opening the link. Its real value is the `alternatives` list, not the price. Label the timestamp and confidence loudly; never let it write `target_price`.
3. **Owner-only protects the database, not the lock screen.** A Telegram nudge saying "buy Kirsty the necklace" is readable by anyone glancing at the phone. Hence the deliberately vague nudge text in §6 — the detail stays behind the link.
4. **Artefact generation is last because it will disappoint.** Image generators remain unreliable at legible, exactly-spelled text, and a card or print is mostly text — the same failure already flagged for Quotes merch. Composite text over generated artwork (satori / `@vercel/og`) rather than asking the model to spell.
5. **Cold start.** The suggestion engine is only as good as the People notes, and today those are probably thin. The first runs will produce generic suggestions. The `based_on` field is the honesty mechanism — if it can only say "he's a man in his thirties", the output should look as weak as it is. This gets better as Quotes and People fill up, which is an argument for building Quotes before phase 2, not before phase 1.
6. **Rejected gifts must never be deleted**, or the suggester re-proposes them forever. Worth a comment in the migration, not just here.
7. **A silently failing roll-forward cron loses next year's occasions** and the failure is invisible until a birthday passes. Make it idempotent, log a count, and surface a "no upcoming occasions" state on the page that reads as a warning rather than an empty list.
8. **People date of birth may not exist yet** (§3.5) and the whole birthday half of the feature depends on it. First thing Claude Code checks.

## 13. Claude Code prompt (build)

> Read `AGENTS.md`, `docs/multi-user-handoff.md`, `claude/gifts-spec.md`, `claude/spec-organisation.md` and `claude/quotes-spec.md` (same patterns). Branch `gifts` off `main` after cutover.
>
> First, confirm four repo facts and report them before writing anything: (a) whether `people` already holds a date of birth; (b) the real captures table name and the `entity_review_rules` pending-entity shape; (c) the `purchases` column names for the convert action; (d) the task-comments table shape, and whether comments are generic or per-entity. Correct the spec in the same turn if any differ.
>
> Migration `supabase/migrations/<next>_gifts.sql` per §3 — `gift_occasions`, `gifts`, `gift_bundles`, comments, the People date columns if absent — using the post-P12 adoption helper and entity-group registration, RLS per invariant with **owner-only** policies (the finance/`platform` shape, not `app.accessible_spaces`). Add the `gift_idea` intent to `classifyCapture` with the extraction and unit tests per §4; wire the pending-entity kind into the review page with the near-duplicate warning. Routes per §9; occasions engine and crons per §5–6 with idempotency tests; pages per §10 using existing primitives. Phase 2 is **not** in this branch — build §7 only when Phil says so, in the order given.
>
> `rm -rf .next && npx next build`, `npm test`, isolation script (including the owner-only assertion in §11). Update `claude/spec-organisation.md` §Gifts and the backlog. Do not push migrations until Phil says the branch owns `supabase/migrations/**`.
