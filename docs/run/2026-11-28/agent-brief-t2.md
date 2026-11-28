# Brief for the dossier-and-rundown agents (Stream T, steps T2 and the ticket data for T5)

You are one of eleven agents working in parallel on Phil's Mycelium repo at `A:\Projects\Mycelium` during an unattended run. Phil (he/him) is away; never ask him anything, never message him. You write files only; you create no tickets, change no code, run no git command. Your epics are named in your prompt.

## Read first
1. `docs/run/2026-11-28/plan.md` §0 (how to read), §0.1 (dates), your epic sections, §25 (cross-epic order), §27 (open points).
2. Your digests in `docs/run/2026-11-28/digests/` (named in your prompt). The digest quotes Phil's answers verbatim with the brief's line numbers; where you need the surrounding text read `docs/intake/intake-2026-11-27.md` at those lines.
3. `docs/run/2026-11-28/field-guide-design.md` §2.1 and §2.2 (the Field guide data shapes) for any `steps_definition` you write.
4. `claude/checklists-spec.md` §3.1 to §3.2 for the base shapes, `docs/checklists/rotate-secrets.json` for a real example.
5. The open-ticket list at `docs/run/2026-11-28/open-tickets.txt` (key, category, kind, title) for de-duplication: if a ticket you are about to write already exists, do not write it; put its key in `links` or `existing` instead and say so in the rundown.

## Rules that bind every word you write
- **No secret values, ever.** Keys, passwords, tokens, recovery codes and the like are named (for example "the Google OAuth client secret"), never quoted, even partially, even if you find one in a file. Do not open `.env*`, `data/private`, or any credential file.
- **Nothing is rotated, revoked, reset, deleted or switched off in this run.** Tickets about keys say what Phil will do later, in a named place, and that nothing happens until he does it.
- Phil's own work is **15-minute sittings**: a `guide`/`setup` ticket's phases are each at most 15 minutes of his steps; a job longer than that is several phases (or several tickets, if the plan split it).
- **Tick-box work is checklist data, never markdown.** Every ticket of kind `guide`, `setup`, `audit` or `test` has a `steps_definition`. Tasks of kind `task` have none (their description carries the rundown).
- UK English. **No em dashes or en dashes anywhere** (use commas, colons, full stops). No "overdue", "missed", "failed", "you still have not". Estimates say "about".
- Dates only where the plan gives one. Everything else is Backlog with no date.
- Where the brief's Round 3 (H1 to H10) differs from sections 1 to 12, Round 3 wins. `[claude]` flags are not reopened: write the ticket as Phil decided and note the flag in one line.
- Never put Phil's name, email addresses, domains that identify him, his address, or anything private into a web search query. Search for products, protocols, services and rules in general terms.

## Deliverable 1: the dossier, `docs/run/2026-11-28/dossiers/<epic-slug>.md`
A dated research dossier for the epic, specific to Phil's kit as the digest describes it (for example the RT-AX86U on Asuswrt-Merlin, IONOS Mail Basic, Proton Pass, Ray-Ban Meta Gen 3 with an iPhone 17 Pro, a 4th Utility connection, eBay UK private seller, Supabase and Vercel Hobby, Home Assistant). Use WebSearch (and the web-fetch agent for pages) for every fact that depends on a product, a price, a limit, a law or a date. Every source line carries the day it was checked: `(checked 2026-11-28)`. Where a fact could not be verified, say "UNVERIFIED" next to it. Sections:
1. **What Phil decided** (one paragraph from the digest, no re-opening).
2. **His kit and constraints** (what is in the house and on the accounts, as stated).
3. **What the research found** (the substantive part: options, limits, prices, steps, gotchas, each with a source).
4. **Risks** (lock-out, data loss, money, Kirsty-facing breakage), each with the mitigation the tickets carry.
5. **Facts that differ from the plan** (anything where your research contradicts a plan line or a digest assumption; one bullet each, naming the plan sid). The integrator corrects the plan from this section.
6. **Sources** (numbered, URL, title, checked date).
Length: as long as it needs to be, no padding. No code.

## Deliverable 2: the ticket data, `docs/run/2026-11-28/tickets/<epic-slug>.json`
One JSON file per epic (if your prompt gives you several epics, one file each). Exact shape:

```json
{
  "epic": {
    "sid": "E.mail",
    "project": "MAIL",
    "title": "Email migration: sixteen addresses, 1,736 accounts, the old domain's quiet year",
    "description": "Markdown. The epic's one-paragraph aim in Phil's decisions, then '## Order' (the sequence of its tickets in prose), '## Done means', '## Flags' (each [claude] flag that touches it, one line, not reopened), '## Dossier' (a line saying the dossier is attached in Docs; the integrator fills the link).",
    "dossier": "dossiers/mail.md",
    "links": ["PW-30", "PW-71"]
  },
  "tickets": [
    {
      "sid": "mail.01",
      "title": "Exactly the plan's title (improve wording only if it is wrong)",
      "kind": "task | guide | setup | audit | test",
      "points": 2,
      "due": null,
      "who": "P | C | PC | PK | K",
      "description": "Markdown with exactly these five headings in this order: ## What (two to six sentences: the exact job, the exact place, the exact value or thing to look for), ## Why (one to three sentences in Phil's decision's words), ## Done looks like (observable, checkable), ## Unlocks (the sids or keys this unblocks, with a phrase each), ## Depends on (the sids or keys this waits for, with a phrase each; 'Nothing' if none). Add ## Flag when a [claude] flag applies. Add ## Cost when money is involved (an amount or 'to be priced', and that nothing is bought in this run).",
      "after": ["mail.03", "MYC-195"],
      "links": ["PW-57"],
      "tags": ["mail", "security"],
      "steps_definition": null
    }
  ],
  "existing": [
    { "key": "MYC-195", "set_epic": true, "append": "\n\n## Unlocks\nfin.01 to fin.31: every Finance ticket that reads transactions." }
  ]
}
```

- `after` lists blockers by plan sid or existing key; the create script writes a dependency row for each and the app shows both directions.
- `links` lists existing tickets to relate (not block).
- `tags` are from the space's label list where one fits (`security`, `secrets`, `research`, `guide`, `home`, `garden`, `house`, `maintenance`, `admin`, `shopping`, `planning`, `documentation`, `dev`, `devops`, `testing`, `ui`, `selling`, `payment`, `contract`, `medical`, `fitness`, `nutrition`, `baking`, `recipe`, `cleaning`, `chore`, `car`, `phone`, `pc`, `computer`, `browser`, `calendar`, `contacts`, `photos`, `video`, `travel`, `holiday`, `idea`, `reminder`, `schedule`, `tools`, `troubleshooting`, `feature`, `bug`, `project`, `personal`, `work`, `form`, `communication`) plus your epic's slug.
- `steps_definition` for `guide`/`setup`/`audit`/`test` kinds, in the Field guide shape (`format: "field-guide"`): `slug`, `kind`, `title`, `version: 1`, `intro: { answer, unlocks[], to_hand[], time, hard_part? , last_verified: "2026-11-28", sources[] }`, `phases[]` each `{ id, title, minutes, needs[], steps[] }`, each step `{ id, title, actor: "you" | "claude-code", minutes, where: { label, url?, kind: "browser" | "terminal" | "page" | "decision" | "dashboard" }, body_html?, blocks?: [{ label, text, kind: "command" | "value" | "prompt" }], expect_html, fields?: [{ key, label, placeholder }], notes?: [{ kind: "warn" | "security" | "info", html }], irreversible?: true, troubleshooting?: [{ symptom, fix }] }`. Rules: every `actor: "you"` step has `where`, `expect_html`, `minutes`, and a value (`blocks`, or a `body_html` that states the exact thing to do); a phase's `you` steps sum to 15 minutes or fewer (20 at most); `irreversible: true` on anything that cannot be undone; `fields` only for non-secret answers (a date, a model number, a yes or no, a count), never a password or key, and the field's `placeholder` says so when there is any doubt; `tested` map with `"untested"` for every step (nothing was run in this run) unless you verified a step against documentation, then `"sandbox"`. Short tickets (one sitting) are one phase with three to six steps. Keep `body_html` to allowed tags: p, br, strong, em, code, pre, ul, ol, li, a, h4, span, small.
- Each ticket's `description` must be self-contained: Phil reads it cold, months from now.
- Write titles that stand alone in a list (no "Part 2", no bare "Research").

## Deliverable 3: a short note back
Reply with: the files written, the ticket count per epic, the number of `steps_definition`s, the plan lines you believe are wrong (copied from the dossier's section 5), and any ticket you did not write because it already exists (key). Nothing else.

## Model note
You are a mid-tier model doing rundowns and research. Where a judgement would lock Phil out, lose data or cost money, do not decide it: write the cautious "check first" version and put the question in the dossier's section 5.
