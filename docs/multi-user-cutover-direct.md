# Multi-user (P12) cutover — direct route, Phil driving

*Written 2026-09-15. Route decided: **direct** (no staging rehearsal). Phil runs
every step himself from the PC. The merged code is on branch `cutover`
(`773b0df` = `main` + `multi-user`); `main` is an ancestor, so step 6 is a
fast-forward. Companion docs: `docs/multi-user-phil-checklist.md` (the why
behind each setting), `docs/multi-user-rollback.md` (the only sanctioned
rollback), `docs/multi-user-handoff.md` (what each Part built).*

Env var **names** only appear here. Never paste a value into a report, a
commit message, or a chat.

**Time:** about 60–75 minutes if nothing surprises you. Steps 1–5 can be
done in advance and paused between; steps 6–7 are one sitting.

**The one rule:** `git push origin main` and `supabase db push` happen back
to back, within a minute of each other. Vercel deploys `main`; the deployed
code needs the migrated schema; the migrated schema needs your auth user.
Everything before step 6 exists to make that minute boring.

---

## 0. Before you start

- [ ] Git Bash open at `/a/Projects/Mycelium` (use Git Bash throughout;
      PowerShell breaks the `<` redirections).
- [ ] Docker Desktop running (`docker info` works). `supabase db dump` runs
      `pg_dump` in a container, and the SQL steps below use a container's `psql`.
- [ ] Supabase CLI logged in and linked to the live project:
      ```
      supabase projects list
      supabase link --project-ref vokfwbkwuccikordcnxz
      ```
      `link` asks for the database password once and caches it in `supabase/.temp/`.
- [ ] Vercel dashboard open: team `sporebit-s-projects`, project `mycelium`.
- [ ] Supabase dashboard open on the project.
- [ ] Phone with an authenticator app (TOTP is mandatory for the instance owner).
- [ ] Working tree clean. The two rehearsal leftovers must go first:
      ```
      git status
      mv "docs/mycelium-cutover (1).html" /a/Backups/mycelium/
      mv "Claude outputs" /a/Backups/mycelium/
      ```

## 1. Get the code, do not merge yet (5 min)

```
git fetch origin
git checkout main
git pull --ff-only origin main            # HEAD should be 5c937b3 or later
git merge-base --is-ancestor main origin/cutover && echo "cutover fast-forwards main"
git log --oneline main..origin/cutover    # 12 P12 commits + 2 merge commits
```

If the last line prints nothing, `cutover` has already been merged; stop and
check `supabase migration list` before doing anything else.

## 2. Fresh backup (10 min)

The 2026-09-11 dump is four days stale. Take a new one, exactly as
`docs/multi-user-rollback.md` §1:

```
mkdir -p /a/Backups/mycelium/2026-09-15
supabase db dump --linked --role-only -f /a/Backups/mycelium/2026-09-15/roles.sql
supabase db dump --linked             -f /a/Backups/mycelium/2026-09-15/schema.sql
supabase db dump --linked --data-only --use-copy -x "storage.buckets_vectors" -x "storage.vector_indexes" -f /a/Backups/mycelium/2026-09-15/data.sql
grep -c "CREATE TABLE" /a/Backups/mycelium/2026-09-15/schema.sql     # expect 91
```

Copy `storage/receipts/` from the 09-11 folder alongside it (or re-pull per
rollback §1.3 if receipts were added since). Never commit any of this.

## 3. Supabase Auth configuration (dashboard, 10 min)

Checklist §1 explains each one. Authentication → …

- [ ] **Providers → Email**: enabled. Password sign-in on. Magic link on.
- [ ] **Multi-Factor**: TOTP enabled.
- [ ] **URL Configuration**: Site URL `https://mycelium.sporebit.com`.
      Redirect URLs, exactly two: `https://mycelium.sporebit.com/**` and
      `https://*-sporebit-s-projects.vercel.app/**`. The `/**` matters.
- [ ] **Email Templates**, all five, link replaced with the token-hash form:
      - Magic Link: `{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=magiclink`
      - Confirm signup: `…&type=signup`
      - Invite user: `…&type=invite`
      - Reset password: `…&type=recovery`
      - Change email: `…&type=email_change`
- [ ] **Not tonight**: Google provider (the login button shows but errors
      until it is on; password + TOTP is enough for you), passkeys, custom
      SMTP via Resend (only invites and rundown emails need it; Supabase's
      own sender covers a magic link if you ever lose the password).

## 4. Vercel environment variables (5 min)

Project → Settings → Environment Variables. Add to **Production and Preview**:

- [ ] `SUPABASE_JWT_SECRET` — Supabase → Project Settings → API → JWT Keys →
      **Legacy JWT secret → Reveal**. Copy it. **Never press Rotate.** Without
      this every system route (cron, Telegram webhook, health import,
      pc-metrics) throws `MissingJwtSecretError` on the new code.
- [ ] `BREAK_GLASS_SECRET` — new random value: `openssl rand -base64 32`.
- [ ] `BREAK_GLASS_ENABLED` — `false`.
- [ ] `RESEND_API_KEY` — only if you already have Resend; otherwise later.
- [ ] Leave `USER_ID`, `DASHBOARD_PASSWORD`, `AUTH_SECRET` in place. They go
      in step 8, after verification.
- [ ] Do **not** redeploy. Step 6's push is the deploy.

## 5. Create your auth user with the fixed id (5 min)

Must happen **before** `db push`: migration 0103 inserts your personal space
with `owner_user_id = f218ed69-6cbf-49ea-908a-8826f2f1178a`, an FK to
`auth.users`. If the row is missing 0103 creates a placeholder with no
password and the email `phil@mycelium.local`; doing it yourself first means
you can sign in the moment the deploy is live.

Precondition (verified 09-11, re-check now): live `auth.users` is empty.

Write this to `/a/Backups/mycelium/2026-09-15/phil-user.sql` (outside the
repo — it contains your password). Replace `YOUR@EMAIL` and `YOUR-PASSWORD`.
The `app` schema does not exist yet, so the uid is a literal.

```sql
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token, is_sso_user, is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  'f218ed69-6cbf-49ea-908a-8826f2f1178a',
  'authenticated', 'authenticated',
  'YOUR@EMAIL',
  extensions.crypt('YOUR-PASSWORD', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Phil"}'::jsonb,
  now(), now(),
  '', '', '', '', '', '', '', '', false, false
)
on conflict (id) do update
  set email = excluded.email, encrypted_password = excluded.encrypted_password;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  'f218ed69-6cbf-49ea-908a-8826f2f1178a',
  'f218ed69-6cbf-49ea-908a-8826f2f1178a',
  jsonb_build_object(
    'sub', 'f218ed69-6cbf-49ea-908a-8826f2f1178a',
    'email', 'YOUR@EMAIL',
    'email_verified', true
  ),
  'email', now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

select id, email, email_confirmed_at is not null as confirmed from auth.users;
```

Run it through the live project's **Session pooler** string (Dashboard →
Connect → Session pooler: user `postgres.vokfwbkwuccikordcnxz`, port
**5432**, never 6543). Keep the string in a shell variable only:

```
LIVE_DB="postgresql://postgres.vokfwbkwuccikordcnxz:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
docker run --rm -i postgres:17 psql "$LIVE_DB" -v ON_ERROR_STOP=1 < /a/Backups/mycelium/2026-09-15/phil-user.sql
```

(If the local stack happens to be up, `docker exec -i supabase_db_Mycelium
psql "$LIVE_DB" …` works too.) Expect exactly one row back, your email,
`confirmed = t`. Then shred the file: `rm /a/Backups/mycelium/2026-09-15/phil-user.sql`.

## 6. Preflight, then GO (5 min, no pause between the last three commands)

Merge locally first (the dry run reads the files on disk, which only exist after the merge), then preflight:

```
git merge --ff-only origin/cutover
ls supabase/migrations | tail -14     # 0102_profiles.sql … 0115_rundowns.sql
supabase migration list               # Remote ends at 0101; Local lists 0102–0115
supabase db push --dry-run            # "Would push" exactly the 14 files 0102–0115
```

If the dry run says "Remote database is up to date", the merge did not happen. If it lists anything other than those 14, stop. The merge is local and deploys nothing; only the push does.

GO:

```
git push origin main             # Vercel starts building main (~5 min)
supabase db push                 # answer Y
supabase migration list          # Local and Remote both end at 0115
```

**If db push stops on a migration** it rolls that file back (each runs in its own transaction), so the remote stays at the last good number and no data is touched — do not re-run blindly. On 2026-09-15 the real run stopped on 0104 with `operator does not exist: extensions.vector <=> extensions.vector`: the bare pgvector `<=>` in `search_memory_chunks` is unresolved under the hosted push search_path. Fixed forward by qualifying it `OPERATOR(extensions.<=>)` in 0104 and 0111 (commit `839f43f`), then `git pull` and `supabase db push` again resumed at 0104.

Immediately after, prove the data survived (read-only; pooler + psql as in
step 5, or the SQL editor):

```sql
select id, email, is_instance_owner, personal_space_id from public.profiles;  -- 1 row, owner = t, space set
select kind, count(*) from public.spaces group by kind;                        -- personal 1
select count(*) filter (where space_id is null) as orphans, count(*) as rows from public.tasks;            -- 0 orphans
select count(*) filter (where space_id is null) as orphans, count(*) as rows from public.raw_captures;     -- 0 orphans
select count(*) filter (where space_id is null) as orphans, count(*) as rows from public.workout_sessions; -- 0 orphans
```

Row totals should match the `COPY "public"."<table>"` block lengths in
today's `data.sql` (09-11 they were 87 / 185 / 38).

## 7. Deploy green, sign in, spot-check (10 min)

- [ ] Vercel → Deployments → the `main` push shows **Ready**. If it shows
      Error, read the log before anything else; a missing env var from step 4
      is the likely cause. Fix the var, Redeploy.
- [ ] `https://mycelium.sporebit.com/login` → email + password from step 5.
      You are sent to Security with `?enrol=totp`. Enrol with the authenticator.
- [ ] Sections: Today, Tasks (count as above), Organisation, Finance, Health,
      Studio, Settings → Admin visible (instance owner).
- [ ] **PTP live check (backlog 4.7)**: Fitness → Today shows the PTP day,
      the guardrails banner renders, MacroBar reads 2600 / 200.
- [ ] Telegram: send one capture to the bot; it should land in Captures.
      A failure here means `SUPABASE_JWT_SECRET` is wrong or missing.
- [ ] Cron principal: `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $CRON_SECRET" https://mycelium.sporebit.com/api/cron/rundowns`
      → `200`. (Or wait for the next hourly run in Vercel → Logs.)
- [ ] Sign out, sign back in with password + TOTP once more.

> **JWT secret gotcha (hit live 2026-09-15).** This project migrated to
> asymmetric JWT Signing Keys, so the current signing key is ECC and the
> **Legacy JWT Secret** is kept only to *verify* (it still backs the
> `anon`/`service_role` keys, which is why `withUser`'s HS256 tokens are
> accepted at all). `SUPABASE_JWT_SECRET` in Vercel must be exactly that
> Legacy JWT Secret (Settings -> JWT Keys -> Legacy JWT Secret -> Reveal),
> not the new secret API key and not the ECC key. A wrong value shows as
> `raw_captures insert failed: No suitable key or wrong key type` on the
> Telegram webhook while sign-in still works. Never rotate or revoke the
> legacy secret; `withUser` depends on it.

## 8. Retire the legacy auth (after 7 passes, 5 min)

- [ ] Vercel → delete `USER_ID`, `DASHBOARD_PASSWORD`, `AUTH_SECRET`
      (Production and Preview) → Redeploy the latest deployment.
- [ ] Sign in again after the redeploy.
- [ ] Supabase → Advisors → Security: re-check now RLS + policies are live.
- [ ] Keep `/a/Backups/mycelium/2026-09-15/` for a week of normal use.
- [ ] Any token you minted for tonight: revoke it.

## If it goes wrong

- **`db push` failed part-way.** Do not re-run blindly. `supabase migration
  list` shows how far it got; read the error. 0103's own error message is
  explicit if your auth user is missing (step 5).
- **Deploy is Ready but the site is unusable and you cannot fix it in
  30 minutes.** Code: Vercel → Deployments → the last pre-cutover deployment
  → **Instant Rollback** (Pro feature). Database: `docs/multi-user-rollback.md`
  end to end — fresh project from today's dump, repoint Vercel. Never
  improvise against the live project.
- **Locked out after TOTP enrolment.** Magic link from the login page still
  works (Supabase's default sender) as long as step 3's templates are set.

## Afterwards — not tonight, already in the backlog

- CI on `main` is red from this merge: eight P12 test files need a Supabase
  stack that `ci.yml` does not start. Fix = `supabase/setup-cli` +
  `supabase start` in CI, which is also the migration-replay item.
- `.env.example` lacks every P12 variable name.
- Copy `claude/backlog.md`, `claude/context.md` and `claude/README.md` back
  into the Cowork project; they carry corrections the project copy lacks.
- Google provider, passkeys, Resend + DNS, onboarding how-to, `docs/tokens.md`.
- The verification scripts (`verify:ownership`, `isolation-test`) run against
  the **local** stack only; the handoff's "run them against production" is
  not something they support as written. Step 6's SQL is the production
  equivalent of the ownership check.
