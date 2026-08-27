# Mycelium — Machine Setup

Getting this project running on a fresh Windows machine.

Written after a migration where the project folder came across intact but none of
the toolchain did. If that's your situation, **the project state is probably
fine — you just need the three runtimes in Step 1 and Step 2.**

---

## 0. What you should already have

If you copied the project folder across (rather than cloning fresh), check these
are present before installing anything. They are the things a `git clone` would
*not* give you:

| Path | What it is | If missing |
|---|---|---|
| `.env.local` | All secrets, ~28 keys | `vercel env pull .env.local`, or copy from the old machine. It is gitignored by design (`.gitignore:34`). |
| `supabase/.temp/` | Supabase CLI project link | Re-link: `supabase link --project-ref <ref>`. Gitignored (`.gitignore:51`). |
| `.git/` | Full history + remote + identity | Clone fresh from the remote instead. |
| `pc-agent/config.js` | PC agent secret (optional) | Only needed if running the PC agent. Gitignored. |

`node_modules/` does **not** matter — Step 3 rebuilds it. Don't trust a copied one.

---

## 1. Node and Git

Both are on winget. The `--source winget` flag matters: without it, winget stops
to ask you to accept the `msstore` source agreements and the install cancels.

```powershell
winget install --id OpenJS.NodeJS.LTS --source winget -e
winget install --id Git.Git --source winget -e
```

**Node version:** there is no `.nvmrc`, `.node-version`, or `engines` field in
this project, so the LTS is the right default. Next 15.5 needs Node 18.18+.
If you want to match the Vercel runtime exactly, check the Node version in the
Vercel project settings and install that major instead.

## 2. Supabase CLI

Required — `AGENTS.md` mandates `supabase db push` for all migrations, and
forbids applying SQL by hand in the dashboard.

**Not available on winget**, and the usual scoop one-liner
(`irm get.scoop.sh | iex`) fails — the installer reads
`$MyInvocation.InvocationName`, which is empty when piped into
`Invoke-Expression`, so it aborts with a parameter-binding error.

Install the release binary directly instead. `~\.local\bin` is already on PATH on
a standard Claude Code install, so there is nothing else to configure:

```powershell
$ProgressPreference = 'SilentlyContinue'
$tag  = (Invoke-RestMethod 'https://api.github.com/repos/supabase/cli/releases/latest' -Headers @{'User-Agent'='ps'}).tag_name
$ver  = $tag.TrimStart('v')
$dest = "$env:USERPROFILE\.local\bin"
New-Item -ItemType Directory -Force $dest | Out-Null
Invoke-WebRequest "https://github.com/supabase/cli/releases/download/$tag/supabase_${ver}_windows_amd64.zip" -OutFile "$env:TEMP\supabase.zip"
Expand-Archive "$env:TEMP\supabase.zip" -DestinationPath "$env:TEMP\sb" -Force
Copy-Item "$env:TEMP\sb\*.exe" -Destination $dest -Force
supabase --version
```

**Copy both executables.** The archive contains `supabase.exe` *and*
`supabase-go.exe`; the first shells out to the second, so installing only
`supabase.exe` gives you a CLI that fails at runtime.

On an ARM machine, swap `windows_amd64` for `windows_arm64`.

Then authenticate and confirm the link:

```powershell
supabase login
supabase migration list    # Local and Remote columns should match
```

## 3. Restart your shell

**Do this before Step 4.** Installers write to the machine PATH, but already-open
processes keep the PATH they launched with.

- Close and reopen PowerShell.
- **Close and reopen Claude Code too.** Otherwise Claude inherits the old PATH
  and will report `node`/`git` as missing even though you just installed them.

Verify:

```powershell
node -v; npm -v; git --version; supabase --version
```

## 4. Install dependencies and prove the build

```powershell
npm ci
npx next build
```

Use `npm ci`, not `npm install`. Two devDependencies ship platform-native
binaries — `sharp` (libvips) and `playwright` (browser drivers) — and a
`node_modules` copied from another machine can carry the wrong ones. `npm install`
will leave them in place if the semver ranges still match; `ci` wipes the tree and
rebuilds from the lockfile, which is also what Vercel does on every deploy.

A green `npx next build` means you're fully set up.

---

## 5. Git setup

### "dubious ownership" on a migrated drive

If the project folder came across on a moved drive, every git command fails with:

```
fatal: detected dubious ownership in repository at 'P:/Projects/Mycelium'
```

The files still carry the *old* machine's owner SID, and git refuses to operate on
a repo owned by someone else. One-time fix:

```powershell
git config --global --add safe.directory P:/Projects/Mycelium
```

Note the forward slashes — that is the form git expects, even on Windows.

### Identity

Already set per-repo in `.git/config` if you copied the folder across. Confirm:

```powershell
git config user.name
git config user.email
```

If blank (fresh clone on a new machine), set them globally:

```powershell
git config --global user.name "Phil"
git config --global user.email "pwhelanonline@gmail.com"
```

### Remote

```
origin  https://github.com/sporebit/mycelium.git
```

Confirm with `git remote -v`.

### Authentication for push

The remote is **HTTPS**, so pushes need credentials. Git for Windows bundles Git
Credential Manager, which handles this for you — your first `git push` opens a
browser window to authorise GitHub, then caches the credential in Windows
Credential Manager. Nothing to configure in advance.

If you'd rather not authorise interactively, either:

- **Personal access token** — create one with `repo` scope at
  <https://github.com/settings/tokens>, and paste it when Git prompts for a
  password (the username is your GitHub username, not your email).
- **Switch to SSH** — generate a key, add the public half to GitHub, then:
  ```powershell
  ssh-keygen -t ed25519 -C "pwhelanonline@gmail.com"
  git remote set-url origin git@github.com:sporebit/mycelium.git
  ```

Sanity-check auth without changing anything:

```powershell
git fetch origin
git status
```

### Push workflow

These are the rules from `AGENTS.md` — they apply to every code change, not just
the first one after setup.

1. **Build before every push.** `npx next build` must succeed. `tsc --noEmit` is
   *not* sufficient: the production build also gates on ESLint (`prefer-const`,
   `no-unused-vars`, `react-hooks/exhaustive-deps`). A green `tsc` with a red
   `next build` is a real and recurring failure mode — the Vercel build for commit
   `230d686` failed on exactly one `prefer-const` error that `tsc` accepted.
   Never set `eslint.ignoreDuringBuilds` to get around it; the gate is the point.
2. **One commit per concern.** If a task fixed two unrelated things, that's two
   commits — so either can be reverted independently.
3. **Commit messages:** one line, present tense, no "Generated by Claude" footer.
4. **Push once, at the end**, after all commits for the task are in:
   ```powershell
   git push origin main
   ```
5. **`main` only.** Don't push to other branches without explicit instruction, and
   don't rewrite history without asking.
6. **Never commit `.env*` files.** `.gitignore` covers this, but don't force-add.

Deployment is automatic — Vercel builds and ships every push to `main`.

---

## 6. Database migrations

Migration files live in `supabase/migrations/`, numbered `NNNN_description.sql`.
As of this writing the latest is `0091_ui_prefs.sql`, so the next one is `0092`.

```powershell
# 1. write supabase/migrations/0092_your_description.sql
supabase db push          # confirm with Y when prompted
supabase migration list   # Local and Remote should both show 0092
```

Never apply SQL by hand in the Supabase SQL editor — the CLI is the only path.
Read-only diagnostic queries are fine to run in the editor; destructive SQL must
go in a migration file.

---

## 7. Optional extras

**Playwright browsers** — only if you want `scripts/screenshot.mjs`:
```powershell
npx playwright install
```

**Knowledge graph** — `@sentropic/graphify` is already a devDependency, so it
works via `npx` after Step 4. Refresh it after code changes (AST-only, no API cost):
```powershell
npx graphify update .
```

**PC agent** — a `node-windows` service that posts hardware metrics to the Studio
page every 30s. Entirely optional and machine-specific; skip unless you want
metrics from *this* box. Needs an Administrator shell:
```powershell
cd pc-agent
npm install
[System.Environment]::SetEnvironmentVariable("PC_METRICS_SECRET", "<secret>", "Machine")
node install-service.js
net start MyceliumPCAgent
```
See `pc-agent/README.md`. Uninstall with `node uninstall-service.js` (as Admin).

---

## Troubleshooting

**`git`/`node`/`npm` "not recognized" right after installing** — you didn't
restart the shell. See Step 3. This bites Claude Code sessions especially, since
they hold their launch PATH for the whole session.

**winget cancels with "source agreements were not agreed to"** — add
`--source winget` to skip the Microsoft Store source.

**`next build` fails but `tsc --noEmit` passed** — expected. It's an ESLint
error. Read the build output and fix the rule violation; don't disable the rule.

**Supabase `migration list` shows a Remote/Local mismatch** — don't hand-edit to
reconcile. Check whether a migration was applied outside the CLI, and fix forward
with a new numbered migration.

**A big multi-line block in `.env.local` looks corrupted** — it probably isn't.
`GOOGLE_SERVICE_ACCOUNT_KEY` is a PEM private key, double-quoted and wrapped at
64 chars across ~28 lines. That's valid; Next's env loader parses quoted
multi-line values correctly. Leave it alone.
