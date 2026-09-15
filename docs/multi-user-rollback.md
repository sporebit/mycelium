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

Sections 2–4 need no dashboard: with a Supabase personal access token they
run through the Management API and the CLI (create project, enable
extensions, query, link), which is exactly what the cutover run-book's
step 3.2 does as a rehearsal. Everything below was exercised on 2026-09-11
by restoring the live dump into the local stack; the notes marked
**verified** come from that run.

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
supabase db dump --linked --data-only --use-copy -x "storage.buckets_vectors" -x "storage.vector_indexes" -f A:\Backups\mycelium\<date>\data.sql
```

`--use-copy` and the two exclusions are from Supabase's own backup guide;
without them the data file is INSERT statements and the restore is slow.

**Verified 2026-09-11 — what the files do and do not carry:**

- `schema.sql` holds the `public` schema only (91 tables, policies,
  functions, extensions). It does **not** carry
  `supabase_migrations.schema_migrations`, so step 4's `migration repair`
  is always needed after a restore, not only "if Remote is empty".
- `data.sql` carries COPY blocks for `auth.*` (empty before cutover) and
  `storage.*` (the bucket rows) as well as `public`. Restored into a
  project running a different GoTrue or storage-api version, one of those
  blocks fails on a column that does not exist there and the single
  transaction rolls back. Filter the file to the `public` blocks first
  (keep each `COPY "public".…` block through its `\.` terminator, drop
  the others) and load `storage` in its own transaction, tolerating
  failure. Auth users are re-created from the seed anyway.
- The `cron` schema is not dumped; the two jobs are re-scheduled in step 3.


Then:

1. Prove the dump is complete by **row counts**, not by size: count the rows
   in each `COPY "public"…` block of `data.sql` and compare them with live
   through PostgREST (`HEAD …/rest/v1/<table>?select=*` with
   `Prefer: count=exact` and the service-role key). Every table must match.
   The size rule ("data.sql at least half of Database size") is wrong for a
   database this small — on 2026-09-11 a complete dump was 2.7 MB against a
   reported 23 MB, because table data was 1.9 MB and the rest was catalogs,
   indexes and free space.
2. Confirm the table count matches: `grep -c "CREATE TABLE" schema.sql`
   should print **91** at the 0101 baseline (the live project has 91 tables
   and 1 view; the count rises by the tables Parts 1–6 add once they have
   been pushed).
3. Storage is **not** in a pg_dump. The `receipts` bucket holds receipt
   images. Copy it too:

   ```
   supabase storage cp -r ss:///receipts A:\Backups\mycelium\<date>\storage\receipts --linked --experimental
   ```

   **Verified 2026-09-11: CLI 2.116 refuses this** with
   `LegacyStorageUnsupportedOperationError`. Pull the objects through the
   Storage API instead: `POST /storage/v1/object/list/receipts` to list
   (recursing into prefixes, which come back with `id: null`), then
   `GET /storage/v1/object/receipts/<path>` per object, both with the
   service-role key. Three objects on that date. Or download from
   Dashboard → Storage → receipts, or accept that a rollback loses receipt
   images (the parsed lines survive in `receipt_lines`).

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

Use the new project's **Session pooler** connection string (Dashboard →
Connect → Session pooler: user `postgres.<new-ref>`, host
`aws-0-<region>.pooler.supabase.com`, port **5432** — never the transaction
pooler on 6543). The direct host is IPv6-only and usually unreachable from
Docker Desktop; the session pooler is what Supabase's own backup guide
restores through. Put the string in a shell variable for the session only;
never write it to a file in the repo.

```
NEW_DB="postgresql://postgres.<new-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

**Run the restore from Git Bash, not PowerShell.** PowerShell has no `<`
redirection and re-encodes piped text; the `docker exec -i … < file` lines
below only work in a POSIX shell.

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

Remote will be **empty**: the schema dump does not carry
`supabase_migrations.schema_migrations` (verified 2026-09-11). Repair the
history from the migration files, which respects the gap at `0019` — never
type the range by hand:

```
supabase migration repair --status applied $(ls supabase/migrations | cut -d_ -f1 | awk '$1 <= "0101"')
supabase migration list
```

Replace `0101` with the last version that was live on the old project. The
command needs the migration files present in `supabase/migrations`; it
refuses with `LegacyMigrationFileNotFoundError` otherwise. Then
`migration list` must show that range on Remote and nothing pending that
was already applied on the old project.

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
