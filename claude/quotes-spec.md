# Quotes — feature spec

*Written 2026-09-14 from Phil's 28-answer design round. Status: **committed, builds after cutover on `main`** (migration numbered after 0115 and after whatever ships first — checklists or this; migrations are numbered by build order). Modelled on the Media watch/read/listen list. Section: Organisation. Every decision below is Phil's unless marked `[claude]`; flags raised once are in §10.*

---

## 1. What it is

Capture a quote by voice ("Jake just told me a quote, you have to get comfortable with being uncomfortable" / "I've just said a quote, save it for me, Jake your dog is crazy, he gives me bad vibes"), attribute it to a person in People, show when it was added, tick it for merch ("put that on a t-shirt"), and let the app find out in the background whether it's a known quote — who originally said it, when, where, why.

The problem it solves: Jake says "I need to put that on a t-shirt" and by the time anyone gets round to it the line is gone. So **verbatim wording** and **fast capture** matter more than anything else here.

## 2. Decisions (2026-09-14)

| # | Area | Decision |
|---|---|---|
| 1 | Timing | After cutover, on `main`. Migration `<next>_quotes.sql` after 0115. |
| 2 | Channels | iOS Shortcut **and** Telegram — same classifier. |
| 3 | Review | Voice/Telegram captures go **through the captures review queue** like every other automated entity (`entity_review_rules`). A quote exists as a row only once approved. UI-created quotes bypass review (existing rule). |
| 4 | Read-back | The Shortcut/Telegram reply reads back the extracted quote + person immediately (before approval), e.g. `Saved for review — Jake: "you have to get comfortable with being uncomfortable"`, with `(speaker uncertain)` appended when applicable. |
| 5 | Unclear speaker | Default to Phil, mark `speaker_confidence = 'uncertain'`; corrected in review. |
| 6 | Dates | Both `said_at` and `created_at`. `said_at` parsed from relative phrases ("last Tuesday", "this morning"); defaults to `created_at`. The list shows "added"; shows "said" too when it differs. |
| 7 | Who | Two fields: `said_by_person_id` (People row — who said it to Phil) and `attributed_to` (free text — the original author, from research or hand-entered). Famous people never become People rows. |
| 8 | Self | `is_own = true`, `said_by_person_id` null. No People row for Phil. "Mine" is a filter. |
| 9 | Name match | Resolve through People aliases. No match or more than one match → **unresolved**, picked in review. **Never auto-create a person.** |
| 10 | Context | Optional free text; extractable from voice ("…we were at the gym"). |
| 11 | Source | Free-text `source` in v1 (book/film/podcast/etc.). `media_items` link is a later addition. |
| 12 | Merch flag | Single boolean `merch`. T-shirt, image, sticker all mean "put it on something". |
| 13 | Extra fields | None. No rating, no private flag, no tags. |
| 14 | Duplicates | Near-match detection at review time; warn and offer merge. |
| 15 | Research: when | Automatic, in the background, after the row is created (i.e. on approval / UI create). Status field + re-run button. Never blocks the Shortcut reply. |
| 16 | Research: scope | The classifier judges `likely_original`; those are marked `skipped` and not searched. Re-run is always available. |
| 17 | Research: confidence | **Always show the result, with a confidence label** (high / medium / low). Nothing hidden. |
| 18 | Research: content | Original author, source (work / speech / interview), year, context/why, how the wording differs from what Phil was told, confidence, source URL(s). |
| 19 | Research: override | Mark **wrong** (hides it, blocks re-runs until cleared), mark **their own** (verdict = original), or hand-edit `attributed_to`. A bad result never sticks. |
| 20 | Route | `/organisation/quotes`, next to Media. |
| 21 | Views | Newest first + search; group/filter by person (incl. Mine); merch-only filter; by month. All four in v1. |
| 22 | People | Quotes tab on the person's detail page **and** a count on People list rows. |
| 23 | Multi-user | Registered as entity group `organisation.quotes` with the standard policy shape — shareable via grants/teams later; nothing shared unless granted. |
| 24 | Merch v1 | Flag + filter + **export** (merch-flagged set as text/CSV). |
| 25 | Merch v1.1 | **Image generation via the Higgsfield connector** (Phil's choice — see §10 flag 3). **Telegram send to Phil's own chat**, he forwards (zero new infra; outbound route exists). |
| 26 | Manual add/edit | Yes — needed to fix transcripts. `[claude]` assumed, not asked. |

## 3. Data model

```sql
create table quotes (
	id uuid primary key default gen_random_uuid(),
	space_id uuid not null references spaces(id) on delete cascade,
	created_by uuid references auth.users(id) on delete set null,
	text text not null,
	raw_text text,                      -- transcript / message exactly as captured; null for UI-created
	said_by_person_id uuid references people(id) on delete set null,
	is_own boolean not null default false,
	speaker_confidence text not null default 'certain'
		check (speaker_confidence in ('certain', 'uncertain')),
	context text,
	source text,
	said_at timestamptz not null default now(),
	merch boolean not null default false,
	attributed_to text,
	research_status text not null default 'pending'
		check (research_status in ('pending', 'running', 'found', 'none', 'skipped', 'failed', 'wrong')),
	research jsonb,
	research_ran_at timestamptz,
	capture_id uuid,                    -- FK to the captures table; Claude Code confirms the real table name (spec-organisation lists it as raw_captures (?))
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index quotes_space_created on quotes (space_id, created_at desc);
create index quotes_person on quotes (said_by_person_id);
create index quotes_space_merch on quotes (space_id) where merch;
create index quotes_text_trgm on quotes using gin (text gin_trgm_ops);   -- pg_trgm: verify enabled on hosted
```

Rules:
- `is_own = true` ⇒ `said_by_person_id is null` (check constraint).
- RLS per the post-P12 pattern (enable + restrictive deny-all + service_role grant, then the real `organisation.quotes` policies via `app.accessible_spaces`). Register in `entity_groups` — an unregistered table fails a test. Use the same adoption helper the checklists migration will use (`app.adopt_table` per `claude/checklists-spec.md`); confirm the exact helper name against `docs/multi-user-handoff.md`.
- `updated_at` maintained the way other tables do it (trigger or API — check before adding a second mechanism).
- Deleting a person sets `said_by_person_id` null rather than deleting quotes.

### 3.1 `research` payload

```json
{
	"verdict": "known",
	"confidence": "medium",
	"original_author": "unknown — widely attributed",
	"source_work": null,
	"year": null,
	"context": "A common motivational aphorism; attributed online to Peter McWilliams, Jillian Michaels and others. No primary source found.",
	"wording_note": "Told as \"you have to get comfortable with being uncomfortable\"; the most common printed form is \"get comfortable with being uncomfortable\".",
	"sources": [{"title": "…", "url": "https://…"}],
	"model": "…",
	"searched_at": "2026-10-01T09:12:00Z"
}
```

`verdict` ∈ `known | unknown | original`. `sources` may be empty (that is what a low-confidence label is for — decision 17). `wrong` as a `research_status` is Phil's override, not a model output; `their own` sets `verdict = original`, `attributed_to = null`.

## 4. Capture pipeline

1. Inbound via `/api/capture-audio` (Shortcut voice), `/api/capture` (Shortcut text) or the Telegram webhook — no new endpoints.
2. Whisper → `classifyCapture` gains an intent `quote`. It will **not** hit the pre-classifier short-circuit list; it goes to the LLM path (Haiku, `lib/config/models.ts`). This is the concrete case for the backlog's `classifyCapture` intent-expansion item.
3. Extraction (same call or a second Haiku call) returns:
	```json
	{
		"text": "you have to get comfortable with being uncomfortable",
		"speaker": "Jake",
		"is_own": false,
		"speaker_confidence": "certain",
		"context": null,
		"said_at_relative": null,
		"likely_original": false
	}
	```
	Speaker rules: "X told me / X said / X's quote" → X. "I said / I've just said / my quote" → own. Addressee-only ("Jake, your dog is crazy") → own + `uncertain`. Preamble ("save it for me", "here's a quote") is stripped; the quote text is everything that isn't instruction or attribution. Whisper emits no quote marks, so boundaries are the model's call — the read-back exists to catch it.
4. Speaker → People alias match. Exactly one match → resolved. Zero or many → unresolved pending person (the existing people review mechanism).
5. A **pending entity** of kind `quote` is created via the existing review path (`entity_review_rules`); the raw transcript is stored on it as `raw_text`.
6. Reply to the channel with the read-back (decision 4).
7. Review page (`/organisation/captures/review`): shows text, speaker (or the unresolved picker), context, said_at, `uncertain` marker, and a **near-duplicate warning** (`similarity(text, existing.text) > 0.6` in the same space, pg_trgm) with a merge action (keep existing, discard new; or replace text). Approve → insert into `quotes` → enqueue research.

## 5. Research

- Runs after insert. Mechanism `[claude]`: Next 15 `after()` in the approve / create route so it never delays the response, plus a **sweeper** on cron-job.org (`/api/cron/quotes-research`, `CRON_SECRET`) that picks up `pending` rows older than 10 minutes — `after()` alone is not a queue.
- `likely_original = true` → `research_status = 'skipped'`, no call made (decision 16). Re-run overrides the skip.
- The call `[claude]`: Anthropic Messages API with the web search tool (the app already talks to Anthropic; no new vendor). Sonnet, not Haiku — attribution is exactly the task small models get confidently wrong. Prompt returns the §3.1 payload and is told that "unknown" and "original" are good answers; it must not invent a source. Usage logged to `api_usage` like every other call.
- Status transitions: `pending → running → found | none | failed`; `skipped` from extraction; `wrong` from Phil. `failed` retries once via the sweeper, then stays `failed` with the error in `research.error`.
- Cost: one search-backed call per approved, non-skipped quote. Trivial at Phil's volume.

## 6. API (all through `createUserClient()`; RLS is the wall)

| Route | Verb | Does |
|---|---|---|
| `/api/quotes` | GET `?q=&person=<id>|mine&merch=1&month=YYYY-MM` | List, newest first. Search is trigram over `text` + `context`. |
| `/api/quotes` | POST | Manual create (bypasses review). Enqueues research unless `skip_research`. |
| `/api/quotes/[id]` | GET / PATCH / DELETE | PATCH whitelists `text, context, source, said_at, said_by_person_id, is_own, merch, attributed_to`. Editing `text` does not re-run research automatically. |
| `/api/quotes/[id]/research` | POST | Re-run (clears `wrong`/`skipped`). |
| `/api/quotes/[id]/research` | PATCH `{action: "wrong" \| "own" \| "clear"}` | Override (decision 19). |
| `/api/quotes/export` | GET `?merch=1&format=csv|txt` | Export. CSV headers without underscores; datetimes `YYYY-MM-DD HH:MM:SS`. |
| `/api/people/[id]/quotes` | GET | That person's quotes (or the list route with `person=`); People list gets a `quote_count`. |
| `/api/cron/quotes-research` | POST (Bearer `CRON_SECRET`) | Sweeper (§5). |

Claude's read path is the same GET with the `API_SECRET` header, as for checklists.

## 7. Pages

- **`/organisation/quotes`** — list, newest first. Controls: search box, person chips (incl. **Mine**), **Merch** toggle, view switch list / by person / by month (month headers). Each card: quote text (large, the point of the page), said-by chip → person page, added date (+ "said <date>" when different), merch tick (toggles in place), research badge (`found` with confidence colour / `none` / `skipped` / `pending` / `failed` / `wrong`) that expands the §3.1 panel inline. Export button honours the current filter.
- **Detail** (Sheet on desktop, bottom sheet on mobile, same as tasks): edit every PATCH field; raw transcript shown read-only under the text; research panel with **Re-run / Wrong / Their own** and the editable `attributed_to`.
- **People detail** — a **Quotes** tab, newest first, same cards. **People list** — quote count per row.
- **Captures review** — the quote card described in §4.7.
- Loam & Glow v2 primitives; Organisation accent; no new stylesheet.

## 8. Merch

- v1: `merch` flag, Merch filter, export (§6).
- v1.1 (backlog, decided): **image generation via the Higgsfield connector** — Phil's choice. Two ways to wire it: Cowork/Claude reads the quote via the API and calls the connector on request, or the app calls the Higgsfield API directly with a key. Not decided which. **Telegram send to Phil's own chat** via the existing `/api/telegram/send`; he forwards.

## 9. Tests

- Unit: speaker rules (told me / I said / addressee-only / no attribution); relative `said_at` parsing; near-duplicate threshold; the `is_own ⇒ null person` constraint.
- Route tests: list filters; PATCH whitelist; export headers/format; research override transitions; the cron sweeper is 401 without the bearer.
- Isolation: the standard per-endpoint isolation script must cover the new routes (0 rows of another user's quotes).
- Manual (Phil, live): one Shortcut capture end to end — read-back, review, approve, research lands, appears on the person's tab, merch tick, export.

## 10. Flags raised once `[claude]`

1. **Review queue vs the forgetting problem.** Every voice quote now waits for approval before it is a quote. If reviews back up, the list lies about what's been captured. The read-back softens this; the pending-count badge is the safety net. Reconsider "bypass review" if the queue becomes a chore.
2. **Skip-classifier risk.** "Likely original" is a judgement Haiku will sometimes get wrong on a famous line phrased casually. Cost of the miss: no research until re-run. Acceptable per decision 16; the re-run button is the mitigation.
3. **Higgsfield for t-shirt images.** AI image generators are unreliable at legible, exactly-spelled text — and a t-shirt is nothing but text. Expect to regenerate several times per quote, or use it for artwork with the text composited on afterwards (satori / `@vercel/og` over the generated image). Decision stands; noting the likely failure mode.
4. **Always-show low confidence.** With decision 17 the panel will sometimes show a plausible-looking wrong origin with a "low" label. The "wrong" override is what keeps that from sticking; the label must be visually loud, not a footnote.

## 11. Claude Code prompt (build)

> Read `AGENTS.md`, `docs/multi-user-handoff.md`, `claude/quotes-spec.md` and `claude/spec-organisation.md`. Branch `quotes` off `main` after cutover. Migration `supabase/migrations/<next>_quotes.sql` per §3 using the post-P12 adoption helper and entity-group registration; RLS per invariant. Add the `quote` intent to `classifyCapture` and the extraction per §4 with unit tests for the speaker rules. Wire the pending-entity kind `quote` into the review page with the near-duplicate warning. Routes per §6; research per §5 with `after()` + the cron sweeper; pages per §7 using existing primitives. `rm -rf .next && npx next build`, `npm test`, isolation script. Update `claude/spec-organisation.md` §Quotes and the backlog. Do not push migrations until Phil says the branch owns `supabase/migrations/**`.
