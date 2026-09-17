# Harvest Prompt — recovering state from old chats

*Claude cannot read past conversations — no session can. Anything decided in an old chat but never written to a project doc exists only there and in Phil's head. This prompt recovers it. Known targets: Loam & Glow P7–P11 detail, other app-feature discussions, desk-device decisions since July 2026.*

## How to use

**Old chat is inside this project:** open it, paste the prompt below. That session can write straight to the shared project docs — tell it to write its output to `claude/harvest-<topic>.md`. No copy-paste needed.

**Old chat is elsewhere (another project, plain claude.ai chat):** paste the prompt, then copy its markdown output back into any mycelium project conversation with "fold this harvest into the backlog and spec".

Afterwards, in a mycelium session: "process the harvest docs" — the content gets merged into `claude/backlog.md` and the spec docs, and the harvest files deleted.

## The prompt

```
Go through this entire conversation and extract everything that is durable
project state for mycelium (my life-OS app). I am consolidating scattered
context into project docs, so be exhaustive — don't summarise away detail.

Output structured markdown under these headings, skipping any that are empty:

## Decisions made
Each decision, what was chosen, what was rejected, and why — including
decisions to NOT do something.

## Backlog items
Everything we said we would do, split into: committed (I clearly said yes),
and ideas (floated but never committed). Include enough detail that someone
who never saw this chat could act on each item.

## Spec facts
Anything established about how the app actually works or should work:
features, pages, data model, tables, API routes, auth behaviour, naming.

## Open questions
Anything raised and left unresolved.

## Corrections
Anything in this chat that contradicts or supersedes earlier plans.

Rules: mark anything you are unsure about with (?). Quote my exact words for
anything ambiguous rather than paraphrasing. Exclude pleasantries, dead ends
(unless the dead end was itself a decision), and anything already fully
captured in a project doc you can see. Do not include secret values.
```

## Addendum — tickets (tickets spec §14.5, 2026-09-17)

Append to the prompt above in every other Claude project once its backlog imports into Mycelium Tickets:

> Output every outstanding, in-progress or recently finished item as JSON `[{title, body, status: backlog|next|doing|waiting|done, someday, where_ctx, tools, time_window, points, scheduled_on, deadline_on, source: 'harvest'}]` grouped by sub-project; nothing invented; unknown fields null.

Import with `POST /api/tickets` per item (or `tix new`), `source = import`, project by prefix.
