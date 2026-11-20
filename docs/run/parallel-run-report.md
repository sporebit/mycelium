# The parallel run, 2026-11-20 — what landed, how it was integrated, what is Phil's

*Written by the integrating session at the end of the afternoon. Phil's instruction (11:10): finish everything that needs nothing from him in worktree lanes, collect his own items for the end. Eight lanes ran under `docs/run/parallel-lane.md`; each was merged one at a time onto `main`, rebuilt into the shared production-mode server on port 3100, run against its own spec and the suites it touched, numbered into the live checks (MYC-193), and shipped with `scripts/ship.sh`. Production finished the day on `ef091cb` with hosted migrations 0174 to 0183 applied.*

## What landed, in the order it shipped

| Lane | Ticket | Migration | Report | Live check | Production commit |
|---|---|---|---|---|---|
| F2 — net worth over time with by-hand holdings | MYC-188 | 0175 | `docs/run/finance-2-report.md` | chunk 15 | `0429ea9` |
| B2 — the weekly close-out, the monthly measures, timed notices, the Boys' routing | MYC-184 | 0174 | `docs/run/daily-loop-2-report.md` | chunk 16 | `b0c3b55` |
| H2 — the Finds feed | MYC-190 | 0178 | `docs/run/finds-report.md` | chunk 17 | `94dde9d` |
| G — the wall screen | MYC-189 | 0176 (+0182) | `docs/run/wall-report.md` | chunk 18 | `ad5b153` |
| DC — family second pass; team ticket keys and pickers | MYC-186, MYC-185 | 0180 | `docs/run/family-partner-2-report.md` | chunk 19 | `ad5b153` |
| H1 — settings navigation, dashboard cards, the live AI model list | MYC-190 | 0177 | `docs/run/harvest-1-report.md` | chunk 20 | `a79160f` |
| H3 — Gifts phase 1; the other apps in Work | MYC-190 | 0181 (+0183) | `docs/run/harvest-2-report.md` | chunk 21 | `e58fab2` |
| E2 — spend by feature, recipe details on the PC, the PC's voice | MYC-187 | 0179 | `docs/run/worker-cost-2-report.md` | chunk 22 | `ef091cb` |

Fifty-eight commits on `main` since the lanes were spawned (`9e323ac`). Every lane's own spec passed on the shared server; the regression suites run per lane are in each ticket's comment.

## Found at integration (not in any lane's report)

- **The account export could not read the wall's two tables** (lane G granted them to the service role alone; the export reads every registered entity table as the caller). Migration **0182** grants select to signed-in users; row security still shows them no row. Found by `e2e/multiuser-lifecycle.phil.spec.ts`, which lane G had not run.
- **The gifts tables linked to People without the promote-on-link trigger** every such link carries (0140, 0167). Migration **0183** wires it. Found by `lib/access/personLinks.test.ts` once every lane was on `main`.
- **`ai_models` was in no registry list.** It is an instance-level table like `profiles` and now sits in `ACCESS_TABLES`.
- **The typed-capture registry spec had no fixture for the gift form**; added (`e58fab2`), 36 of 36 after.
- **The wall could not reach the general speech route** (its device cookie opens `/api/wall/*` alone), so it has `/api/wall/speech` and `pcSpeaker` is installed once in `WallClient` (`51a5829`). The wall spec checks it.
- **Two lanes added the same things in the same places** (H2 and H3: the tick's job table, the schedule, the classifier's kind list and regex fallback; H3 and E2: the schedule again; G and H1: the Security page). All resolved keeping both; in the fallback a gift idea wins over a find, so a link sent for someone's birthday is the present, not the page. The Walls and Quick unlock cards sit on Security's **Sessions & tokens** tab.
- **Lane E2's change to the capture-audio route** (the feature tag, no cost recorded by hand) was carried into `lib/capture/receiveAudio.ts`, where lane G had moved that code.
- **The other-apps import had already run on production** this morning (`989f723`): the dry run reads 7 projects and 110 tickets already there.
- **The one-off recipe-detail sweep ran against production** after a fresh on-demand backup: counts in the MYC-187 comment.

## What the run taught (also in `docs/run/parallel-lane.md`)

Never merge during a ship (its migration guard stops it); the ship script now passes `--include-all`; a lane that adds tables runs the lifecycle export spec and the access suites; the dev server under Playwright needs the watcher ignore rule lane H1 added to `next.config.ts`; `.env.local` holds two `CRON_SECRET` lines and only the first is production's.

## Phil's queue (nothing above waits on these to work; each is one sitting)

MYC-180 (cron-job.org jobs), MYC-181 (reconnect Google), MYC-182 (backup drive, due date, photo frame — the wall report has the costed frame table), MYC-192 (three UI choices), MYC-194 (email service), MYC-195 (Enable Banking), MYC-196 (rotate two secrets), MYC-197 (iPhone Shortcuts), MYC-198 (who may switch on paid AI), MYC-200 (Cloudflare R2), MYC-201 (an IMAP inbox), MYC-202 (GITHUB_TOKEN, optional), MYC-203 (the Boys' seven bots), MYC-204 (the two per-person model selects), MYC-205 (pair the wall); and the live checks MYC-193, chunks 14 to 22.

## Not done from a terminal

The project-side copies of `claude/context.md` and `claude/backlog.md` were not synced (no Projects tool here); the next Cowork session should copy them. `graphify update .` could not run (not installed on this PC).
