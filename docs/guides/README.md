# Field guides: how to write one

A Field guide is a run-book, test, guide, setup or audit ticket written to one format (design: `docs/run/2026-11-28/field-guide-design.md`). It is written once as checklist data and shown the same on the ticket page, on the standalone page `/guides/KEY`, and in the downloadable file `/api/tickets/KEY/guide.html`. Ticks, answers, "this did not work" notes and Park live in Mycelium's database (`tickets.steps_state`) whichever project the guide belongs to.

The worked example in this folder is `example-field-guide.json`: "Start the local stack and run one e2e spec". Copy it to start a new one.

## Where the files go

- `docs/guides/<slug>.json`: Field guides authored to this format.
- `docs/checklists/<slug>.json`: the older definitions. They still render in the Field guide and still tick; nothing is migrated.

Every JSON file in both folders is checked by `lib/guides/validate.test.ts` (`npx vitest run lib/guides`).

## Putting a guide on a ticket

```
tix new "Start the local stack and run one e2e spec" --kind guide --category next
tix steps MYC-123 --definition-file docs/guides/example-field-guide.json
tix guide MYC-123            the flight plan: sittings, minutes, needs, the tricky bit
tix answers MYC-123          what he typed, and the toggles
tix steps MYC-123 --tick 1.4                      tick Claude's own step after doing it
tix steps MYC-123 --failed 2.1 "EADDRINUSE"       record "this did not work" from the shell
tix steps MYC-123 --park 2.2 "waiting on DNS"     park: back on tomorrow's list
tix steps MYC-123 --unpark
```

## The rule (or the guide is refused)

A definition with `"format": "field-guide"` is refused, by the steps route and by the unit test, when:

1. any step whose `actor` is `"you"` (or that has no actor) lacks any of:
   - `where`: the exact place, with a `label` (a link in `url` when there is one; "In the shell, at A:\Projects\Mycelium" when there is not);
   - a value: at least one entry in `blocks`, or `value_html`, or a `body_html` that states the exact thing to click, type or choose (a step such as "Decide each" has nothing copyable);
   - `expect_html`: what he should see when it has worked;
   - `minutes`: how long it takes, above zero;
2. a phase's own steps (actor `"you"`) add up to more than 20 minutes.

Write each phase as one sitting of 15 minutes or less of his own steps. A definition without `format` is never refused for missing parts; it renders with visible gaps ("No check written for this step").

## The shape

Everything below is optional on top of the existing checklist shape (`lib/tickets/steps.ts`).

**The guide**

| Field | What it is |
|---|---|
| `format` | `"field-guide"`: turns the rule above on. |
| `intro.answer` | The one-line answer, plain text, shown first and largest. |
| `intro.unlocks` | "What this unlocks": a short list. |
| `intro.to_hand` | "You will need to hand": a short list. |
| `intro.hard_part` | `{ step_id, why }`: "The tricky bit is step 3.1, and here is why." |
| `intro.last_verified` | ISO date. The line goes amber with "check before trusting" after six months. |
| `intro.sources` | `[{ label, url, checked_on }]`, shown with their dates in the footer. |
| `intro.comparison` | Only when there was a choice to make. |
| `basics_html` | Shown at the top in "for someone else" mode. |
| `finish_html` | "What now works", shown when every step is ticked. |
| `handback_prompt` | The copy-this-prompt block at the finish; `{{key}}` takes his answers. |
| `next_guides` | Ticket keys offered at the finish (only those he can see appear). |
| `tested` | `{ "1.3": "real" \| "sandbox" \| "untested" }`. Run every step you can against the real thing or a sandbox; an untested step shows a small "untested" mark. |

**A phase (a sitting)**

| Field | What it is |
|---|---|
| `minutes` | The sitting's length; defaults to the sum of its steps. |
| `needs` | What to have to hand, shown on the flight plan. |
| `hard_part` | One line, on the flight plan and the phase header. |
| `verify_html`, `why_html` | Folded shut under the steps. One line of why per phase. |

**A step**

| Field | What it is |
|---|---|
| `minutes` | How long it takes. |
| `where` | `{ label, url?, kind? }`. |
| `blocks` | Exact text with a copy button. `kind: "command" \| "value" \| "prompt"` names the button ("Copy command"). `shells: { powershell, bash }` follows the Shell toggle. |
| `value_html` | A short exact value with its own copy button, when a block is too heavy. |
| `expect_html` | What he should see when it has worked. |
| `troubleshooting` | `[{ symptom, fix }]`, folded under the step; it unfolds by itself when "this did not work" is recorded. |
| `irreversible` | Umber with a hatched edge, "Cannot be undone", and a second tap to tick. |
| `actor: "claude-code"` + `did_html` | Claude does it first; shown ticked with what Claude did. "Only my steps" hides these. |
| `platforms` | Shown only when the `platform` toggle is one of these. |
| `plain_title`, `plain_body_html` | Used in "for someone else" mode. |
| `screenshot` | `{ src, alt, mark? }` only where a screen is confusing; `mark` is a box in percentages. |

**State (written by the page and by `tix`, never by hand)**: `steps`, `answers` and `toggles` as before; `failures` (`{ step_id: { at, note } }`) and `park` (`{ at, step_id, note }`). Park sets the ticket's `scheduled_on` to tomorrow (London) and logs a "park" activity row.

## Wording

UK English. No em dashes. Never "overdue", "missed", "failed" or "you still have not". Estimates say "about". Buttons say what they do. Say what he will see, literally ("It prints `1 passed`"), not "it should work".

## Secrets

No answer box, note or park line stores anything that looks like a key, token, password or private key; the page refuses it with "That looks like a secret. Guides never store secrets; put it where the step says and tick the step." A step that needs a secret says where to put it (Vercel, `.env.local`) and is ticked, never answered.
