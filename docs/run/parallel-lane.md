# The parallel run, 2026-11-20 afternoon — lanes, ports and the migrations queue

*Written by the integrating session before the streams were spawned. Phil's instruction (11:10): keep going without him on everything that needs nothing from him; his own items are collected for the end. Master run §2: code streams in separate worktrees, one migrations lane.*

## Who owns what

| Lane | Worktree branch (agent) | Ticket | Reserved migration | Dev port |
|---|---|---|---|---|
| B2 — daily loop remainder: weekly close-out, monthly measures, switch notices, the Boys' routing ready for tokens | `lane-b2` | MYC-184 | **0174** | 3101 |
| F2 — net worth over time with by-hand holdings (pension, house, mortgage, cars) | `lane-f2` | MYC-188 | **0175** | 3102 |
| G — wall screen in any browser | `lane-g` | MYC-189 | **0176** | 3103 |
| H1 — settings nav, dashboard cards, the live AI model list | `lane-h1` | MYC-190 | **0177** | 3104 |
| H2 — the Finds feed (watchers, verdicts, weekly review) | `lane-h2` | MYC-190 | **0178** | 3105 |
| E2 — worker and cost remainder: per-feature attribution, bulk reference data out of the hosted database, local speech | `lane-e2` | MYC-187 | **0179** | 3106 |
| DC — family and partner open items | `lane-dc` | MYC-186, MYC-185 | **0180** | 3107 |
| H3 — other apps into Work, and Gifts | `lane-h3` | MYC-190 | **0181** | 3108 |

A lane that needs no migration leaves its number unused; a gap in the sequence is fine (0019 is already a gap). A lane that needs two takes the second from the integrator, never by guessing.

## Rules every lane keeps

1. **Never push, never merge, never touch `main`, never run `scripts/ship.sh`.** Commit on the lane's own branch in the worktree; the integrator rebases onto `main`, runs the end-to-end suite against the shared compiled server on port 3100, and ships one lane at a time.
2. **Migrations:** only the reserved number, additive only (new tables, new policies, new functions), the 0111 policy shape, `app.adopt_table`, entity_groups and the access registry kept in step with the registry test. Apply it to the local stack with `supabase db push --local --yes` from the worktree (the local stack is shared; additive tables do not collide). Never `db reset`, never push to hosted.
3. **Testing in a lane:** `npx tsc --noEmit`, `npx eslint <changed files>`, `npx vitest run <changed test files>` must all pass before the lane reports. For routes and pages, run a dev server on the lane's own port, `E2E_PORT=<port> node e2e/support/serve.ts` in the background, and run only the lane's own spec files with `E2E_PORT=<port> npx playwright test <spec>`. Never use port 3100 and never run `node e2e/support/cycle.ts`. Unique seed ids per run, and clean up after.
4. **No new dependencies** (nothing touches `package.json`); no `next build` in a lane (the integrator builds); no paid service; every model call through the one meter and on the PC lane where a job can wait.
5. **Phil's items:** anything only he can do becomes a ticket in his queue (`tix new … --category next`, title starting "Phil's queue:", the exact link and value needed, no secret values) and a line in the lane's report. Do not message him on Telegram: the integrator sends one message at the end.
6. **Report:** `docs/run/<lane>-report.md` in the house format (what it is as a table against the brief, how it is put together, checked, found on the way, Phil's live check as a numbered chunk); the live-check chunk also appended to `docs/checklists/phase1-live-checks.json` as the next phase number **only by the integrator** (lanes put the steps in the report and the integrator numbers them, to avoid clashes). One line each in `claude/backlog.md` and `claude/context.md` written by the integrator from the report, not by the lane (the two files would conflict across eight branches).
7. **The lane's final message** to the integrator lists: branch name; commits; migration used or not; spec files to run and the regression suites touched; anything left undone and why; Phil's tickets created.

## Learned on the day

- A lane that adds a table runs `e2e/multiuser-lifecycle.phil.spec.ts` too: the account export reads every registered entity table as the caller, so a table granted to the service role alone fails it (lane G's wall tables, fixed in 0182).
- Never merge a lane while `scripts/ship.sh` is building: its migration guard compares the folder with the commit being shipped and stops (lane DC's 0180 landing during lane G's ship).
- `supabase db push --local` refuses once a higher-numbered migration from another lane is in the shared local history; apply with psql and record the version by hand. On hosted, the ship script passes `--include-all` for the same reason.
- A dev server under Playwright recompiles on every artefact written into the worktree; `next.config.ts` now ignores `.next-e2e*`, `e2e/.results` and `e2e/.auth` (lane H1).
- The first request after a dev-server compile breaks the capture helper's one-second contract: hit the server once before judging a timing failure.
