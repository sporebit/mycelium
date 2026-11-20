# Worktree Setup — mycelium

*Aug 2026. Full guide published as an artifact ("Mycelium Worktrees"). This is the decision record.*

## Why

Three uses: parallel Claude Code sessions, hotfix while mid-feature, side-by-side branch comparison.

## Isolation policy

Worktrees isolate files only — not the database, ports, or Supabase auth config.

**Safe in parallel:** Loam & Glow P7–P11, Vision-scan regression, rest-timer bug, refactors/types/tests.
**Must serialise:** `supabase/migrations/**`, RLS policies, edge functions, dependency bumps.
**PC monitoring rebuild:** stays on the existing Supabase project. Reversed an earlier call to split it out — the migrations are additive (new tables, new policies), monitoring data is production data the desk device will consume, and auth/RLS don't follow a second project. Rules: additive only, no `alter`/`drop` on existing tables from that branch, one pusher at a time, never `db reset`. Optionally namespace the tables in a `pcmon` schema. Split only if the work needs `alter`/`drop` or repeated resets.

Rule: exactly one worktree at a time owns migrations.

## Setup decisions

| Area | Decision |
|---|---|
| Creation | `claude --worktree <name>` for agent work; plain `git worktree add` for existing branches or out-of-repo paths |
| Base branch | `worktree.baseRef: "head"` in repo-root `.claude/settings.json` — default is fresh-from-main, wrong for mid-feature helpers |
| Env files | `.worktreeinclude` at repo root copying `.env*`; note this copies prod service-role keys into every tree |
| node_modules | Do **not** symlink while any branch touches `package.json` — a shared tree means one install rewrites deps under every worktree. pnpm is the better answer than `symlinkDirectories` |
| .next | Never symlinked |
| Sparse checkout | Skipped — single Next app, not a monorepo |
| Ports | Explicit `-p 3001/3002/3003`; `localhost:3001–3003/**` added to Supabase Auth redirect allowlist up front |
| Gitignore | `.claude/worktrees/` |

## Layout

- `mycelium/` — main checkout, port 3000, migration owner
- `.claude/worktrees/loam-p7/` — port 3001
- `.claude/worktrees/fix-rest-timer/` — port 3002
- `../mycelium-pcmon/` — plain git worktree, same Supabase project, port 3003

## Repo state note

Aug 2026: `refs/heads/main` was found corrupt (41 bytes of nulls) during setup — recovered via reflog + `git update-ref`. Repo lives on `P:`. If it recurs, check whether that drive is a network/removable mount.

## Known traps

- Migration files are timestamp-ordered, not merge-ordered: a migration authored earlier but merged later replays out of sequence on a fresh `db reset`. Renumber before merge.
- `.claude/settings.json` is not inherited from parent dirs — worktrees read the repo-root committed copy, so anything needed inside a worktree must live there.
- Hooks: `${CLAUDE_PROJECT_DIR}` stays at the main checkout; worktree path arrives as `cwd`.
- Subagents with `isolation: worktree` get no `node_modules` — fine for refactors, fails on anything that builds or tests.
- `.env.local` copied by `.worktreeinclude` counts as untracked work, so cleanup prompts on trees that look clean.

## Finished 2026-11-20 (master run, Phase 0)

The open points from August, decided `[claude]` and applied:

| Area | Decision |
|---|---|
| Base branch | `worktree.baseRef: "head"` is in the committed `.claude/settings.json`. Done. |
| Gitignore | `.claude/worktrees/` is ignored. Done. |
| Package manager | **Stay on npm.** Each worktree runs its own `npm ci` (about two minutes, about 1 GB). No symlinked `node_modules`, no pnpm migration: a lockfile and CI change for a problem a plain install already solves. |
| `.next` | Never shared. Each worktree builds its own. |
| Skills in a worktree | `.claude/skills` and `.claude/settings.json` are tracked, so a worktree checkout has them. Nothing to copy. |
| Env files | `.worktreeinclude` copies `.env.local`, which points at the **hosted** database. A worktree must therefore never run a bare `next dev`: start it through the end-to-end environment (`e2e/support/env.ts`), which points at the local stack and blanks every paid or outward key. |
| Ports | 3000 main checkout (hosted data, Phil's own use) · 3001–3003 worktrees · **3100 the end-to-end server** (`E2E_PORT` overrides it for a worktree). Sessions for tests come from the password grant, so no redirect allowlist entry is needed. |
| Database | One local stack, shared by every worktree. That is why migrations are a single lane. |
| Migrations lane | `MIGRATIONS.lock` in the main checkout names the stream that holds it. Take it, write the next number, merge to `main`, `db push`, delete the file. Untracked on purpose (it is a note between sessions, not history). |

**Leftover from the old PC:** `.claude/worktrees/receipts` (2.3 GB) is a dead worktree. Its `.git` pointer still names `P:/Projects/Mycelium`, git does not list it, and its branch `worktree-receipts` is fully merged into `main`. It holds local edits to `.claude` files that could not be compared reliably, so it was left in place. Phil can delete the folder.
