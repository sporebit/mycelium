# Dossier: E.phm, PhirstMaxx (PHM)

*Written 2026-11-28 by a dossier agent during the unattended run. Sources are the repo, the old PhirstMaxxing repo on the PC and the 2026-11-28 harvest; no web research was needed for this epic. Every check below was made on 2026-11-28.*

## 1. What Phil decided

Phil has already deleted the old PhirstMaxxing app's database and the old app is retired (H5). PhirstMaxx inside Mycelium starts empty (decided 2026-11-24 23:20: no old data wanted). The first ticket confirms whether the import ran before the deletion, corrects `claude/phirstmaxx-spec.md`, and the old site is shut down with its keys going through the rotate-everything work (keys.04). Then Claude Code maps every old roadmap item and each part of PROMPT_3 against the spec (covered, phase 2, or dropped) for his approval; Daytripper sharing (a plan sent to a WhatsApp group as a message, a public plan page with replies and lifts) is carried to PhirstMaxx phase 2; and Phil spends one 15-minute sitting writing, on his own, which screens of the old app were actually used. The `[claude]` flag (H9 flag 7: the spec assumes a database that no longer exists) is not reopened.

## 2. His kit and constraints

- PhirstMaxx phase 1 is built (migration 0185, 2026-11-22) as a Mycelium section in the family space: `pm_*` tables, `lib/phirstmaxx/`, as-built in `claude/spec-phirstmaxx.md`.
- The three keys (OpenRouteService, YouTube, Google Maps) are live on Vercel Production since 2026-11-24; OpenRouteService moved to `api.heigit.org/openrouteservice/v2`; Google's billing account is a free trial ending about late February 2027, with a 900-a-month self-imposed cap per product.
- MYC-207 (the Google, Family calendar and PhirstMaxx setup checklist) is open at 22 of 32 steps.
- The old app's repo is still on the PC at `A:\Projects\PhirstMaxxing` (Next.js 15, Supabase free tier, Vercel Hobby). Its `docs/` folder holds `ROADMAP.md`, `PROMPT_3_FREE_TIME_V2.md`, `claude_PROMPT_4_DAYTRIPPER_SHARE.md` and `STATUS.md`; the decisions log is in its `CLAUDE.md`.
- Sixteen old PHM tickets (PHM-1 to PHM-16) were raised against the old app and are still open.

## 3. What the research found

**The import question is already answered in the repo.** `claude/spec-phirstmaxx.md` §10 says the importer was "never run for real, and now never will be". It was proven only against a made-up fixture (`docs/fixtures/phirstmaxx-old-dump.json`) on the e2e server (port 3100), where a dry run planned 49 blocks, 4 places and so on. So nothing from the old database was imported before it was deleted. phm.01 confirms this with one read-only count on production and then edits the docs.

**What is still wrong in the design spec after the 2026-11-24 commits (`cdc5d84`, `cdc06e5`, `37fd473`).** Those commits struck through the mirror and the cutover in §10 and §9 item 3, and annotated D2, §2.8 and §11.4. These lines still assume old data:
- §3, last paragraph: "Budget, trips, Our story and the night sky from the old app: data migrates in phase 1".
- §9 phase 1: "importer (§10) for all old data".
- §11 intro note: "the old database address comes from the Supabase dashboard (guide phase 5)" (phase 5 is now skipped).
- §12 Done means: "Importer: dry run then apply against a copy of the old data; second run changes nothing" (now true only against the fixture).
- `claude/spec-phirstmaxx.md` §11 (not built) still lists "the importer run against the old database (Phil's URL); the nightly mirror until cutover".
- `claude/backlog.md`, the PhirstMaxx line, still says "Open `[claude]`: the nightly mirror from the old app until cutover is the importer run on a schedule, not yet registered" and lists "the old database URL" under Waiting on Phil, before the later "Decided 2026-11-24" sentence in the same line.

**The importer is kept, not removed.** §10 of both specs says the importer "stays in the repo as proven against the fixture, in case a dump ever turns up". The plan's wording "no importer" would be wrong; the ticket says "kept, dormant".

**The old roadmap has twelve items, not eleven.** `ROADMAP.md` (11 Sep 2026) lists R1 to R12. Done in the old app: R1 housekeeping, R2 Free time v2 (PROMPT_3 A to E), R4 signed-in Playwright in CI, R5 backups (built, waiting on a secret), R6 clear-night alert. Open: R3 travel calibration, R7 month-one review, R8 "Our number", R9 first real trip, R10 WhatsApp concierge, R11 productisation gate, **R12 Daytripper v1** (spec `claude_PROMPT_4_DAYTRIPPER_SHARE.md`). The old PHM tickets mirror these: PHM-1 (R3), PHM-2 and PHM-3 (R5), PHM-4 (R7), PHM-5 (R8), PHM-6 (R9), PHM-7 (R12), PHM-8 (R10), PHM-9 (R11), PHM-12 (ISS passes after R6).

**PROMPT_3** has five parts: A date strip selection and paging, B block types, firmness, titles and one-off places, C the add and edit block sheet, D day states and fortnight range search, E Agree time. Most map onto PhirstMaxx's weekly grid, `pm_block_types` (firmness) and `pm_places` (one-off places flagged unsaved), but the mapping is phm.03's job.

**Daytripper is on disk.** The harvest said the chat was "now the only copy", but `A:\Projects\PhirstMaxxing\docs\claude_PROMPT_4_DAYTRIPPER_SHARE.md` exists (78 lines: Part A share as a message via the share sheet or `wa.me`; Part B a public read-only plan page with RSVP and share tokens; tests; order). The later stages (Telegram reminders, WhatsApp Business number, other people and groups) are only in the chat "Daytripper messaging integration strategy" (2026-09-11). There is also a separate `A:\Projects\daytripper` static trip-site repo (PMW-1 says a folder duplicates it); it is not the sharing feature.

**Old site shutdown.** MYC-211 (raised 2026-11-24) already covers the Vercel project, the IONOS DNS record and the PWA on both phones. It does not appear in `open-tickets.txt` of 2026-11-28, so it may be done or closed. The old repo's R5 backup job (a GitHub Action needing `SUPABASE_DB_URL`) has nothing left to back up.

**Old app screens** (for phm.05, from the roadmap and the old component tests): Home, Free time (date strip, day timeline, Agree time), Plans, Ideas, Budget, Our story, Trips, night sky. The old app no longer opens, so phm.05 is from memory.

## 4. Risks

- **Deleting the wrong DNS record (Kirsty-facing breakage, lock-out of a live site).** The specs spell the old host two ways (`phirstymaxxing.sporebit.com` in D2 and §10, `phirstmaxxing.sporebit.com` earlier in D2). Mycelium itself lives under sporebit.com. Mitigation in phm.02: Claude reads the old repo's config and the zone listing and names the exact record; Phil deletes only that one.
- **Removing the PWA from Kirsty's phone** is Kirsty-facing. Mitigation: phm.02 lists it as Phil's step, done with her.
- **Rotating keys that something still reads.** Mitigation: keys stay on keys.04, which waits for phm.01; phm.02 does not touch them.
- **Closing PHM tickets that still matter for phase 2.** Mitigation: phm.03 closes nothing until Phil approves the table.
- **The public Daytripper plan page** conflicts with the spec's "no public GET". Mitigation: phm.04 writes it as a question for Phil on PHM-7, not a build.

## 5. Facts that differ from the plan

- **phm.01:** the question "did the import run?" is already answered in `claude/spec-phirstmaxx.md` §10: it never ran. The title's "(no importer, no mirror)" is half wrong: the importer stays as a dormant, fixture-proven tool. Title reworded to "Confirm the old-app import never ran, then take the leftover importer, mirror and old-data lines out of claude/phirstmaxx-spec.md".
- **phm.01:** the leftover lines are §3 last paragraph, §9 phase 1, §11 intro note and §12, plus `claude/spec-phirstmaxx.md` §11 and the backlog's PhirstMaxx line. The plan names only the spec.
- **phm.02:** overlaps MYC-211 (Vercel project, IONOS record, PWA). MYC-211 is absent from the 2026-11-28 open list; phm.02 is written as "confirm, finish if open, close both", linked to MYC-211, not a second copy of it.
- **phm.02:** the hostname is spelled two ways in the spec; check before deleting.
- **phm.03:** the old roadmap runs R1 to **R12** (R12 is Daytripper v1), not R1 to R11. Title updated. The sixteen PHM tickets are added to the mapping.
- **phm.04:** the Daytripper spec is not chat-only; it is on disk in the old repo. Title changed from "rescued from its chat" to "carry the design across". rescue.02's Daytripper item is likewise a copy, not a download.
- **H5 digest** says Phil "already deleted the old app's database"; the spec of 2026-11-24 says it "is being deleted". Not verified in this run (no Supabase dashboard access); phm.01 does not depend on it.

## 6. Sources

1. `claude/phirstmaxx-spec.md` (design spec; D2, §2.8, §3, §9, §10, §11, §12), repo at `75ef720` (checked 2026-11-28)
2. `claude/spec-phirstmaxx.md` §10 and §11 (as built) (checked 2026-11-28)
3. `claude/backlog.md`, the PhirstMaxx line (line 32) (checked 2026-11-28)
4. `claude/context.md`, entry for 2026-11-24 23:30 to 2026-11-25 00:25 (checked 2026-11-28)
5. Commits `cdc5d84`, `cdc06e5`, `8138e30`, `57f2170`, `37fd473` (checked 2026-11-28)
6. `A:\Projects\PhirstMaxxing\docs\ROADMAP.md` (11 Sep 2026) (checked 2026-11-28)
7. `A:\Projects\PhirstMaxxing\docs\PROMPT_3_FREE_TIME_V2.md` and `claude_PROMPT_4_DAYTRIPPER_SHARE.md` (checked 2026-11-28)
8. `docs/intake/harvests/phirstmaxxing.md` (harvest of 2026-11-28) (checked 2026-11-28)
9. `docs/run/2026-11-28/open-tickets.txt` (PHM-1 to PHM-16, MYC-207; MYC-211 absent) (checked 2026-11-28)
