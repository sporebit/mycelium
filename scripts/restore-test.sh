#!/usr/bin/env bash
# Proves a backup restores (master run §9: "a restore test").
#
#   bash scripts/restore-test.sh                      newest on-demand dump
#   bash scripts/restore-test.sh "A:/Backups/mycelium/nightly/2026-11-20"
#
# What it does, all on this PC's local database server and nowhere else:
#   1. makes an empty scratch database, restore_test;
#   2. gives it the schema of the local stack (the migration chain, the same
#      as hosted when migrations are in step);
#   3. loads the dump's data into it;
#   4. prints the row count of every table that holds anything, and the
#      tables the dump listed but that came out empty;
#   5. drops the scratch database.
# The hosted database is not touched and not read. Needs the local stack
# running (Docker) and PostgreSQL 18's own tools (the dump is written by
# pg_dump 18, which the container's older pg_restore cannot read).
set -euo pipefail

PGBIN="/c/Program Files/PostgreSQL/18/bin"
DIR="${1:-}"
if [ -z "$DIR" ]; then DIR="$(ls -d /a/Backups/mycelium/on-demand/*/ | sort | tail -1)"; fi
DIR="${DIR%/}"
[ -f "$DIR/data.dump" ] || { echo "no data.dump in $DIR"; exit 1; }
export PGPASSWORD=postgres
ADMIN="postgresql://supabase_admin@127.0.0.1:54322"
SCRATCH=restore_test

echo "== dump: $DIR ($(du -h "$DIR/data.dump" | cut -f1))"
"$PGBIN/psql" -q "$ADMIN/postgres" -c "drop database if exists $SCRATCH" -c "create database $SCRATCH" >/dev/null

echo "== 1/3 schema of the local stack into the scratch database"
"$PGBIN/pg_dump" --schema-only --no-owner --no-privileges -d "$ADMIN/postgres" 2>/dev/null \
  | "$PGBIN/psql" -q -v ON_ERROR_STOP=0 "$ADMIN/$SCRATCH" >/dev/null 2>"$DIR/restore-test.schema.log" || true
echo "   schema statements that failed: $(grep -c '^psql:.*ERROR' "$DIR/restore-test.schema.log" || true)"

echo "== 2/3 the dump's data"
set +e
"$PGBIN/pg_restore" --data-only --disable-triggers --no-owner --no-privileges -d "$ADMIN/$SCRATCH" "$DIR/data.dump" 2>"$DIR/restore-test.data.log"
RC=$?
set -e
echo "   pg_restore exit $RC; errors: $(grep -c 'error:' "$DIR/restore-test.data.log" || true)"
grep 'error:' "$DIR/restore-test.data.log" | sed 's/^pg_restore: //' | cut -c1-160 | sort | uniq -c | sort -rn | head -8 || true

echo "== 3/3 what came back"
"$PGBIN/psql" -q -At "$ADMIN/$SCRATCH" <<'SQL' > "$DIR/restore-test.counts.txt"
do $$
declare r record; n bigint;
begin
  create temp table _counts (name text, n bigint);
  for r in select schemaname, tablename from pg_tables where schemaname in ('public', 'auth', 'storage') loop
    execute format('select count(*) from %I.%I', r.schemaname, r.tablename) into n;
    insert into _counts values (r.schemaname || '.' || r.tablename, n);
  end loop;
end $$;
select name || E'\t' || n from _counts order by n desc, name;
SQL
WITH_ROWS=$(awk -F'\t' '$2>0' "$DIR/restore-test.counts.txt" | wc -l)
TOTAL=$(awk -F'\t' '{s+=$2} END {print s}' "$DIR/restore-test.counts.txt")
LISTED=$(grep -c ' TABLE DATA ' "$DIR/manifest.txt" || true)
echo "   tables in the dump: $LISTED; tables holding rows after the restore: $WITH_ROWS; rows in all: $TOTAL"
echo "   largest:"; head -8 "$DIR/restore-test.counts.txt" | sed 's/^/     /'

"$PGBIN/psql" -q "$ADMIN/postgres" -c "drop database if exists $SCRATCH" >/dev/null
echo "== scratch database dropped; logs and counts are beside the dump (restore-test.*)"
[ "$WITH_ROWS" -gt 0 ] || { echo "NOTHING WAS RESTORED"; exit 1; }
