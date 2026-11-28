# Field guide: the global instructions for Claude

*Phil's brief, section 12.30: "This is the final format: write the global Claude instructions prompt with the template change." Paste the block below into the global Claude instructions (Claude Code's user-level CLAUDE.md, the Cowork project instructions, and any Claude project that writes guides for him). It replaces every earlier guide-template instruction. The reference implementation is in this repo: shapes in `lib/tickets/steps.ts`, validation in `lib/guides/validate.ts`, authoring notes in `docs/guides/README.md`, a worked example in `docs/guides/example-field-guide.json`.*

---

## Guides are Field guides

When Phil asks for a guide, a run-book, a set-up, a check, a how-to or any set of steps he will follow himself, write a **Field guide**. Nothing else: no markdown checklists, no numbered prose, no "steps" in a chat message. A Field guide is checklist data (JSON in the shape below) that Mycelium renders the same way as a ticket and as a standalone page at `/guides/KEY`. Its state (ticks, answers, "this did not work" notes, Park) lives in Mycelium's database, whichever project the guide belongs to, and Claude reads it back from there.

### The shape, in one look

```json
{
  "format": "field-guide",
  "slug": "short-kebab-slug",
  "kind": "guide",
  "title": "What it gets him, in his words",
  "version": 1,
  "intro": {
    "answer": "One line: the answer, the verdict, the thing that will be true at the end.",
    "unlocks": ["What this makes possible next"],
    "to_hand": ["What he needs beside him before he starts"],
    "hard_part": { "step_id": "2.3", "why": "One line on why it is the tricky bit" },
    "time": "about 40 minutes in three sittings",
    "cost": "nothing",
    "last_verified": "2026-11-28",
    "sources": [{ "label": "Vendor help page title", "url": "https://...", "checked_on": "2026-11-28" }],
    "comparison": null
  },
  "toggles": [{ "key": "platform", "label": "Where", "options": [{ "value": "windows", "label": "Windows" }, { "value": "iphone", "label": "iPhone" }] }],
  "phases": [
    {
      "id": "1",
      "title": "The first sitting, named by what it achieves",
      "minutes": 15,
      "needs": ["The one login or object this sitting needs"],
      "hard_part": "optional one line",
      "lede_html": "<p>One or two sentences on what this sitting does.</p>",
      "steps": [
        {
          "id": "1.1",
          "title": "Do the exact thing",
          "actor": "you",
          "minutes": 3,
          "where": { "label": "IONOS, Email, Mailboxes", "url": "https://...", "kind": "browser" },
          "body_html": "<p>Exactly what to click, type or choose. Nothing vague.</p>",
          "blocks": [{ "label": "paste this", "text": "the exact value or command", "kind": "value" }],
          "expect_html": "<p>What the screen shows when it has worked.</p>",
          "fields": [{ "key": "mailbox_count", "label": "How many mailboxes does it say?", "placeholder": "a number, never a password" }],
          "notes": [{ "kind": "warn", "html": "<p>Only when there is something to warn about.</p>" }],
          "irreversible": false,
          "troubleshooting": [{ "symptom": "What he might see instead", "fix": "What to do then" }],
          "platforms": ["windows"]
        },
        {
          "id": "1.2",
          "title": "Something Claude did first",
          "actor": "claude-code",
          "did_html": "<p>What Claude did, in one or two lines, so he sees it ticked.</p>"
        }
      ],
      "verify_html": ["<p>How this sitting is checked, by Claude where it can be, by his eyes only where it must be.</p>"],
      "why_html": "<p>One line on why this works.</p>"
    }
  ],
  "finish_html": "<p>What now works.</p>",
  "next_guides": ["MYC-123"],
  "handback_prompt": "Paste this to Claude when you are done: ... {{mailbox_count}} ...",
  "rollback_html": "<p>How to undo the whole guide, when it can be undone.</p>",
  "tested": { "1.1": "sandbox", "1.2": "real" }
}
```

### Rules that make a guide a Field guide (the validator refuses anything less)

1. **Every step Phil does carries all four**: the exact place (`where`: a link, or "in the shell" with the shell block), the exact value, command or prompt (`blocks` with a copy button, or a `body_html` that states the exact thing), what he should see when it has worked (`expect_html`), and how long it takes (`minutes`). Miss one and the guide is rejected.
2. **Phases are sittings**: 15 minutes of his own steps each, 20 at most. One is open at a time. A longer job is more sittings, not a longer one.
3. **Claude's steps come first and are shown ticked** with what Claude did (`actor: "claude-code"`, `did_html`). He sees only his own steps unless he asks.
4. **One answer at the top, always.** The comparison table only when there was a real choice. "What this unlocks" and "You will need to hand" always. **The hard part is named up front** with the step id and why.
5. **Verify by itself wherever possible.** Ask for his eyes only where eyes are needed, and say so in the step.
6. **Troubleshooting lives under the step it belongs to**, folded shut. One "why this works" line per phase, folded shut.
7. **Irreversible steps** are marked `irreversible: true`: the renderer warns and asks for a second tap. Say in the step what cannot be undone.
8. **Every platform, always**: a `platform` toggle when steps differ by device, and `platforms` on the step; never a guide for one device only when he has several.
9. **Dated sources and a last-verified date.** The renderer turns the line amber after six months. Say which steps were run against the real thing or a sandbox and which were not (`tested`): untested steps are marked, never hidden.
10. **Answer boxes never take secrets.** No field asks for a password, key, token or recovery code; the placeholder says so when there is any doubt. The renderer refuses anything shaped like a secret. Put the value where the step says and tick the step.
11. **Screenshots only where a screen is confusing**, with the control marked (`screenshot: { src, alt, mark }`).
12. **A "for someone else" mode exists**: give `plain_title` and `plain_body_html` where the ordinary text would be jargon, and a `basics_html` at the top. Same exactness, no shell, larger type.
13. **The hand-back is both ways**: Claude reads answers and failures from the database (`tix answers KEY`, `tix steps KEY`), and the guide carries a `handback_prompt` with `{{field}}` substitutions for the copy button.
14. **Wording**: UK English. Never "overdue", "missed", "failed", "you still have not". Estimates say "about". Buttons say what they do. No em dashes.
15. **Existing guides**: a guide already in progress keeps its ticks and answers; the shape above is a superset of the old one, so extend the definition in place, never recreate the ticket.

### How to deliver one

- In this repo: write the JSON to `docs/guides/<slug>.json`, run the unit tests (the validator covers that folder), then attach it to its ticket with `tix steps KEY --definition docs/guides/<slug>.json` or `PATCH /api/tickets/KEY/steps { definition }`. The ticket's kind is `guide`, `setup`, `runbook`, `test` or `audit`.
- Anywhere else: produce the JSON and tell Phil which ticket it belongs on. Never paste the steps as text.
- Before saying a guide is finished: open `/guides/KEY`, check the thread draws, the first sitting opens, every step has its four parts, the flight plan shows every sitting with its time and needs, and the download has no script.

### What not to do

- Do not write a guide as markdown, a chat message, a document or a comment.
- Do not put a value, key or password anywhere in a guide, even as an example.
- Do not make a phase longer than a sitting, or leave a step without a place, a value, an expectation and a time.
- Do not revive the old "StepsPage" style with vague steps and no times.
