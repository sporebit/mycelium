#!/usr/bin/env bash
# Ship main to production, the way AGENTS.md asks, in one command (Git Bash).
#
#   bash scripts/ship.sh            build, back up + push migrations, push, wait for the deploy
#   bash scripts/ship.sh --no-wait  the same, without waiting for the deploy
#
# 1. Builds exactly the commit being pushed, in the release worktree
#    (.claude/worktrees/release), with a clean .next. The main checkout may
#    hold other in-flight work; it is not what gets built or pushed.
# 2. If the hosted database is behind the repo's migrations: takes an
#    on-demand dump first (scripts/db-backup.ps1), then `supabase db push`.
# 3. `git push origin main`.
# 4. Waits until /api/health reports the pushed commit (a deploy that fails
#    in one second is the Vercel Hobby cron gate: check vercel.json).
#
# Stops at the first failure. Nothing here rewrites history.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REL="$ROOT/.claude/worktrees/release"
export PATH="$PATH:$HOME/.local/bin"
cd "$ROOT"

SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then echo "not on main"; exit 1; fi
if [ "$(git rev-parse origin/main)" = "$SHA" ]; then echo "origin/main is already at $SHORT"; fi

echo "== 1/4 build $SHORT in the release worktree"
if [ ! -d "$REL" ]; then git worktree add --detach "$REL" "$SHA" >/dev/null; fi
LOCK_BEFORE="$(cd "$REL" && git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)"
(cd "$REL" && git checkout --quiet --detach "$SHA")
cp "$ROOT/.env.local" "$REL/.env.local"
LOCK_AFTER="$(cd "$REL" && git rev-parse HEAD:package-lock.json)"
if [ ! -d "$REL/node_modules" ] || [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  (cd "$REL" && npm ci >/dev/null 2>&1) || { echo "npm ci failed"; exit 1; }
fi
(cd "$REL" && rm -rf .next && npx next build > "$REL/.build.log" 2>&1) || { echo "BUILD FAILED"; tail -40 "$REL/.build.log"; exit 1; }
echo "   build ok"

echo "== 2/4 migrations"
# The push applies the migration FILES in this folder, not the ones in the commit being shipped. A migration
# written or committed since the build began would reach production without the code that goes with it
# (nearly happened on 2026-11-20 with 0171). Refuse, rather than apply something this release does not contain.
STRAY="$(git status --porcelain -- supabase/migrations; git diff --name-only "$SHA" HEAD -- supabase/migrations)"
if [ -n "$STRAY" ]; then
  echo "   migration files here are not the ones in $SHORT; commit them and ship again, or move them aside:"
  echo "$STRAY" | sed 's/^/     /'
  exit 1
fi
PENDING="$(supabase migration list --remote 2>/dev/null | grep -o '"local":"[0-9]*","remote":""' | grep -o '[0-9][0-9]*' | tr '\n' ' ' || true)"
if [ -n "$PENDING" ]; then
  echo "   pending on hosted: $PENDING"
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/db-backup.ps1 -BackupRoot 'A:\Backups\mycelium\on-demand' 2>&1 | grep -E '^(ok|FAIL|error)' || { echo "backup did not report ok"; exit 1; }
  # --include-all: in a parallel run a lane's lower-numbered migration can land after a higher one is already on hosted; each is additive, so it is applied anyway.
  supabase db push --remote --yes --include-all 2>&1 | grep -E 'Applying|Finished|ERROR|error' || true
  STILL="$(supabase migration list --remote 2>/dev/null | grep -o '"local":"[0-9]*","remote":""' || true)"
  if [ -n "$STILL" ]; then echo "migrations still pending after push"; exit 1; fi
else
  echo "   hosted is up to date"
fi

echo "== 3/4 push"
# Exactly the commit that was built above, not whatever main has become since: a commit made while the
# build was running must not ride out unbuilt (it did once, 2026-11-20).
git push origin "$SHA:refs/heads/main" 2>&1 | tail -1
if [ "$(git rev-parse HEAD)" != "$SHA" ]; then echo "   note: main has moved on to $(git rev-parse --short HEAD) since the build; that is not pushed. Run ship again for it."; fi

echo "== 4/4 deploy"
if [ "${1:-}" = "--no-wait" ]; then echo "   not waiting"; exit 0; fi
for i in $(seq 1 40); do
  LIVE="$(curl -s -m 15 https://mycelium.sporebit.com/api/health | grep -o '"commit":"[0-9a-f]*"' | cut -d'"' -f4 || true)"
  if [ "$LIVE" = "$SHORT" ]; then echo "   production is on $SHORT"; exit 0; fi
  ping -n 16 127.0.0.1 >/dev/null 2>&1 || sleep 15
done
echo "   production is still on ${LIVE:-unknown} after 10 minutes; check the Vercel deployment"
exit 1
