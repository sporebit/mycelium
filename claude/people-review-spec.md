# People review — reject, archive, learned ignore list

*Decided 2026-10-20 (Cowork, Phil, 4 multiple-choice answers). Status: **built 2026-10-20 as MYC-175, migration 0149** — awaiting Phil's live check (clear the 62, save a ticket with a rejected word). See "As built" at the end.*

## Root cause (repo-verified 2026-10-20)

The 62 "need review" people are mostly ticket-title fragments ("Map Street Name", "Shortcut Offline Behaviour", "Toothpaste"), created ~3 weeks ago when the backlog imports landed.

- `lib/tickets/server.ts` `rebuildTicketMentions()` runs `extractNameMentions()` (`lib/people/regex-extract.ts`: any 1–3 Title Case words) over every ticket's title + description, then calls `resolveMention()` **without `deferIfNew`** — so every miss auto-creates a person with `needs_review = true`. Its doc comment says "Never creates a Person"; that is false.
- `app/api/captures/[id]/review/route.ts` `recordMentions()` (review reroute) also calls `resolveMention()` without `deferIfNew`.
- `lib/router/writeCapture.ts` defers only for voice-like captures when `entity_review_rules.review_new` is on.

## Decisions

| # | Decision |
|---|---|
| R1 | **No path auto-creates a person.** Every `resolveMention()` caller passes `deferIfNew: true`; unknown names become a `pending_entities` row (kind person) in the review queue, as voice captures already do. Tickets and the capture-review reroute are the two callers to change. Remove or hard-gate the auto-create branch so a new caller can't reintroduce it. |
| R2 | **Reject = soft delete + ignore.** Uses the existing `DELETE /api/people/[id]` (30-day bin, `deleted_at`), and adds every alias of that person to the ignore list. Restoring from the bin removes those ignore entries. Rejecting a pending person in the review queue ("not a person") also adds the term. |
| R3 | **Archive = hidden + not matched.** New `people.archived_at`. Archived people are off the default list (an **Archived** filter chip shows them), excluded from `resolveMention()` and every matching path the Contacts tier is excluded from (day log, quotes speaker/alias, interviewer cards, `people_daylog_stats`). Unarchive restores both. History and existing links stay. **Default taken (flag):** an archived person's aliases also suppress new suggestions — otherwise "Nath" archived would be re-suggested as a new person on the next mention. Say if you want the opposite. |
| R4 | **Ignore list** — table `people_ignored_terms(id, space_id, term_key, term_raw, source text check in ('reject','manual','pending'), person_id uuid null, created_at, unique(space_id, term_key))`, `term_key` = `aliasKey()`. Exact, case-insensitive match only — no fuzzy (ignoring "Smoke" must not kill "Smokey"). Checked in `extractNameMentions()` output, in `resolveMention()` before the fuzzy step, and before any `pending_entities` person row is queued. Settings → People: list with remove + manual add. RLS per invariant (0092/0094 pattern + the 0111 loop inlined, the 0124 lesson); registered under People's entity group. |
| R5 | **Feed the classifier.** `classifyCapture` gets the most recent ~100 ignored terms in its prompt as "these are never people", and a post-filter drops any returned mention whose `aliasKey` is ignored (the prompt is a hint; the filter is the guarantee). Same mechanism as 0138 capture learning (`lib/capture/learning.ts`). |
| R6 | **Bulk + quick actions.** People → Review Needed: per-card hover actions **Keep** (clear `needs_review`) · **Archive** · **Reject**; the existing Select mode gains the same three as bulk actions, with one confirm for Reject showing the count and that the words will be ignored. Each card should show the source snippet (the ticket/capture text that produced it) so the call is quick. |

## Flag (recorded once — Phil chose R1 knowingly)

Sending ticket names to review instead of only linking existing people keeps the regex as a noise source: most of these phrases are unique ("Matching Game Game"), so the ignore list rarely gets a second hit on them, and the queue will refill at roughly the rate tickets are written. If the queue stays noisy after a few weeks, the cheaper fix is R1-alt: tickets link existing people only and never queue.

## Build notes

- Migration: `people.archived_at timestamptz` + index `where deleted_at is null and archived_at is null`; `people_ignored_terms`; backfill nothing (the 62 are cleared through the new UI, which also seeds the list).
- Grep every `.from('people')` reader and the alias resolver for the `archived_at is null` filter (same sweep 0140 did for `deleted_at` / `tier`).
- `GET /api/people` gains `archived=true|false|all` (default false); `PATCH /api/people/[id]` accepts `archived: boolean`; new `POST /api/people/bulk` `{ids, action: keep|archive|reject}`; `GET/POST/DELETE /api/people/ignored`. None public.
- Fix the false doc comment in `rebuildTicketMentions()`.
- Tests: ticket save with an unknown Title Case phrase creates no person and one pending row; an ignored term creates neither; archived alias neither matches nor queues; reject → restore round-trip clears the ignore entries; classifier post-filter drops an ignored mention.
- Done = build gate (`rm -rf .next && npx next build`), tests pass, Phil clears the 62 live and saves a ticket containing a rejected word without a new suggestion appearing.

## As built (2026-10-20, MYC-175, migration 0149)

- **R1** — `resolveMention()` has no create branch any more and no `deferIfNew` option: an unknown name is `unresolved`, and the caller queues it with the new `queuePendingPerson()` (`lib/people/resolve-mention.ts`), which also dedupes against an unresolved pending row with the same wording — a ticket rebuilds its mentions on every save, so without that each save would add a row. The deferred mention row is no longer flagged `needs_review` (the pending row is the review item; before, voice captures produced both). The three callers (tickets, the capture-review reroute, `writeCapture`) all go through it; `writeCapture` no longer consults `entity_review_rules.review_new` for this. Pending rows from a ticket carry `additional_data.snippet / ticket_id / source_kind`, and the review card links to the ticket.
- **R2** — `DELETE /api/people/[id]?reject=1` → `rejectPerson()` (bin + every alias and the display name on the list, `source = 'reject'`, tagged with the person). `restorePerson()` deletes the entries tagged with that person. Plain delete is unchanged. A pending person rejected in `/organisation/review` adds the wording with `source = 'pending'`.
- **R3** — `people.archived_at`; `PATCH /api/people/[id] { archived }` → `setPersonArchived()` (archiving also clears `needs_review`). Excluded in `resolveMention()` (both the exact and the fuzzy query), `resolveSpeaker()`, the interviewer `personCards()`, and the `people_daylog_stats` view. An archived person's alias returns `suppressed: "archived"` so nothing is queued. The People list has an **Archived** chip (`GET /api/people?archived=true`), cards and the person page have Unarchive.
- **R4** — `people_ignored_terms` as specified (unique index on `space_id, term_key`; adopted; `organisation.people`; the 0111 loop inlined). `lib/people/ignored.ts` holds the reads, writes and the `filterIgnored()` helper. `people_link_tables()` now excludes it, so the 0140 walkers (promote-on-link, merge, linked counts) do not treat the bookkeeping `person_id` as a link. Settings → People has the list with remove and a manual add. `GET/POST/DELETE /api/people/ignored`.
- **R5** — `buildClassifierSystemPrompt()` appends the most recent 100 terms as "never people"; `dropIgnoredMentions()` post-filters every classifier result (Anthropic, OpenAI and the regex fallback). Cached per user for a minute like the few-shot block.
- **R6** — Review Needed now shows the ambiguous mentions (the old queue, people hidden) above the needs-review people as cards with the source snippet and Keep / Archive / Reject; Select mode on Review Needed and Archived is bulk (All / None, one confirm for Reject that names the count and that the words will be ignored) through `POST /api/people/bulk { ids, action: keep | archive | unarchive | reject }`. `GET /api/people` returns `snippet` for needs-review people (first mention's source text, `lib/people/snippets.ts`, shared with the review queue).
- **Tests** — `lib/people/review.test.ts` on the local stack: the five cases from Build notes, plus dedupe on a second save, exact-not-fuzzy, archive clears `needs_review`.
- **Not done / for Phil** — the live check (clear the 62; save a ticket containing a rejected word). The `claude/context.md` / `backlog.md` reconciliation in the drift note is untouched.

## Drift note (2026-10-20)

Repo `main` is at `29b5f3e`, migrations through **0148**: People contacts shipped as **0140** (MYC-165), capture learning **0138**, the Work redesign Parts C–G built (MYC-174, 0141–0148). Project docs `claude/context.md` and `claude/backlog.md` still describe the 0134 state and W17 as unverified — the repo's own `claude/context.md` (2026-09-30, Claude Code) is the newer record of repo state. Needs a reconciliation pass.
