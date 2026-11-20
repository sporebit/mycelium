# Master run — Phase 0 report (reconcile and housekeeping)

*2026-11-20, 02:00–02:35 London. Claude Code on the PC, started with "Read `claude/master-run.md` … execute the master run". Ticket MYC-179. Status: **built** (deployed; nothing here needs a live check beyond the two items in "For Phil").*

## What was found at the start

| Check | Brief said | Found |
|---|---|---|
| Repo | read at `6d9f736` | `8274dd1`, 20 commits later |
| Migrations | through 0156 | 0157 on hosted and in the repo; **the local stack was at 0156** (0157 had never been applied locally) |
| Production | `bce9e87`+ | `8274dd1`, equal to HEAD |
| Uncommitted `.claude/skills`, `.claude/settings*` | to be decided | none; nothing under `.claude` was modified |
| `.git/stale-maintenance-lock-claude` | move if present | present (empty file), moved out of the repo |
| Nightly backup | "confirm it ran" | registered 2026-11-19 but **had never run on schedule**; the only dump was the manual one. First scheduled run happened during this phase, 02:30, result 0, 186 tables |
| Playwright | "the repo has no Playwright" | the `playwright` library was already a dev dependency (for `scripts/screenshot.mjs`); the test runner, a config and the browser were missing |
| Hours parts 2–4 (§12) | remaining work | already built and live (MYC-176) before the run started |
| Four research conflicts (§0, §14.13) | in Phil's queue | decided by Phil on 2026-11-20; recorded in the backlog |

## Findings

1. **Cross-user hole in file storage — fixed.** The `tickets` and `daylog` storage buckets checked only the bucket name, so any signed-in user could list, download and delete every file in them (ticket attachments, Day log photos). Harmless with one user; not with Kirsty, nor with the test account this phase created. The `receipts` bucket had no rule at all, so **no user could store a receipt photo** since the multi-user cutover. Migration **0158** ties every file to the row it sits under; the row's own access rules decide. Proven by `lib/access/storage.test.ts` (0 of 5 checks passed before, 5 of 5 after) and on production (the test account sees 0 files where 4 folders exist). The existing isolation test covers API routes and tables but not storage, which is why this was never caught.
2. **The Cowork session overwrites repo docs from an older copy.** `claude/backlog.md` was written twice during this phase from a copy older than the repo's, each time reverting the Hours section to its 2026-11-19 wording. Both times the new lines were kept and the stale ones dropped. `claude/master-run.md` was overwritten once (its newer decision wording was kept). The other session could not be messaged from here. Until it re-reads the files, every save from it will revert whatever the repo changed in between.
3. **Production sends no email.** `RESEND_API_KEY` is not set on Vercel, so team invites are never emailed (the page shows the link to the inviter instead) and rundown emails cannot be delivered. `ELEVENLABS_API_KEY` is also absent (already on Phil's list from 2026-10-29).
4. **`PUBLIC_BASE_URL` in `.env.local` is a stale ngrok address**, not the production URL. Harmless to the deployed app (Vercel has its own value) but a trap for scripts; see "Mistakes" below.
5. **`AGENTS.md` points at docs that do not exist.** It says to read `node_modules/next/dist/docs/` before writing code; Next 15.5.18 ships no such folder.
6. **`graphify` is not installed on this PC**, so the `graphify query` / `graphify update .` steps in `CLAUDE.md` cannot run. Not run in this phase.
7. **A dead worktree from the old PC**: `.claude/worktrees/receipts` (2.3 GB), its git pointer still naming `P:/`. Its branch is fully merged. Left in place because its local `.claude` edits could not be compared reliably.

## What was done

- **Docs reconciled and committed** — `e8eb520`, `9aefa10`. The master-run brief carries `[run]` marks where the code overruled it.
- **Worktree setup finished** — decisions in `claude/worktree-setup.md`: stay on npm with one `npm ci` per worktree, no shared `node_modules` or `.next`, ports 3001–3003 for worktrees and 3100 for the test server, one migrations lane held by an untracked `MIGRATIONS.lock` note.
- **A release worktree** at `.claude/worktrees/release`: the production build before a push now runs on exactly the commit being pushed, not on a working tree that holds other in-flight work.
- **Playwright harness** — `1650791`. `playwright.config.ts`, `e2e/support/*`, `e2e/README.md`, `npm run e2e`. Runs against a dev server on port 3100 wired to the **local** database, with every paid or outward key blank (cloud AI, Telegram, email, PayPal, Google), as Phil and as a second user, Tess. `e2e/smoke.spec.ts` opens every page that has no dynamic segment (routes read from the file system). The test server builds into `.next-e2e`, so clearing `.next` before a push does not stop it.
- **Hosted test account** — `scripts/test-account.mjs`. A real second user on production, invited, accepted, authenticator enrolled. Address, password and authenticator secret are in `.env.local` only (`TEST_ACCOUNT_EMAIL`, `TEST_ACCOUNT_PASSWORD`, `TEST_ACCOUNT_TOTP_SECRET`); `node scripts/test-account.mjs --code` prints the current six-digit code. It belongs to no team yet (production has no teams) and has no grants.
- **0158 storage isolation** — `4f8f325`, pushed to hosted after an on-demand dump (`A:\Backups\mycelium\on-demand\2026-11-20`).
- **Local AI on the PC** (groundwork for §9): Ollama 0.40.16 with a 7B model, and Whisper (`large-v3-turbo`) in `pc-worker/.venv`. A 14-second spoken clip transcribes correctly on the graphics card in about 8 seconds.
- **Phil's queue started** as checklist tickets: MYC-180 (four cron-job.org jobs), MYC-181 (reconnect Google), MYC-182 (three answers: backup drive, due date, photo frame).
- `tix steps KEY --definition-file` added, so a checklist can be set from a file.

## Deviations from the brief

- **The test account's direct grants were not created.** Sharing from Phil's personal space asks for Phil's own authenticator code, by design. That stays his: it will be one step in the Kirsty checklist once the per-entry Day log sharing exists (granting "Day log" today would share all of it).
- **The invite for the test account was written with the service role**, in Phil's name, because the app's invite route needs a signed-in person and refuses the API secret. The account then signed in and accepted it itself.
- **The page smoke pass has not completed a full run yet.** The first runs were stopped (a 20-second wait per page, then the test server ran out of memory with five testers compiling at once). The harness itself is proven on a sample; the full pass runs in Phase 1.
- **Phase 1's testers were started before Phase 0 closed**, since they needed only the harness.

## Mistakes made by the run (both to do with secrets)

1. A command meant to list the variable *names* in `.env.local` printed the body of the multi-line Google service-account private key into this session's tool output. It was not written to any file, ticket, commit or message, and did not leave the machine, but it is in the session transcript.
2. The first version of the test-account script took the app's address from `PUBLIC_BASE_URL`, which is the stale ngrok address above. One request carrying the `API_SECRET` header went to that hostname. The tunnel was offline (ngrok's edge answered 404), so nothing was forwarded to an app.

Both keys should be treated as exposed once and rotated with the rest (MYC-6 is already in Verify). The script now talks to Supabase only.

## For Phil

- MYC-180 and MYC-181 are dated today: about eleven minutes together.
- Rotate the Google service-account key and `API_SECRET` when MYC-6 is next opened (a queue ticket follows with the capture work, because the new iPhone Shortcuts will stop using `API_SECRET` at the same time).
- A Cowork session should re-read `claude/backlog.md` and `claude/master-run.md` from the repo before writing them again, and copy both, plus `claude/context.md`, into the Claude project: **this terminal cannot write the project's copies.**

## Design calls made, for review

- npm per worktree rather than pnpm.
- The PC worker will run as a per-user scheduled task at sign-in rather than a Windows service, because installing a service needs an administrator prompt only Phil can answer. It restarts on failure; it does not run while nobody is signed in.
- The worker authenticates with the existing `CRON_SECRET`, so nothing new needs setting on Vercel.
