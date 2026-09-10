# Multi-user (P12) — rollback runbook

Restore the pre-cutover `pg_dump` into a **fresh** Supabase project and point
Vercel at it. This is the only sanctioned rollback for Part 7; do not
improvise against the live project.

Env var **names** only appear here. Never paste a value into a report, a
commit message, or a chat.

---

## 0. What you must already have

| Item | Where it comes from |
|---|---|
| `roles.sql`, `schema.sql`, `data.sql` | Step 1 below, taken **before** Part 7 step 2 (`supabase db push`) |
| The dump's size vs the dashboard's database size | Recorded in `docs/multi-user-phil-checklist.md` §4 |
| Docker Desktop running | `docker info` |
| Supabase CLI logged in | `supabase projects list` succeeds |
| Vercel access to the Mycelium project's env vars | Dashboard → Settings → Environment Variables |

The dump lives **outside the repository**. Suggested location:
`A:\Backups\mycelium\<YYYY-MM-DD>\`. It is never committed.

There is no `psql` on the PC. Every `psql` below runs inside the local
stack's database container, which has network access to Supabase:

```
docker exec -i supabase_db_Mycelium psql "<connection string>" ...
```

If the local stack is not up, `supabase db start` brings up just the
database container in about a minute.

---

## 1. Taking the dump (before cutover)

Run from the project root, linked to the **live** project. Three files, in
this order; the CLI's `db dump` runs `pg_dump` in a container so Docker must
be running.

```
supabase db dump --linked --role-only -f A:\Backups\mycelium\<date>\roles.sql
supabase db dump --linked             -f A:\Backups\mycelium\<date>\schema.sql
supabase db dump --linked --data-only -f A:\Backups\mycelium\<date>\data.sql
```

Then:

1. Note the byte size of `data.sql` and compare it with Dashboard → Project
   Settings → Database → *Database size*. A dump under half the reported
   size is incomplete: stop and investigate before proceeding.
2. Confirm the table count matches: `grep -c "CREATE TABLE" schema.sql`
   should print **91** at the 0101 baseline (the live project has 91 tables
   and 1 view; the count rises by the tables Parts 1–6 add once they have
   been pushed).
3. Storage is **not** in a pg_dump. The `receipts` bucket holds receipt
   images. Copy it too:

   ```
   supabase storage cp -r ss:///receipts A:\Backups\mycelium\<date>\storage\receipts --linked --experimental
   ```

   If that command is unavailable in the installed CLI version, download
   the bucket from Dashboard → Storage → receipts before cutover, or accept
   that a rollback loses receipt images (the parsed lines survive in
   `receipt_lines`).

---

## 2. Create the fresh project

1. Dashboard → New project. Same region as the current one (check
   Project Settings → General on the live project). Same Postgres major
   version (**17**). Choose a new database password and store it in your
   password manager; it is needed once, in step 3.
2. Wait for the project to reach *Active*.
3. Dashboard → Database → Extensions: enable **pg_cron** and **vector**.
   `pg_cron` needs a server-side preload, so it must be switched on here
   before the schema restore or `0095`'s `cron.schedule` objects fail to
   restore.
4. Dashboard → Project Settings → API: copy the new **project ref**, the
   **anon** key and the **service_role** key. Project Settings → API → JWT
   Keys: copy the **legacy JWT secret**. You will need all four in step 5.
5. Dashboard → Authentication: re-apply every setting in
   `docs/multi-user-phil-checklist.md` §1 (providers, magic link, TOTP,
   Google redirect URI for the **new** ref, passkeys flag) and §2 (Resend
   as custom SMTP). Auth configuration is not in the dump.

---

## 3. Restore

Get the new project's **direct** connection string (Dashboard → Connect →
Direct, not the pooler; the pooler rejects some restore statements). Put it
in a shell variable for the session only; never write it to a file in the
repo.

```
NEW_DB="postgresql://postgres:<password>@db.<new-ref>.supabase.co:5432/postgres"
```

Restore all three files in one transaction, with triggers disabled during
the data load so foreign keys do not fire out of order. This is the
sequence Supabase documents for CLI backups:

```
docker exec -i supabase_db_Mycelium psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file /dev/stdin \
  "$NEW_DB" < A:\Backups\mycelium\<date>\roles.sql

docker exec -i supabase_db_Mycelium psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file /dev/stdin \
  "$NEW_DB" < A:\Backups\mycelium\<date>\schema.sql

docker exec -i supabase_db_Mycelium psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --command "SET session_replication_role = replica" \
  --file /dev/stdin \
  "$NEW_DB" < A:\Backups\mycelium\<date>\data.sql
```

If `roles.sql` errors on a role that already exists on the new project
(`supabase_admin`, `authenticator`, and friends are pre-created), that is
expected; rerun without `ON_ERROR_STOP` for that file only.

Then verify:

```
docker exec -i supabase_db_Mycelium psql "$NEW_DB" -At -c \
  "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
docker exec -i supabase_db_Mycelium psql "$NEW_DB" -At -c \
  "select count(*) from tasks union all select count(*) from raw_captures union all select count(*) from workout_sessions"
```

The first must equal the table count from step 1.2. The second three
counts must match the same query run against the dump source (record
those numbers when you take the dump).

pg_cron jobs live in the `cron` schema, which the public dump does not
include. Re-schedule the two jobs from `0095_pc_metrics_retention.sql`:

```
docker exec -i supabase_db_Mycelium psql "$NEW_DB" -c \
  "select cron.schedule('pc_metrics_rollup', '*/10 * * * *', \$\$select pc_metrics_rollup(3)\$\$);
   select cron.schedule('pc_metrics_prune',  '15 3 * * *',   \$\$select pc_metrics_prune()\$\$);"
```

Storage: Dashboard → Storage → New bucket → `receipts`, **private**. Upload
the copy taken in step 1.3 (`supabase storage cp -r <local> ss:///receipts
--linked --experimental` after step 4 has re-linked the CLI).

---

## 4. Re-link the CLI

```
supabase link --project-ref <new-ref>
supabase migration list
```

`migration list` must show every migration through the last one that was
applied on the **old** project as present on Remote; the schema restore
carries `supabase_migrations.schema_migrations` with it. If Remote is empty,
the dump was taken without that schema: run
`supabase migration repair --status applied <version>` for each version up
to the last one that was live.

---

## 5. Repoint Vercel

Dashboard → Mycelium → Settings → Environment Variables. Change these in
**Production, Preview and Development**:

- `NEXT_PUBLIC_SUPABASE_URL` → `https://<new-ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the new anon key
- `SUPABASE_SERVICE_ROLE_KEY` → the new service_role key
- `SUPABASE_JWT_SECRET` → the new project's legacy JWT secret (Part 3's
  `withUser()` mints tokens with it; the old value will be rejected)

Leave every other variable as it is. `BREAK_GLASS_ENABLED` stays `false`
unless the rollback is itself the emergency; if you turn it on, turn it
off again once sign-in works.

Then **Deployments → Redeploy** the current production deployment (no
build cache). Update `.env.local` on the PC with the same four names.

Auth users are in the `auth` schema, which the public dump does not carry.
If the rollback happens **after** cutover, every Supabase Auth user is gone
and must be re-invited; Phil's own sign-in is recovered by re-running Part
1's seed against the new project. If the rollback happens **before** Part 7
step 5, `DASHBOARD_PASSWORD` and `AUTH_SECRET` still exist and the old
cookie path works as before — that is why they are deleted last.

---

## 6. Smoke test

1. Open the site, sign in, load one page in every section.
2. `/api/health` (or any GET route) returns data, not a 500.
3. Send one Telegram message and confirm it lands in captures — the webhook
   URL is unchanged because it points at Vercel, not Supabase.
4. Check Dashboard → Logs → Postgres on the new project for permission
   errors in the first ten minutes.

## 7. Afterwards

- Pause the old project (Dashboard → Project Settings → General → Pause)
  rather than deleting it, for at least a week.
- Keep the dump until a week of normal use has passed.
- Record what went wrong in `docs/multi-user-handoff.md` before anyone
  attempts Part 7 again.
