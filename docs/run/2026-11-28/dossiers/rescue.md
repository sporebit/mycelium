# Dossier: E.rescue, Harvest rescue and the delete gate (LIFE)

*Written 2026-11-28 by a dossier agent during the unattended run. Sources: the ten harvests of 2026-11-28 in `docs/intake/harvests/`, the repo, the old repos on the PC (read only), and two Anthropic help pages for the delete step.*

## 1. What Phil decided

Before any old Claude project is deleted (H8): rescue everything into `claude/archive/` first, the project docs (the office design state, both email plans, the PhirstMaxxing roadmap and prompts) and the files that live only in chats (the Daytripper spec, Alex's brochure page and plan, DropShipAuto's tracker and plan files), with Phil running one short export prompt per project (Prompt D). The eleven chats the harvests could not read get the one-chat harvest (Prompt C): six in Office Set Up, four in PhirstMaxxing, the email inventory chat in Personal Online Security. Delete only after the tickets exist in Mycelium and have been checked against the harvest; both Everlight projects and Mycelium are kept. H10 adds the 41 unread chats outside projects (first five first) and three unswept projects (Ye - Madrid, PolySnipe, a contact's portfolio site), Prompt A in each, then the same gate.

## 2. His kit and constraints

- The harvests are in `docs/intake/harvests/` (ten project files and `chats-outside-projects.md`), all dated 2026-11-28.
- `claude/harvest-prompts-rescue.md` (Prompts C and D) and `claude/harvest-review.md` **do not exist** in the repo. `claude/harvest-prompt.md` (Prompt A) does.
- `claude/archive/` does not exist yet.
- Phil's sittings are 15 minutes; each guide phase is one sitting.

## 3. What the research found

**What each prompt was for** (the file is missing, so from the brief's own words):
- **Prompt A**, the project sweep: pasted into a project, it harvests decisions, backlog items, spec facts, open questions and corrections from the conversation, with a tickets JSON addendum. It is `claude/harvest-prompt.md`.
- **Prompt C**, the one-chat harvest: pasted into a single chat the sweep could not open, so the chat harvests itself. `claude/harvest-prompt.md` already says "Go through this entire conversation", so it does the same job until Prompt C is recreated.
- **Prompt D**, the export: makes a project print every doc in its knowledge and every file its chats made, word for word, for saving. The guides carry a draft (written 2026-11-28) until the file is recreated; rescue.01 step 1.1 has Claude Code write the file.

**Which docs are where.**
- Office Set Up: `office-design-state.md` and `office-brief-answers.md` (project docs).
- Email Management: `email-restructure-checklist.md`.
- Personal Online Security: `email-consolidation-plan.md`; the account inventory (`Desktop\mail-census\account-inventory.xlsx`) lives on the PC and lists every account, so it stays out of the repo.
- PhirstMaxxing: **already on the PC**: `A:\Projects\PhirstMaxxing\docs\ROADMAP.md`, `PROMPT_3_FREE_TIME_V2.md`, `claude_PROMPT_4_DAYTRIPPER_SHARE.md`, `STATUS.md`, plus `CLAUDE.md` and `CLAUDE_CODE_KICKOFF_PROMPT.md` in the repo root. Claude Code copies them; Prompt D catches anything only in the project (the harvest names PROMPT_2).
- Chat-only files: the Daytripper spec is on disk (above). DropShipAuto's tracker `DropShipAuto_Tracker.xlsx` and `seed_clickup.py` are in `A:\Projects\DropShipAuto`. Still chat-only: `DropShipAuto_ProjectPlan.xlsx`, the project plan Word file and the UI build prompt (chat "Drop ship order MVP planning strategy"), and Alex's `basis_breathwork_brochure.html` and six-month plan (Basis Holistics chat).

**The eleven chats** have known titles and dates; seven have links in the harvests (six Office Set Up, one Personal Online Security). The four PhirstMaxxing chats have titles only (app development 11 Sep, tripbooker 10 Sep, Free-time page updates 10 Sep, Christian pilgrimage site guide 19 Oct 2026).

**The 41 chats outside projects** have titles only and "look like desktop or Cowork sessions", so they may only show in the desktop app. Sorted for the guide: the first five named by the brief; 27 personal and project chats; five Everlight work chats (skipped by default, Everlight stays out of Mycelium); four health chats (left unless Phil wants owner-only items; the guide names no titles or detail). Medical-sounding work titles were counted with the work group where they read as HL7 or query work; the guide refers Phil to the harvest file for the titles.

**Deleting a Claude project** (checked 2026-11-28). Anthropic's projects help page describes Delete from the project's three-dot menu, confirmed with "Yes, delete", and a separate Archive that moves a project to an archived tab where its conversations can still be opened; an archived project must be unarchived before it can be deleted. No help page found states whether deleting a project also deletes its chats on a personal plan (UNVERIFIED); the guide treats delete as losing everything. A full account data export (Settings, Privacy) is the guide's first step.

**The Prompt A in the repo may not be the one used.** `claude/harvest-prompt.md` (headings: decisions, backlog items, spec facts, open questions, corrections) does not match the item layout of the 2026-11-28 harvest files ("What I wanted / Status / Who said it / Where / Detail needed to act"). The Prompt A used for the sweep was probably a newer version, likely the one in the missing `claude/harvest-review.md` or prompts file.

## 4. Risks

- **Data loss on delete** (irreversible). Mitigations: rescue.07 phase 1 saves a full claude.ai export before any delete; each project is its own irreversible step, done only when rescue.06 marks it fully filed; Archive is named as the reversible pause.
- **Secrets in exported text.** Old chats may hold keys. Mitigation: Prompt D replaces them with `[removed]`, and every save step carries a security note to check before saving; answer boxes never take secrets.
- **Private data in a pushed repo:** the account inventory, Alex's personal phone number. Mitigation: the inventory stays on the PC; rescue.01 step 1.1 confirms the repo is private, or the archive goes outside it.
- **Chats that will not open.** Mitigation: each step has a "note it as empty" path, and the desktop app is named for the 41.
- **Health detail leaking into tickets.** Mitigation: rescue.04 decides the four health chats as one row with no titles; review.02's health row holds no detail.

## 5. Facts that differ from the plan

- **rescue.01:** the PhirstMaxxing roadmap and prompts are on the PC already; that phase is a Claude Code copy plus a short Prompt D pass, not a full export.
- **rescue.02:** the Daytripper spec and DropShipAuto's tracker (and `seed_clickup.py`) are on disk; only Alex's two files and three DropShipAuto plan files need a chat download. Title wording changed slightly ("Rescue the chat-only files").
- **rescue.01 to rescue.04:** Prompts C and D are missing; rescue.01 step 1.1 has Claude Code recreate `claude/harvest-prompts-rescue.md`. Meanwhile Prompt C is covered by `claude/harvest-prompt.md`, and a Prompt D draft is in the guides. rescue.03 and rescue.04 are not given a hard dependency on rescue.01.
- **rescue.05:** "Prompt A" in the repo may be an older version than the one used for the 2026-11-28 sweeps (headings differ). The integrator should check whether a newer Prompt A exists anywhere.
- **rescue.07:** the plan says "delete"; whether a project delete removes its chats is UNVERIFIED. The guide adds a full data export first. Thirteen projects are listed (the ten swept plus the three from rescue.05); DropShipAuto's Claude project is on the list even though the app is kept alive, because the gate is about the Claude project, not the app. The integrator should confirm.
- **vent.02 overlaps rescue.02** (Alex's files): see the vent dossier.

## 6. Sources

1. Anthropic Help Centre, projects (create, manage, archive, delete), https://support.claude.com/en/articles/9519177 (checked 2026-11-28)
2. Anthropic Help Centre, delete or rename a conversation, https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation (checked 2026-11-28)
3. `claude/harvest-prompt.md` (Prompt A and the tickets addendum) (checked 2026-11-28)
4. `docs/intake/harvests/office-set-up.md`, `email-management.md`, `personal-online-security.md`, `phirstmaxxing.md`, `dropshipauto.md`, `basis-holistics.md`, `chats-outside-projects.md` (coverage gaps and file names) (checked 2026-11-28)
5. `docs/intake/intake-2026-11-27.md` lines 577, 679 to 681, 740 to 741 (checked 2026-11-28)
6. `A:\Projects\PhirstMaxxing\docs\` and `A:\Projects\DropShipAuto\` file listings (checked 2026-11-28)
