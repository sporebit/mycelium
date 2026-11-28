# Lane U1: the Field guide (2026-11-28)

Branch `lane-field-guide` in `.claude/worktrees/field-guide`, from `46e304e`. No migration. No dependency added. Built to `docs/run/2026-11-28/field-guide-design.md` §2, §3, §4 and §7; §6 (the Field shell, tiles, wall, the Guides menu entry) is lane U2's and was not touched.

## What was built, against the design

| Design | Built | Where |
|---|---|---|
| §2.1 definition additions (format, answer, unlocks, to_hand, hard_part, last_verified, sources, basics_html, handback_prompt, finish_html, next_guides, tested; phase minutes, needs, hard_part; step minutes, expect_html, value_html, troubleshooting, irreversible, did_html, platforms, plain_*, screenshot; block kind) | All, optional; every old key unchanged | `lib/tickets/steps.ts` |
| §2.2 state `failures` and `park`, patch with null to clear | Yes; normaliseState adds the keys only when present, so an old state reads back exactly as before | `lib/tickets/steps.ts` |
| §2.3 phaseProgress, overall with the D14 correction (clamped 0.5 to 3), resumePoint, freshness, flight plan | Yes, pure | `lib/guides/progress.ts` |
| D6 secret guard | Yes: prefixes, BEGIN blocks, 32+ hex, 24+ mixed-case-and-digit tokens | `lib/guides/secret.ts` |
| D13 motion | Durations and levels in one place; thread 480 ms, count 400 ms, fruit 320 ms, finish 1.2 s, next sitting after 600 ms; reduced and off honoured | `lib/guides/motion.ts`, the FIELD GUIDE block in `app/globals.css` |
| D16 validation | Refuses only `format: "field-guide"` definitions; the steps PATCH and the ticket's JSON box both use it | `lib/guides/validate.ts` |
| §3.1 one component, two frames | `FieldGuide` on the ticket page for every run-book kind (StepsPage kept for task, habit, reminder) and on `/guides/[key]` | `components/guide/FieldGuide.tsx`, `components/tickets/StepsSection.tsx`, `app/guides/[key]/page.tsx` |
| §3.1 keyboard n, space, p, f | Standalone page only | `FieldGuide.tsx` |
| §3.1 the Guides list | Newest activity first, miniature thread, percentage, resume line, Open guide; seven then "Show N more" | `app/guides/page.tsx`, `lib/guides/list.ts` |
| §3.2.1 top box | Answer, three cards, freshness line (amber, "check before trusting"), comparison only when present, Before you start folded | `components/guide/TopBox.tsx` |
| §3.2.2 the thread | SVG drawn in measured pixels, sticky, trunk to the overall percentage, a branch per phase, fruit on finish (draws in once), open tip pulses three times, branches are buttons, words in aria-label, counting percentage | `components/guide/Thread.tsx` |
| §3.2.3 resume line | Yes; the standalone page also scrolls to and focuses the next step | `FieldGuide.tsx` |
| §3.2.4 park banner | Yes, with Unpark | `FieldGuide.tsx` |
| §3.2.5 sittings | Finished folds to one line with real minutes; later shows time and needs with Open anyway; one open | `components/guide/Sitting.tsx` |
| §3.2.6 a step | 44 px tick, id, title, actor, platform, where link, minutes, untested mark, copy buttons by kind, value, guarded answer boxes, notes, What you should see (or "No check written for this step"), This did not work, troubleshooting that unfolds on a failure, two-tap irreversible with a hatched umber edge, Claude's steps ticked with what Claude did, Only my steps | `components/guide/StepCard.tsx`, `CopyBlock.tsx`, `AnswerBox.tsx` |
| §3.2.7 phase end | Fruit, the larger chime when sound is on, next sitting opens after 600 ms | `FieldGuide.tsx`, `components/daily/chime.ts` (reused) |
| §3.2.8 finish | What now works, hand-back prompt, next guide cards | `components/guide/Finish.tsx` |
| §3.2.9 footer | Rollback (umber), whole-guide troubleshooting, links, sources with dates | `FieldGuide.tsx` |
| §3.3 flight plan | Every sitting with corrected minutes, needs, the tricky bit, state, total line; printable | `components/guide/FlightPlan.tsx` |
| §3.4 themes | Only `--fg-*` tokens; standalone theme toggle writes ui_prefs.theme | `GuideThemeToggle.tsx` |
| §3.5 wording | ND wording, UK English, no em dashes; buttons say what they do | throughout |
| D5 someone mode | No ids, no actor chips, no command/prompt/shell blocks ("Phil runs this part."), unanswered placeholders dropped, plain_* used, basics on top, type one step larger | `FieldGuide.tsx`, `StepCard.tsx`, `components/guide/text.ts` |
| D8 sound | Ticket page follows the daily chime setting; standalone page has its own toggle (off by default) | `StepsSection.tsx`, `FieldGuide.tsx` |
| §4 PATCH steps | failures and park; park sets scheduled_on to tomorrow (London), logs a "park" activity row, re-syncs Google; unpark clears the date only if it is still the one park set; Field guide definitions validated; secrets refused | `app/api/tickets/[key]/steps/route.ts` |
| §4 GET guide.html | Self-contained, no script, no external font, attachment, secret answers left out, CSP header | `app/api/tickets/[key]/guide.html/route.ts`, `lib/guides/html.ts` |
| §4 GET /api/guides | Yes | `app/api/guides/route.ts` |
| §4 tix | `tix steps KEY --failed ID "note"`, `--park ID "note"`, `--unpark`, `tix guide KEY` | `scripts/tix.mjs` |
| §4 docs/guides | README (authoring, the rule, the shapes) and the worked example "Start the local stack and run one e2e spec" (three 15-minute sittings, one irreversible step, troubleshooting, tested marks) | `docs/guides/` |
| §6 screenshots script | Data-driven (shots, fixtures, actions) for U2 to extend | `scripts/ui-screenshots.mjs` |
| §7 tests | Unit and e2e, below | |

## Files

Added: `lib/guides/{validate,progress,secret,motion,html,list}.ts` and five `.test.ts`; `lib/tickets/steps.test.ts`; `components/guide/` (FieldGuide, Thread, TopBox, Sitting, StepCard, FlightPlan, AnswerBox, CopyBlock, Finish, Html, GuidePage, GuideThemeToggle, text, useMotion, useStepsPatch); `app/guides/page.tsx`; `app/guides/[key]/page.tsx`; `app/api/guides/route.ts`; `app/api/tickets/[key]/guide.html/route.ts`; `e2e/field-guide.phil.spec.ts`; `scripts/ui-screenshots.mjs`; `docs/guides/README.md`; `docs/guides/example-field-guide.json`; this report.

Changed: `lib/tickets/steps.ts`; `app/api/tickets/[key]/steps/route.ts`; `components/tickets/StepsSection.tsx`; `scripts/tix.mjs`; `app/globals.css` (one block appended at the end, "FIELD GUIDE", nothing else edited); `docs/run/2026-11-28/decisions.md`.

## Checked

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on every changed .ts, .tsx and .mjs file | clean |
| `npx vitest run lib/guides lib/tickets` | 10 files, 119 tests passed |
| `E2E_PORT=3111 npx playwright test e2e/field-guide.phil.spec.ts e2e/finish.tess.spec.ts e2e/work-issue.phil.spec.ts` | 26 passed (13 of them the new spec) |
| `E2E_PORT=3111 npx playwright test e2e/smoke.spec.ts --project=phil --grep "opens /guides$"` | 1 passed |
| `tix new / steps --definition-file / --tick / --failed / --park / guide / --unpark` against the 3111 server with the e2e API secret | all as expected; the demo ticket hard-deleted afterwards |
| Row clean-up | no `E2E-guide-%` or screenshot demo tickets left; no orphan park activity rows |

No existing spec opens a run-book ticket page (grep for `steps_definition` and `runbook` in e2e found only `finish.tess.spec.ts`, which seeds steps by SQL), so the new spec covers it: an old definition (`docs/checklists/rotate-secrets.json`) on a `runbook` ticket renders in the Field guide, shows "No check written for this step", and ticks. `finish.tess.spec.ts` and `work-issue.phil.spec.ts` still pass.

## Screenshots

Taken with `E2E_PORT=3111 node scripts/ui-screenshots.mjs`, as Phil, both themes, each looked at and fixed (the flight plan was below the fold, the full-page shot caught the sticky thread mid-page, two button labels named a state rather than an action):

`docs/run/2026-11-28/screenshots/` guide-ticket, guide-page, guide-flight-plan, guides-list, guide-phone, each `-dark.png` and `-light.png` (ten files). They are on disk in the worktree but **not committed**: `.gitignore` line 65 ignores every `screenshots/` folder. Copy them, or `git add -f`, if they should travel with the branch.

## Not done, and why

- The "Guides" entry in the top menu: lane U2's (`lib/home/menu.ts`). `/guides` is reachable by URL until then.
- A public read-only link: D4, deliberately not built.
- Voice: waits for the glasses route.
- `next build`: the integrator's gate.
- `graphify update .`: graphify is not installed on this PC.
- The project copies of `claude/context.md` and `claude/backlog.md` were not touched (lane rule 6: the integrator writes them).
- Not exercised by a test: the `platforms` filter in the renderer (unit-tested in progress), `screenshot` with a mark, and next-guide cards at the finish.

## Decisions made here

Twenty, each in `docs/run/2026-11-28/decisions.md` with its undo, prefixed "U1". The ones most worth a look: the server refuses secrets only on Field guide definitions; a step with no actor is held to the rule; unpark clears the date only if park set it; the open tip pulses three times then rests; the resume scroll happens on the standalone page only; Claude's steps count as done only when ticked.
