---
name: tickets
description: Mycelium Tickets for every project Phil works on — read open tickets at session start, create tickets in Inbox for agreed work, reference keys in commits, move tickets forward by category, close only with evidence, and put session reports in ticket comments. Use in any repo whose CLAUDE.md names a "Tickets project: <PREFIX>", and whenever Phil mentions a ticket key like MYC-42, the backlog, a run-book, or asks what is open.
---

# Tickets (Mycelium)

The ticket DB is canonical. `claude/backlog.md`-style docs are generated exports, never hand-edited. Every Claude surface reads and writes through the API with the `tix` CLI.

## Setup (once per machine)

- `MYCELIUM_URL=https://mycelium.sporebit.com`
- `MYCELIUM_TICKETS_TOKEN=mtk_…` — minted at Settings → Security → API tokens, scoped to the project prefixes you work on. Never in a repo or doc.
- `tix` = `node <mycelium repo>/scripts/tix.mjs` (alias it; Node ≥ 18, no dependencies).

## At session start

1. Find the project prefix in the repo's `CLAUDE.md` (`Tickets project: MYC`).
2. `tix ls --project MYC --list doing` and `--list next` (and `--list waiting`). Read `tix show KEY` for anything you will touch. Do not ask Phil what is open.
3. For a run-book or test ticket, read answers with `tix answers KEY` before any step that depends on them — never from scrollback.

## While working

- Reference keys in every commit message: `MYC-142: …` or `[MYC-142]`. The GitHub webhook moves referenced tickets to Verify on merge to main; the Vercel webhook moves them to Done after a green deploy + smoke.
- Anything Phil and you agree to do that is not already a ticket: `tix new "title" --project MYC --category inbox` (source is recorded as `claude`).
- Move forward by category only (`inbox → backlog → next → doing → waiting → verify → done`), never backwards: `tix move KEY doing`.
- Code plans are written by you, not the app: `tix plan KEY --body-file plan.md`.
- Tick run-book steps as you complete them: `tix steps KEY --tick 2.1 --answer dump=A:\Backups\…`.

## Before finishing

- `tix comment KEY "<session report>"` — file paths, commit hashes, deviations; no code.
- `tix move KEY verify --evidence <commit url>` for what merged; `tix done KEY --evidence <deploy or smoke url>` only with an evidence URL. Never `done` without one. Phil's live check is the separate `tix verify`.
- Never create People (the capture rule): if a ticket needs a waiting-on person, say so in the comment.

## Questions to Phil

Always multiple choice, ≤ 4 options, recommended option first.
