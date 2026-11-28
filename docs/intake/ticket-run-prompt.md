# Ticket and UI run prompt for Claude Code (v2, 2026-11-28 03:00)

*Paste into Claude Code in `A:\Projects\Mycelium` after saving the intake doc to `docs/intake/intake-2026-11-27.md`. Content comes from that intake doc; this prompt says how to run.*

*Phil's changes in v2: run without him and log every skip and decision; be smart with model use; as many agents or sessions as needed; build the UI redesign first, alongside the ticket run (he chose both the Field guide template and the app UI); commit and deploy as it goes; no key rotation in this run, ticket it. `[claude]` flagged once: the recorded decision was no app UI work until Phil brings a direction, and none is recorded; complied, built behind the shell switch so it is reversible. `[claude]` flagged once: deferring rotation leaves the census files and old server keys exposed for longer; his call.*

```
This is a long unattended run in A:\Projects\Mycelium. Do everything you can
without me. Two streams run side by side from the start:
  STREAM U  the UI redesign (build, commit, deploy)
  STREAM T  tickets for everything in the brief (plan, research, create)

Read first, in this order:
1. AGENTS.md (every invariant in it applies).
2. docs/intake/intake-2026-11-27.md  (the brief: my answers, in full).
   If it is missing, STOP and tell me. Do not work from memory.
3. The Work, tickets and checklist specs and code (lib/work/, /api/work/*,
   scripts/import-harvest.mjs, docs/checklists/, the checklist renderer).
4. claude/backlog.md, docs/run/ui-report.md, and claude/ui-direction.md and
   claude/nd-design-research.md if the repo holds copies.
5. The FixForward repo under A:\Projects (read-only).

HOW TO READ THE BRIEF
- Sections 1 to 12 are my first answers; "b" sections add to them; "Final
  five" says how the ticket stream must work. Round 3 (H1 to H10) is later
  and WINS wherever it differs.
- "[claude]" marks a flag raised once. My answer stands. Do not reopen it;
  pass every flag to the red team.
- "Assumed" (H2) means I did not answer: ticket the cautious "check first"
  version as written.
- H10 "Undecided" items get NO tickets of their own: one checklist ticket
  in LIFE, "Keep or drop: items from old chats", one row each.
- Everlight work items are never ticketed. Health threads are not ticketed
  except those H5 names, and those are owner-only.

WORKING WITHOUT ME
- Do not stop to ask. Stop a piece of work only for a sign-in that only I
  can do or for anything that costs money; park that piece, ticket it for
  me with exactly what I need to do, and carry on with everything else.
- Keep docs/run/2026-11-28/decisions.md as you go, one line each, newest
  last: every decision you made for me (what, why, how to undo it), every
  item you skipped (and why), every assumption, every place the brief was
  unclear and what you chose. Nothing goes unlogged.
- At the end, load that file into one checklist ticket in LIFE, "Review:
  decisions made for me on 2026-11-28", one row per entry with Keep / Undo
  and an answer box, so I can go through it in 15-minute sittings.

AGENTS, SESSIONS AND MODELS
- Use as many subagents and parallel sessions as the work needs. Code
  streams run in separate worktrees. Exactly one lane owns
  supabase/migrations at a time; hand the lock over explicitly and number
  by build order. Never symlink node_modules or .next.
- Spend model effort where it changes the result:
  - Strongest model: planning, architecture and schema decisions, the red
    team, the ledger, UI design judgement, anything that could lock me
    out, lose data or cost money.
  - Mid model: writing ticket rundowns, research dossiers, ordinary
    feature code, code review.
  - Smallest model: bulk and mechanical work (formatting, renames, loading
    rows, de-duplicating against existing tickets, link checks, summaries
    of files already read).
  - Do not re-read large files in every agent: write one shared digest of
    the brief per epic (docs/run/2026-11-28/digests/) and hand agents the
    digest plus the section numbers they need.
  - Log in the report roughly which model did which class of work.

STREAM U: UI REDESIGN (starts first, runs alongside)
U1. The Field guide (brief sections 12 and 12b). Build the new guide and
    checklist format as specified: written once as checklist data, shown
    the same as a Mycelium ticket and as a standalone page; overall thread
    progress bar that branches and fruits; 15-minute sittings, one open at
    a time; every step with exact place, exact value or command with copy,
    what I should see, how long; Park, "this did not work", flight plan
    view, both themes, reduce-motion respected, state in Mycelium's
    database for every guide. Move only in-progress guides across, keeping
    ticks and answers. Stream T's guides use this format once it ships.
U2. The app UI. No direction from me is recorded, so do not invent a new
    concept and do not revive the mycelium Home views I scrapped. Build on
    what is already decided in the brief and backlog: calmer dark, lower
    contrast, no neon; warm readable type with monospace for numbers only;
    inner working pages calm and flat; the top menu bar with dropdowns;
    phone opens on the single next-thing card; Home and the wall as a
    plain tile grid of varying sizes (brief 6.20 and 6b) with what is on
    today largest; the Field guide's look as the shared visual language.
    Ship it as a NEW option under Settings > Appearance > Shell, Classic
    stays the default, nothing existing is removed. Log every design
    choice in decisions.md with a screenshot path so I can judge it.
- Commit small and often. When the build and tests pass (rm -rf .next,
  npx next build, unit and e2e), merge and deploy; do not batch up. Take an
  on-demand database dump before every db push.

STREAM T: TICKETS
What to create
- One epic per topic (12) plus the epics Round 3 adds, each with a FULL
  breakdown: every step its own ticket with a rundown someone who never
  saw this chat could act on (what, why, what done looks like, what it
  unlocks, what it depends on). Link blockers and dependents both ways.
- Projects: MAIL, SEC, HOME, MYC as recorded; new projects for FixForward,
  baby preparation, self-hosting (Substrate), Meta glasses, and LIFE.
  Imported projects (DropShipAuto and others) keep their project.
- Backlog with NO date, except what the brief dates: baby tickets (worked
  back from June 2027, big items early), renewals and contract ends (a
  month ahead; broadband review March 2027), the garden design sitting
  (February 2027) and garden work (March to May 2027), the Substrate
  30-day hands-off proof (before June), the optics allowance (1 February
  2027), birthday offers (before 23 May 2027).
- Every ticket carries points; tickets I must do myself are 15-minute
  sittings. Tick-box work is checklist data, never a markdown list.
- KEYS AND SECRETS: do NOT rotate, revoke, reset or delete any key,
  password, token or credential file in this run, and do not open them.
  Ticket every one named in the brief (H2.6, H2.7, H2.10, H2.11, the
  Stripe test key, the Mycelium rotations already queued) in SEC, names
  only, no values, as one "rotate everything" guide plus its parts. They
  are for later; they do not go at the front of the queue.
Steps
T1. Plan: docs/run/2026-11-28/plan.md (epics, tickets, links, dates,
    points). Nothing created yet. Search existing tickets and backlog so
    nothing is ticketed twice.
T2. Dossiers: one per epic, agents in parallel, specific to my kit and
    answers, every source dated with the day checked; saved to Docs and
    linked from the epic. Correct the plan where facts differ; log it.
T3. Red team: an independent agent that has NOT seen the plan being
    written checks every epic against the brief: contradictions, the nine
    flags in H9 and the two in H10, anything that could lock me out, lose
    data or cost money, dates that cannot fit. Fix the plan first.
T4. The ledger, bluntly: hours and pounds per epic against the evenings I
    have before June 2027 at my stated pace, "this is N months of
    evenings", and what has to give. Do not soften it.
T5. Create with an idempotent script modelled on
    scripts/import-harvest.mjs, a stable id per ticket; prove on the local
    stack (second run creates 0), then production.
T6. The map: a diagram of all epics and what unlocks what, in Docs, and
    build the live roadmap page if Stream U is ahead; otherwise ticket it.
T7. Day one: name one "start here" ticket (the one that unlocks the most)
    and write its guide in full as a Field guide. Write the first sitting
    for every dated baby ticket.

RULES
- All AGENTS.md invariants: RLS pattern on every new table, one
  migrations owner, clean build before every push, no public GET unless
  the brief decided it, no secret value in any ticket, doc, commit, log
  or message.
- Stay inside the £5 monthly AI cap for anything the app itself calls.
- UK English. No em dashes.

FINISH
Write docs/run/2026-11-28/report.md: what shipped in Stream U (with how
to switch it on), ticket counts per project and epic, the ledger, what
the red team changed, what is parked waiting on me, the start-here
ticket's key, and model use by class of work. Update claude/backlog.md
and the specs for anything built. Then send me the short version with
the link to the decisions review ticket.
```
