# Field guide and the Field shell: design for Stream U (2026-11-28)

*Written by the run's planning session from brief sections 12 and 12b (the Field guide), 6.20 and 6b (tile grid), the backlog's UI decisions of 2026-11-20 (calmer dark, lower contrast, no neon, warm readable type, mono for numbers, inner pages calm and flat, top menu bar, phone opens on the next-thing card), and `claude/nd-design-research.md` rules 4, 5, 7, 9, 11, 24, 25 and the wording table. Two lanes build from this: U1 (the Field guide) and U2 (the Field shell). Neither lane changes the colour tokens below; they were put on `main` first so both branch from the same values.*

## 0. In one paragraph

A Field guide is a run-book, test, guide, setup or audit ticket rendered in a new format: one big answer at the top, one overall progress thread pinned under it that grows and branches as steps are ticked (each phase a branch, a finished phase fruits), then the phases as 15-minute sittings with one open at a time. Every step says exactly where, exactly what (copy button), what you should see, and how long. It is written once as checklist data (`tickets.steps_definition`), shown the same on the ticket page and on a standalone page at `/guides/[key]`, and its state (`tickets.steps_state`) lives in Mycelium's database whichever project the guide belongs to. The existing shape is kept and extended, so every guide already in progress keeps its ticks and answers and simply renders in the new format. The Field shell is a third option under Settings → Appearance → Shell: the Field guide's calmer palette and type applied to the whole app through the token layer, the top menu bar, Home as a plain tile grid with today largest, the phone unchanged on the single next-thing card. Classic stays the default. Nothing existing is removed.

## 1. Decisions taken for Phil (also in decisions.md)

| # | Decision | Why | Undo |
|---|---|---|---|
| D1 | A **phase is a sitting**. Each phase carries `minutes`, `needs` and an optional `hard_part`. No separate sitting object. | 12.6 wants a bar per phase, 12.7 wants one sitting open at a time, 12b wants each phase to be a branch that fruits: the three line up only when phase and sitting are the same thing. Authoring rule: a phase is at most 15 minutes of Phil's own steps. | Add a `sittings[]` grouping later; the renderer would group phases. |
| D2 | **Extend the existing shapes, never replace them.** New fields are optional; a definition without them renders with sensible gaps (no "what you should see" line, no minutes). | 12.29: in-progress guides move across keeping ticks and answers. The state shape is unchanged in every existing key; two new keys are added (`failures`, `park`). | None needed. |
| D3 | **Every run-book kind renders as a Field guide** from this ship, in-progress or not; `task`, `habit` and `reminder` keep the plain checklist. | 12.29 says only in-progress guides move; but moving is a renderer, not a per-guide migration, and leaving finished guides in the old renderer would mean keeping two code paths. The old `StepsPage` stays in the tree for the plain checklist. | Gate `FieldGuide` on `definition.format === "field-guide"` and fall back to `StepsPage`. |
| D4 | **The shareable link is the in-app standalone page** `/guides/[key]` (session required). The **downloadable file** is a self-contained read-only HTML snapshot from `/api/tickets/[key]/guide.html`. A **public** read-only link is **not** built; it is ticketed in MYC with the design question (unguessable token, no answers shown, revocable). | AGENTS.md: no public GET unless the brief decided it. 12.20 says "shareable link" without saying public; the only decided public GET in the brief is the baby gift list (5.12). | Build the public route when Phil decides. |
| D5 | **"For someone else" mode is a view toggle, not a second definition.** It hides step ids, actor chips, shell blocks and `{{key}}` placeholders, enlarges type by one step, shows `plain_html` where an author supplied it and the ordinary body otherwise, and adds the definition's `basics_html` at the top. | 12.25 asks for the same exactness with no jargon and no shell; a second copy of every guide would go stale. | Add per-step `plain_*` fields over time. |
| D6 | **Secret guard on every answer box** in a Field guide: a value that looks like a key, token, password or private key is refused with the words "That looks like a secret. Guides never store secrets; put it where the step says and tick the step." | 12.26 and the run rule that no secret value goes in any ticket. | Per-field `allow_secret_shape: true` is deliberately not offered. |
| D7 | **Park** writes `state.park = {at, step_id, note}` and sets the ticket's `scheduled_on` to tomorrow (London) through the existing ticket PATCH, so the daily proposal can draw it. | 12b: "a Park button, one line on where he stopped, back on tomorrow's list". | Clear `park` and `scheduled_on`. |
| D8 | **Sound** on the standalone page is off by default with a toggle; inside the app it follows the daily loop's `chime` setting (`lib/daily/settings.ts`). Tick = the small chime, phase complete = the larger one, both from `components/daily/chime.ts`. | 12b. | Setting. |
| D9 | **The third shell is called "Field"** in Settings and `ui_prefs.shell = "field"`. | The look is the Field guide's; one word; no claim that it is "the new UI". | Rename is one string and one union member. |
| D10 | **The wall board becomes the tile grid by default** with the old board reachable at `/wall?board=classic`. | 6.20 decided the wall is its own plain tile grid; the wall has not yet been proved on the frame (MYC-205 open), so no live use is disturbed. The wall is a device with no `ui_prefs`, so the shell switch cannot carry it. | Flip the default in `components/wall/WallClient.tsx`. |
| D11 | **Type:** Newsreader (already loaded as `--font-plate`) for guide titles and body; Inter Tight for small labels and controls; JetBrains Mono for values, commands, keys and numbers only. In the Field shell the same rule applies app-wide: body copy and headings in Newsreader, numbers in mono. | Backlog 2026-11-20 round 2: "a warm readable face everywhere, monospace for numbers only". | Swap `--fg-font-body`. |
| D12 | **Colour:** no neon. The Field palette below is moss and bone on warm near-black, contrast held at 4.5:1 for body text and 3:1 for large figures and not pushed higher. Success is moss, not glow; warning is dried amber; danger is burnt umber; irreversible steps get umber with a hatched edge. | Backlog: calmer dark, lower contrast, no neon; ND rule 7. | Tokens. |
| D13 | **Motion:** the thread grows with `stroke-dashoffset` over 480 ms, numbers count over 400 ms, a phase's fruit draws in over 320 ms, the finish moment runs 1.2 s once. Under `[data-motion="reduced"]` the thread and fruits appear at once and numbers do not count; under `off` nothing moves. Nothing loops. | 12.10 "rich and purposeful, tied to something changing"; ND rules 7 and 24. | Durations in `lib/guides/motion.ts`. |
| D14 | **Estimates correct themselves** from real ticks: elapsed for a finished phase = last tick minus first tick in that phase; the ratio of actual to estimated over finished phases (clamped 0.5 to 3) scales the remaining phases' minutes on the flight plan. The definition is never rewritten. | 12b "time between ticks is recorded and estimates correct themselves". | A pure function; drop the scaling. |
| D15 | **Quality gate marks** come from `definition.tested` (`{step_id: "real" | "sandbox" | "untested"}`); an untested step shows a small "untested" mark. The validator does not refuse untested steps. | 12b: "says which it could not; untested steps are marked". | Field. |
| D16 | **Validation** (`lib/guides/validate.ts`) refuses a definition with `format: "field-guide"` when any `actor: "you"` step lacks `where`, a value (`blocks` or `value_html`), `expect_html` or `minutes`, or when a phase's own-step minutes exceed 20. Old definitions without `format` are not refused. A unit test runs it over `docs/guides/*.json`. | 12.8: "or the guide is rejected". | Loosen the rule. |

## 2. Data model (isomorphic, `lib/tickets/steps.ts` extended, new pure helpers in `lib/guides/`)

### 2.1 Definition additions (all optional)

```ts
type StepsDefinition = {
  // existing: slug, kind, title, version, toggles, values, intro, phases, rollback_html, troubleshooting, links
  format?: "field-guide";          // marks a definition written to this design; enables validation
  intro?: {
    // existing: verdict_html, comparison, changes_html, prerequisites, time, cost
    answer?: string;               // the one-line answer, plain text, always shown first (12.16)
    unlocks?: string[];            // "what this unlocks" (12.27)
    to_hand?: string[];            // "you will need to hand" (12.27)
    hard_part?: { step_id: string; why: string };   // "the tricky bit is step 7, and here is why" (12b)
    last_verified?: string;        // ISO date; amber after six months (12.24)
    sources?: Array<{ label: string; url: string; checked_on: string }>;
  };
  basics_html?: string;            // shown at the top in "for someone else" mode (12.25)
  handback_prompt?: string;        // {{key}} substituted; the copy-this-prompt button (12.22)
  finish_html?: string;            // "what now works" at the end (12.28)
  next_guides?: string[];          // ticket keys offered at the finish (12.28)
  tested?: Record<string, "real" | "sandbox" | "untested">;   // quality gate marks (D15)
};

type Phase = {
  // existing: id, title, lede_html, steps, verify_html, why_html
  minutes?: number;                // the sitting's length; default = sum of its steps' minutes
  needs?: string[];                // what to have to hand for this sitting (flight plan)
  hard_part?: string;              // one line, shown on the flight plan and the phase header
};

type Step = {
  // existing: id, title, actor, where, route, body_html, blocks, fields, notes, after_html
  minutes?: number;                // how long (12.8)
  expect_html?: string;            // what you should see when it has worked (12.8)
  value_html?: string;             // an exact value shown with a copy button when a block is too heavy
  troubleshooting?: Array<{ symptom: string; fix: string }>;   // folded under the step (12.13)
  irreversible?: boolean;          // warning style and a second tap to tick (12.23)
  did_html?: string;               // for actor "claude-code": what Claude did (12.9)
  platforms?: string[];            // shown only when the `platform` toggle is one of these (12.17)
  plain_title?: string;            // "for someone else" mode alternatives (D5)
  plain_body_html?: string;
  screenshot?: { src: string; alt: string; mark?: { x: number; y: number; w: number; h: number } };  // 12.11
};
```

`StepBlock` gains `kind?: "command" | "value" | "prompt"` so the copy button can say "copy command", "copy value", "copy prompt". A `prompt` block in "for someone else" mode is hidden with the line "Phil runs this part".

### 2.2 State additions

```ts
type StepsState = {
  toggles: Record<string, string>;                 // existing; new well-known keys: platform, mode ("me" | "someone"), sound ("on" | "off", standalone only)
  steps: Record<string, { done: boolean; at: string }>;   // existing, untouched
  answers: Record<string, string>;                 // existing, untouched
  failures?: Record<string, { at: string; note: string }>;  // "this did not work" per step (12.14)
  park?: { at: string; step_id: string; note: string } | null;   // Park (12b)
};
type StatePatch = {
  // existing: toggles, steps, answers
  failures?: Record<string, { note: string } | null>;  // null clears
  park?: { step_id: string; note: string } | null;
};
```

`mergeState` handles both new keys (null deletes). `normaliseState` tolerates their absence. The PATCH route passes them through unchanged. Ticking a step that has a failure recorded keeps the failure (it is history), and the renderer shows "did not work at 14:02, then done at 14:20".

### 2.3 Derived, never stored (`lib/guides/progress.ts`)

- `phaseProgress(def, state)`: per phase `{done, total, minutes_est, minutes_actual | null, state: "done" | "open" | "later"}`. Exactly one phase is `open`: the first with an unticked visible step.
- `overall(def, state)`: `{done, total, pct, minutes_left_est}` with D14's correction.
- `resumePoint(def, state)`: the first unticked visible step and a "where I was" line built from the newest tick ("You ticked 2.3 at 21:40 yesterday").
- `freshness(def, today)`: `"fresh" | "amber" | "unknown"` from `last_verified` (six months).
- `isSecretLike(value)`: the guard. Refuses: 24+ chars with no spaces and mixed case plus digits; anything starting `sk-`, `ghp_`, `gho_`, `mtk_`, `xox`, `AKIA`, `eyJ`; `-----BEGIN`; a run of 32+ hex; anything the author marked with the field `kind: "secret-free"`'s opposite (there is no such kind; all fields are guarded).

## 3. Rendering

### 3.1 One component, two frames

`components/guide/FieldGuide.tsx` takes `{definition, state, kind, onPatch, busy, frame: "ticket" | "page", chime}` and is mounted by:

- `components/tickets/StepsSection.tsx` for `RUNBOOK_KINDS` (replacing `StepsPage` there; `StepsPage` stays for the plain checklist).
- `app/guides/[key]/page.tsx`: the standalone page. Server component reads the ticket through the user client, 404 when the caller cannot see it, then the client component. Full width, no sidebar chrome, its own header (title, the project key, Open ticket, Flight plan, Theme toggle, Sound toggle, Download). Keyboard: `n` next unticked, `space` tick the open step, `p` park, `f` flight plan.
- `app/guides/page.tsx`: every run-book kind ticket the caller can see that has a definition, newest activity first, each with its thread in miniature, pct, the resume line, Open guide. Reachable from the top menu bar under Work as "Guides" (U2 adds the menu entry; U1 adds the page).

### 3.2 Layout, top to bottom (desktop and phone are the same column; the phone has no second column anywhere)

1. **Top box.** The one-line `answer` set in Newsreader at `--text-24` (phone `--text-20`). Under it a row of three small cards: *What this unlocks* (`unlocks`), *You will need to hand* (`to_hand`), *The tricky bit* (`hard_part`: "Step 3.2: why"). Then the freshness line: "Last verified 12 Nov 2026" in soft text, amber with "check before trusting" when stale. The comparison table (`intro.comparison`) only when it exists. Prerequisites, time and cost fold under one "Before you start" line.
2. **The thread.** An SVG band 72 px tall (phone 56) pinned with `position: sticky; top: 0` under the app bar. A trunk runs left to right; its drawn length is the overall pct. From the trunk one branch per phase rises at even spacing; a branch's drawn length is that phase's pct; a finished phase's branch ends in a small cap (the fruit) that draws in once. The open phase's branch tip has a soft pulse (none under reduced motion). To the right: the big number pct in mono, and "about N min left" in soft text. Clicking a branch scrolls to that phase. `aria-label` carries the words ("Phase 2 of 4, 3 of 5 steps, about 9 minutes").
3. **Resume line** (when anything is ticked and anything is left): "Where you were: ticked 2.3 at 21:40 yesterday. Next: 2.4 Set the forward." Opens at the next unticked step (`scrollIntoView` once on mount, no smooth scroll under reduced motion).
4. **Park banner** when `state.park` is set: "Parked at 2.4 on Thursday: *your note*. Back on today's list." with Unpark.
5. **Phases as sittings.** Finished phases collapse to one line: a tick, the title, "12 min, finished Tue 21:52" (actual when known, else estimated). Later phases show title and time only ("Sitting 3 · Forwarding · about 10 min · needs: IONOS login") and are not expandable until the open one finishes (a small "open anyway" link for the stubborn). The open phase is expanded: header with its branch colour, lede, the `hard_part` line if any, then the steps, then Verify and Why folded shut.
6. **A step** (open phase only):
   - Row: the tick control (44 px square hit area), step id in mono (hidden in someone mode), title in Newsreader `--text-16`, the actor chip, the platform chip when `platforms` is set, the where chip (a link when `where.url` resolves), "about N min" in mono.
   - Body: `body_html`; the blocks, each with a copy button labelled by kind; `value_html` with its own copy; the fields (answer boxes, guarded); notes.
   - **What you should see**: a bordered line in moss with `expect_html`. Always rendered for `actor: "you"` steps; when missing, the line reads "No check written for this step" so the gap is visible.
   - **This did not work**: a quiet button; opens a one-line box; saving writes `failures[id]` and shows "Noted at 14:02" with the note; the step stays unticked. The troubleshooting list unfolds automatically when a failure is recorded.
   - **Troubleshooting**: folded under "If it did not work" when `step.troubleshooting` exists.
   - **Irreversible**: umber border with a hatched left edge, the word "Cannot be undone" in the row, and ticking takes two taps (first tap arms for 4 s: "Tap again to confirm").
   - `actor: "claude-code"` steps render ticked and collapsed with "Claude did this: *did_html*"; the "my steps" filter (default on in someone mode, off otherwise) hides them.
   - Ticked steps collapse to the row with their time.
7. **Phase end**: Verify list and Why line, folded; when the last step of the open phase is ticked the branch fruits, the larger chime plays if sound is on, and the next phase expands after 600 ms.
8. **Finish** (every visible step ticked): the trunk completes, a short "What now works" from `finish_html` (or the `unlocks` list), the hand-back block (copy this prompt), and *Next guide* cards for `next_guides` that resolve to tickets the caller can see, each with its pct.
9. **Footer**: rollback (folded, umber), the whole guide's troubleshooting table (folded), links, sources with checked-on dates.

### 3.3 Flight plan view

A toggle in the header (and `f`). One screen: every sitting as a row with number, title, estimated minutes (corrected per D14), `needs`, `hard_part`, and its state. A total line: "4 sittings, about 48 minutes". The thread is drawn in full above it. Printable: `@media print` hides controls.

### 3.4 Themes

Both themes use the tokens in §5 through `light-dark()`; nothing in the guide uses a literal colour. The standalone page has its own theme toggle writing `ui_prefs.theme` like the shells' toggle does.

### 3.5 Wording

ND rules. Never "overdue", "missed", "failed", "you still have not". The failure button says "This did not work". The stale line says "check before trusting", not "out of date". Estimates say "about". Buttons say what they do.

## 4. API and files

- `PATCH /api/tickets/[key]/steps` accepts `failures` and `park` (through `mergeState`). When `park` is set with a `step_id` the route also sets `scheduled_on` to tomorrow London and appends a `ticket_activity` row (`action: "park"`); when `park: null` it clears `scheduled_on` only if it equals that date.
- `GET /api/tickets/[key]/guide.html`: a self-contained HTML document (inline CSS from the same tokens, no scripts, no external fonts; system serif fallback) rendering the guide read-only with its current ticks and answers (answers pass the secret guard again on the way out). `Content-Disposition: attachment; filename="<key>-<slug>.html"`. Session or `API_SECRET` only.
- `GET /api/guides`: the list for `/guides` (tickets the caller can see with `kind in RUNBOOK_KINDS` and a definition), each with counts and the resume line.
- `docs/guides/`: Field guide definitions authored in the repo (`<slug>.json`), with `docs/guides/README.md` saying how to author one to this design and the validation rule. `docs/checklists/` stays for the old definitions.
- `lib/guides/`: `validate.ts`, `progress.ts`, `secret.ts`, `motion.ts`, `html.ts` (the download renderer), each with a `.test.ts`.
- `scripts/tix.mjs`: `tix steps KEY --failed 2.3 "note"` and `tix steps KEY --park 2.3 "note"`; `tix guide KEY` prints the flight plan.
- `components/guide/`: `FieldGuide.tsx`, `Thread.tsx` (the SVG), `TopBox.tsx`, `Sitting.tsx`, `StepCard.tsx`, `FlightPlan.tsx`, `AnswerBox.tsx` (guarded), `CopyBlock.tsx`, `Finish.tsx`.

## 5. Tokens (already on `main` in `app/globals.css`, block "FIELD")

```
--fg-paper      light-dark(#f3efe4, #121410)   page
--fg-paper-2    light-dark(#eae5d7, #181b16)   cards
--fg-paper-3    light-dark(#dfd9c9, #1f231d)   insets, code
--fg-line       light-dark(rgba(30,32,25,.12), rgba(236,230,210,.10))
--fg-ink        light-dark(#1e2019, #e6e1d0)   body (4.5:1 and a little more on paper)
--fg-ink-soft   light-dark(#5d6054, #a9a593)   secondary
--fg-ink-faint  light-dark(#8b8d80, #6c6e62)   tertiary, never for body copy
--fg-moss       light-dark(#3f7a4e, #8fb996)   progress, done, "what you should see", links
--fg-moss-wash  light-dark(rgba(63,122,78,.10), rgba(143,185,150,.09))
--fg-amber      light-dark(#9a6a1d, #d9b06a)   warnings, stale
--fg-umber      light-dark(#9e4a30, #cf8368)   irreversible, danger
--fg-font-body  var(--font-plate), Georgia, "Times New Roman", serif
--fg-font-ui    var(--font-sans)
--fg-font-mono  var(--font-mono)
```

The Field shell (`[data-shell="field"]`) maps the app's canonical tokens onto these: `--surface-0..3` → paper, paper-2, paper-3, paper-3; `--text-hi/mid/lo/ghost` → ink, ink-soft, ink-faint, ink-faint; `--glow` → moss; `--glow-wash` → moss-wash; `--v2-warn`/`--warn` → amber; `--v2-error`/`--error` → umber; `--hairline` → line; `--font-display` → `--fg-font-body`. Every inner page inherits the calmer palette through its existing classes with no edit, which is the "calm and flat" the backlog asked for. The plate's own tokens are untouched (the plate is the "new" shell's Home, not the Field shell's).

## 6. The Field shell (lane U2)

- `ui_prefs.shell: "classic" | "new" | "field"`; `UI_PREFS_DEFAULTS.shell` stays `"classic"`. `app/layout.tsx` passes the third value through; `ShellPref` type gains it; `ShellFrame` renders the top menu bar for both `new` and `field` (one branch, `data-shell` carries the value); Settings → Appearance → Shell gains "Field" with the line "Field: the Field guide's calm look everywhere, a top menu bar, Home as a tile grid. New: the top menu bar with Home as the Specimen plate. Classic: the sidebar and the dashboard."
- **Home on desktop** in the Field shell: `components/home/TilesView.tsx`, registered in `components/home/registry.ts` as `tiles`, chosen by the shell (`new` → plate, `field` → tiles; the registry gains `defaultViewForShell`). Fed by the unchanged `HomeData` contract. A CSS grid of 6 columns, rows auto, 16 px gap, tiles of varying spans:
  - **Today** (the largest: 4 × 2): a greeting by time of day ("Good evening, Phil" from the day label; 6b), the win large with its first step and minutes, the rest of today as a short list with state, the Done and Start affordances the plate already wires to the daily API (reuse its handlers; do not duplicate the API calls).
  - **This week** (2 × 1): seven cells of fill and the count, lifetime count under it.
  - **Hours** (2 × 1): banked against target as a ruler and the note; hidden when `hours` is null.
  - **Guides in progress** (2 × 1): up to three guides with their miniature thread and resume line, from `/api/guides` (client-fetched with `useApi`; the only tile that fetches, because the contract does not carry guides and the contract is shared with the wall).
  - **Captures waiting** (1 × 1), **Nudges** (2 × 1, hidden when none), **Gone quiet** (2 × 1, factual, no red, hidden when none).
  - Family and Finds tiles are **not drawn** (the contract has them null).
  - Tiles are flat: paper-2 on paper, one hairline, no shadow, radius 10. Headings in Newsreader; every number in mono. Done gets the small chime and the Today tile's win flips to moss; no network backdrop, no spores, no illustration (U2 is not a mycelium concept; the brief says do not invent one).
- **Phone**: unchanged, the single next-thing card (`FocusCard`).
- **Top menu bar**: unchanged except the `Guides` entry under Work (`lib/home/menu.ts`), which the `new` shell also gets.
- **The wall** (`components/wall/Board.tsx` → `TilesBoard`): the same `WallGlance` drawn as a 6-column tile grid with **what is on today largest** (the family's appointments for today and the countdown, 4 × 2), people as 2 × 1 tiles (numbers and week fill as now; titles still wait for the unlock), weather and bins 1 × 1 each, the baby line and three taps 2 × 1, and a greeting by time of day in the header. `?board=classic` keeps the old board. The finance guard test and the e2e spec must still pass unchanged; add no field to the contract.
- **Screenshots**: `scripts/ui-screenshots.mjs` (Playwright against the e2e server as Phil) captures, in both themes: Home desktop in the Field shell, Home on a 390 px phone, a Field guide on the ticket page, the standalone guide page, the flight plan, the `/guides` list, Settings → Appearance, the wall tiles, one inner page (`/work`) under the Field shell. Files to `docs/run/2026-11-28/screenshots/<name>-<theme>.png`. Each is logged in decisions.md with one line on the design choice it shows.

## 7. Tests and gates

- Unit: `lib/guides/*.test.ts` (validate accepts the old shapes and refuses a field-guide step missing where, value, expect or minutes; progress and resume; D14 correction clamp; secret guard positives and negatives; html renderer has no `<script>` and no answer that fails the guard; merge of `failures` and `park`). `lib/home/menu.test.ts` updated for Guides. `lib/wall/finance.test.ts` unchanged and passing.
- E2E (local stack, port per lane): `e2e/field-guide.phil.spec.ts` (a guide ticket made through the API with a field-guide definition: the thread, one open sitting, tick, "this did not work", irreversible double tap, park sets tomorrow's date, resume line, flight plan, finish, download is a file with no script tag, someone mode hides shell blocks); `e2e/shell-field.tess.spec.ts` (set shell field: top menu present, tiles present with Today largest, phone viewport shows the focus card, theme toggle, Settings shows three options, set back to classic); `e2e/wall.phil.spec.ts` still passes with tiles default and `?board=classic`.
- Gates before the integrator ships: `rm -rf .next && npx next build`; `npx vitest run`; the lane's e2e specs plus `e2e/home.tess.spec.ts`, `e2e/wall.phil.spec.ts`, `e2e/settings-nav.tess.spec.ts`, `e2e/multiuser-lifecycle.phil.spec.ts`. An on-demand dump is taken before any `db push` (none is expected: no migration in Stream U).

## 8. What Stream U does not do

- No public guide link (D4; ticketed).
- No voice (12b "by voice": waits for the glasses route; ticketed under the glasses epic).
- No per-guide data migration (D2, D3).
- No new Home concept, no revival of Core sample, Burrow or Colony, no illustration work (MYC-192 stays Phil's).
- No change to the wall's device sign-in, PIN or speech.
- No migration.
