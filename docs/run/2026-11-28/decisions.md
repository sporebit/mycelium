# Decisions made for Phil on 2026-11-28 (unattended run)

One line each, newest last. Format: `- [D|S|A|U] what | why | how to undo`. D = decision made for Phil, S = skipped item, A = assumption, U = brief unclear and what was chosen.

- [A] The first paste of the run instructions was cut off at "hand agents the"; the second paste was complete and is the one followed | the user re-sent it | none needed
- [D] The brief was missing on the first check; the run stopped and restarted once Phil saved it at docs/intake/intake-2026-11-27.md | the brief said to stop if missing | none needed
- [U] claude/harvest-review.md and claude/harvest-prompts-rescue.md, named by the brief (H8, Final five), do not exist in the repo; the rescue work is ticketed from the brief's own words and the two file names are noted on the ticket | the files were never committed or were deleted | none needed
- [D] HOME is created as a new project for the 3D editor and rooms work; GARDN ("Home Improvement", GARDN-1 office walls, GARDN-2 loft) is kept and its two open tickets are linked into the HOME office epic rather than moved | the brief names HOME as the project; moving tickets changes their keys | move GARDN-1/2 into HOME later with tix
- [D] The shareable Field guide link is the in-app page /guides/KEY plus a downloadable self-contained HTML file; a public read-only link is ticketed in MYC, not built | AGENTS.md forbids a public GET unless the brief decided it, and 12.20 did not say public | build the public route when decided
- [D] The third shell option is named "Field" (ui_prefs.shell = "field"); Classic stays the default | one word, names the look rather than claiming to be "the new UI" | rename one string and one union member
- [D] Phase = sitting in the Field guide data model; every other design choice for Stream U is in docs/run/2026-11-28/field-guide-design.md §1 (D1 to D16) | one file for the UI lanes to build from | see that file's Undo column
- [A] Model classes for this run: Fable 5.1 (this session) = strongest for planning, schema, red team, ledger, design judgement; Opus = mid for lane code, dossiers, rundowns, review; Haiku = smallest for mechanical bulk | the brief's three classes mapped onto the models available | none needed
- [D] The wall board becomes the tile grid by default with the old board at /wall?board=classic | 6.20 decided the wall is a tile grid; MYC-205 (prove the wall on the frame) is still open so no live frame is disturbed | flip the default in WallClient
- [A] graphify is not installed on this PC, so `graphify update .` is not run after code changes; noted for the report | tool missing | install and run graphify update
