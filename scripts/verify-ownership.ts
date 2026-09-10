/**
 * Ownership verifier for P12 Part 2 (spaces + space_id on every table).
 *
 * Two modes, run against the LOCAL Supabase stack (docker psql):
 *
 *   npm run verify:ownership -- snapshot <counts.json>
 *       Before applying 0103–0109: record the row count of every public
 *       base table.
 *
 *   npm run verify:ownership -- verify <counts.json>
 *       After applying them: for every registered table prove that
 *         - it has space_id (NOT NULL) and created_by,
 *         - no row has a null space_id,
 *         - every space_id resolves to a spaces row (FK valid),
 *         - user_id is gone,
 *         - the row count equals the snapshot (adoption neither creates
 *           nor loses rows);
 *       and that shared-reference and access tables carry NO space_id.
 *       Prints one line per table and exits 1 on any failure.
 *
 * VERIFY 2 runs this twice: on a from-empty replay (counts are all zero,
 * which still proves the shape) and on a restore of the live pg_dump, which
 * is the run that matters — real user_id values, real child rows.
 *
 * Runs on Node ≥ 22.6 with native type stripping (no tsx needed).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { listPublicRelations, localSql } from "../lib/access/introspect.ts";
import {
  ACCESS_TABLES,
  SHARED_REFERENCE,
  classifyTable,
  registeredTables,
} from "../lib/access/registry.ts";

type Counts = Record<string, number>;

/**
 * Rows the adoption is allowed to remove: the user_settings placeholder
 * migration 0075 seeded with user_id = 'default' (see 0104). It is deleted
 * only when a real row exists beside it; alone, it is adopted as Phil's and
 * no row is lost. The snapshot computes the exact allowed drop so the
 * after-count is checked precisely, not loosely.
 */
const PLACEHOLDER_ROWS: Record<string, string> = {
  user_settings:
    "select case when exists (select 1 from public.user_settings where app.legacy_user_uid(user_id) is not null) " +
    "then (select count(*) from public.user_settings where user_id = 'default') else 0 end",
};

/**
 * Access tables whose space_id is a reference, not ownership: a team points
 * at its own team space. Everything else in ACCESS_TABLES must have none.
 */
const ACCESS_TABLES_WITH_SPACE_REF = new Set(["teams"]);

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function rowCounts(tables: readonly string[]): Counts {
  if (tables.length === 0) return {};
  const sql = tables
    .map((t) => `select '${t}' as t, count(*)::bigint as n from public.${q(t)}`)
    .join(" union all ");
  const out: Counts = {};
  for (const [t, n] of localSql(sql)) out[t] = Number(n);
  return out;
}

function columnInfo(table: string): Map<string, { nullable: boolean; type: string }> {
  const rows = localSql(
    `select column_name, is_nullable, data_type from information_schema.columns ` +
      `where table_schema = 'public' and table_name = '${table}'`,
  );
  return new Map(rows.map(([c, n, ty]) => [c, { nullable: n === "YES", type: ty }]));
}

function scalar(sql: string): string {
  const rows = localSql(sql);
  return rows[0]?.[0] ?? "";
}

function snapshot(path: string) {
  const tables = listPublicRelations()
    .filter((r) => r.kind === "table")
    .map((r) => r.name);
  const counts = rowCounts(tables);
  const placeholders: Counts = {};
  for (const [t, sql] of Object.entries(PLACEHOLDER_ROWS)) {
    if (tables.includes(t)) placeholders[t] = Number(scalar(sql) || 0);
  }
  writeFileSync(
    path,
    JSON.stringify({ takenAt: new Date().toISOString(), counts, placeholders }, null, 2),
  );
  for (const [t, n] of Object.entries(placeholders)) {
    if (n > 0) console.log(`note: ${t} has ${n} placeholder row(s) the adoption is allowed to remove`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`snapshot: ${tables.length} tables, ${total} rows → ${path}`);
}

function verify(path: string): boolean {
  const snap = JSON.parse(readFileSync(path, "utf8")) as { counts: Counts; placeholders?: Counts };
  const before: Counts = snap.counts;
  const placeholders: Counts = snap.placeholders ?? {};
  const live = new Set(listPublicRelations().filter((r) => r.kind === "table").map((r) => r.name));
  const registered = registeredTables();
  const after = rowCounts(registered);

  let failures = 0;
  const fail = (table: string, msg: string) => {
    failures++;
    console.log(`FAIL  ${table.padEnd(30)} ${msg}`);
  };

  console.log("== registered tables (must carry space_id + created_by) ==");
  for (const t of registered) {
    if (!live.has(t)) {
      fail(t, "table does not exist");
      continue;
    }
    const cols = columnInfo(t);
    const space = cols.get("space_id");
    const creator = cols.get("created_by");
    const problems: string[] = [];
    if (!space) problems.push("no space_id");
    else {
      if (space.type !== "uuid") problems.push(`space_id is ${space.type}`);
      if (space.nullable) problems.push("space_id nullable");
    }
    if (!creator) problems.push("no created_by");
    else if (creator.type !== "uuid") problems.push(`created_by is ${creator.type}`);
    if (cols.has("user_id")) problems.push("user_id still present");

    let nulls = "?";
    let orphans = "?";
    let fk = "?";
    if (space) {
      nulls = scalar(`select count(*) from public.${q(t)} where space_id is null`);
      orphans = scalar(
        `select count(*) from public.${q(t)} x where not exists (select 1 from public.spaces s where s.id = x.space_id)`,
      );
      fk = scalar(
        `select count(*) from pg_constraint where conrelid = 'public.${q(t)}'::regclass and contype = 'f' ` +
          `and confrelid = 'public.spaces'::regclass`,
      );
      if (nulls !== "0") problems.push(`${nulls} null space_id`);
      if (orphans !== "0") problems.push(`${orphans} orphan space_id`);
      if (fk === "0") problems.push("no FK to spaces");
    }
    const b = before[t];
    const a = after[t] ?? 0;
    const allowedDrop = placeholders[t] ?? 0;
    let note = "";
    if (b === undefined) problems.push("not in snapshot");
    else if (a !== b - allowedDrop) problems.push(`rows ${b} → ${a}${allowedDrop ? ` (expected ${b - allowedDrop})` : ""}`);
    else if (allowedDrop) note = `  (${allowedDrop} placeholder removed)`;

    if (problems.length) fail(t, problems.join("; "));
    else console.log(`ok    ${t.padEnd(30)} rows ${String(a).padStart(6)}  nulls 0  orphans 0  fk ✓${note}`);
  }

  console.log("== shared reference + access tables (must NOT carry space_id) ==");
  for (const t of [...SHARED_REFERENCE.map((s) => s.table), ...ACCESS_TABLES]) {
    if (!live.has(t)) {
      fail(t, "table does not exist");
      continue;
    }
    const cols = columnInfo(t);
    const problems: string[] = [];
    if (cols.has("space_id") && !ACCESS_TABLES_WITH_SPACE_REF.has(t)) problems.push("has space_id");
    if (cols.has("user_id")) problems.push("has user_id");
    const b = before[t];
    const a = Number(scalar(`select count(*) from public.${q(t)}`));
    // profiles/spaces gain rows during adoption (Phil's space); others must not change.
    if (b !== undefined && a !== b && !["profiles", "spaces"].includes(t)) problems.push(`rows ${b} → ${a}`);
    if (problems.length) fail(t, problems.join("; "));
    else console.log(`ok    ${t.padEnd(30)} rows ${String(a).padStart(6)}  ${classifyTable(t).kind}`);
  }

  console.log("== unclassified tables ==");
  const unknown = [...live].filter((t) => classifyTable(t).kind === "unregistered");
  if (unknown.length) fail("(schema)", `unregistered: ${unknown.join(", ")}`);
  else console.log("ok    none");

  console.log("== spaces ==");
  const phil = scalar(
    "select s.id from public.spaces s join public.profiles p on p.personal_space_id = s.id where p.is_instance_owner",
  );
  if (!phil) fail("spaces", "instance owner has no personal space");
  else console.log(`ok    instance owner personal space ${phil}`);
  const groups = scalar("select count(*) from public.entity_groups");
  if (Number(groups) !== registered.length) fail("entity_groups", `${groups} rows, registry has ${registered.length}`);
  else console.log(`ok    entity_groups has ${groups} rows = registry`);

  const totalAfter = Object.values(after).reduce((a, b) => a + b, 0);
  console.log(`\n${registered.length} registered tables, ${totalAfter} rows; ${failures} failure(s)`);
  return failures === 0;
}

const [mode, file] = process.argv.slice(2);
if (mode === "snapshot" && file) {
  snapshot(file);
} else if (mode === "verify" && file) {
  process.exit(verify(file) ? 0 : 1);
} else {
  console.error("usage: verify-ownership.ts snapshot <counts.json> | verify <counts.json>");
  process.exit(2);
}
