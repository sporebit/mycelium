/**
 * phirstmaxx-import — the old PhirstMaxxing database into Mycelium's pm_*
 * tables through the app's import route (claude/phirstmaxx-spec.md §10).
 *
 *   node scripts/phirstmaxx-import.mjs                 dry run (default): the plan, nothing written
 *   node scripts/phirstmaxx-import.mjs --apply         write
 *   node scripts/phirstmaxx-import.mjs --undo          remove what the import brought (local rows survive)
 *   node scripts/phirstmaxx-import.mjs --since <iso>   only blocks and plans starting at or after this instant
 *
 * env (from the environment or .env.local; nothing is ever printed):
 *   PHIRSTMAXX_OLD_DB_URL   the old Supabase project's Postgres URL (spec §11.4), read-only here
 *   API_SECRET              acts as Phil on the route
 *   BASE_URL                the Mycelium to post to (default http://localhost:3000)
 *
 * The script only reads: one read-only transaction over the old tables, then
 * one POST. The route does every write, as Phil, under RLS. Node ≥ 22, `pg`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const UNDO = args.includes("--undo");
const sinceIdx = args.indexOf("--since");
const SINCE = sinceIdx >= 0 ? args[sinceIdx + 1] : null;
if (SINCE && Number.isNaN(Date.parse(SINCE))) die("--since needs an ISO instant, e.g. 2026-09-01T00:00:00Z");

const env = {};
try {
  for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
} catch {
  // no .env.local: the environment alone
}
const get = (k) => process.env[k] ?? env[k] ?? "";
const BASE = (get("BASE_URL") || "http://localhost:3000").replace(/\/+$/, "");
const SECRET = get("API_SECRET");
const DB_URL = get("PHIRSTMAXX_OLD_DB_URL");
if (!SECRET) die("API_SECRET is missing (environment or .env.local).");
if (!UNDO && !DB_URL) die("PHIRSTMAXX_OLD_DB_URL is missing (environment or .env.local; spec §11.4).");

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function post(body) {
  const res = await fetch(`${BASE}/api/phirstmaxx/import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-secret": SECRET },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) die(`${res.status} ${json.error ?? "import failed"}`);
  return json;
}

/** Every table listed in spec §10, read in one read-only, repeatable-read transaction. */
async function readOld() {
  const client = new pg.Client({ connectionString: DB_URL, ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const rows = async (sql, params = []) => (await client.query(sql, params)).rows;
    const count = async (table) => Number((await client.query(`select count(*)::int as n from ${table}`)).rows[0].n);
    const since = SINCE ? new Date(SINCE).toISOString() : null;

    const members = await rows(`
      select m.id, m.user_id, u.email, m.display_name, m.colour, m.home_location_id, m.has_car, m.settings
      from members m left join auth.users u on u.id = m.user_id
      order by m.created_at`);
    const locations = await rows("select id, label, address, lat, lng, kind, saved, created_by from locations order by created_at");
    const pets = await rows("select id, name, notes from pets order by created_at");
    const block_types = await rows("select id, name, engine_kind, colour, sort_order, default_flexible from block_types order by sort_order, created_at");
    const blocks = await rows(
      `select id, user_id, entered_by, start_at, end_at, block_type_id, kind, flexible, title, location_id, recurrence_rule, recurrence_exceptions, status
       from availability_blocks
       where recurrence_rule is not null or $1::timestamptz is null or start_at >= $1::timestamptz
       order by start_at`,
      [since],
    );
    const known_days_count = await count("known_days");
    const waking_overrides = await rows("select id, day::text as day, day_end from waking_overrides order by day");
    const ideas = await rows(
      `select id, created_by, title, url, image_url, description, place_name, place_address, lat, lng, category, tags, cost_pence, duration_min,
              dog_friendly, indoor, best_time_of_day, seasons, opening_notes, status, stars_by, created_at
       from ideas order by created_at`,
    );
    const route_overrides = await rows("select id, from_key, to_key, minutes, updated_at from route_overrides order by updated_at");
    const plans = await rows(
      `select id, kind, title, start_at, end_at, status, proposed_by, responded_by, responded_at, notes, score
       from plans where $1::timestamptz is null or start_at >= $1::timestamptz order by start_at`,
      [since],
    );
    const planIds = plans.map((p) => p.id);
    const plan_items = planIds.length ? await rows("select id, plan_id, idea_id, position from plan_items where plan_id = any($1::uuid[]) order by plan_id, position", [planIds]) : [];
    const plan_legs = planIds.length ? await rows("select id, plan_id, position, kind, who, from_label, to_label, minutes from plan_legs where plan_id = any($1::uuid[]) order by plan_id, position", [planIds]) : [];
    const phase2 = {};
    for (const t of ["expenses", "budget_goals", "contributions", "memories", "trips", "astro_events", "notifications"]) phase2[t] = await count(t);
    await client.query("commit");

    const iso = (v) => (v instanceof Date ? v.toISOString() : v);
    const times = (list, keys) => list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keys.includes(k) ? iso(v) : v])));
    return {
      exported_at: new Date().toISOString(),
      members,
      locations,
      pets,
      block_types,
      blocks: times(blocks, ["start_at", "end_at"]),
      known_days_count,
      waking_overrides,
      ideas: times(ideas, ["created_at"]),
      route_overrides: times(route_overrides, ["updated_at"]),
      plans: times(plans, ["start_at", "end_at", "responded_at"]),
      plan_items,
      plan_legs,
      phase2,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function printResult(result) {
  const head = result.undo ? (result.dry_run ? "UNDO — DRY RUN" : "UNDONE") : result.dry_run ? "DRY RUN" : "APPLIED";
  console.log(`\n${head}  (${BASE})\n`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("table", 20), pad(result.undo ? "removed" : "inserted", 9), pad("updated", 8), pad("unchanged", 10), "skipped");
  for (const [table, c] of Object.entries(result.tables)) {
    console.log(pad(table, 20), pad(result.undo ? c.updated : c.inserted, 9), pad(result.undo ? "" : c.updated, 8), pad(result.undo ? "" : c.unchanged, 10), c.skipped.length);
  }
  if (!result.undo) {
    console.log("\nmembers:");
    for (const m of result.members) console.log(`  ${m.display_name} → ${m.mapped_to ?? "NOT MAPPED"}`);
    for (const u of result.unmapped) console.log(`  ! ${u.display_name}: ${u.reason}`);
    console.log(`\nknown_days: ${result.known_days} (not imported; every day is known in PhirstMaxx)`);
    console.log("phase 2, kept in the old database:", Object.entries(result.phase2).map(([t, n]) => `${t} ${n}`).join(", "));
    console.log(`research ${result.dry_run ? "to queue" : "queued"}: ${result.research_queued}`);
  }
  const skipped = Object.entries(result.tables).flatMap(([t, c]) => c.skipped.map((s) => ({ table: t, ...s })));
  if (skipped.length) {
    console.log(`\nconflicts / skipped (${skipped.length}):`);
    const byReason = new Map();
    for (const s of skipped) byReason.set(`${s.table}: ${s.reason}`, (byReason.get(`${s.table}: ${s.reason}`) ?? 0) + 1);
    for (const [reason, n] of byReason) console.log(`  ${n} × ${reason}`);
    if (skipped.length <= 40) for (const s of skipped) console.log(`    ${s.table} ${s.old_id}: ${s.reason}`);
  }
  if (result.errors?.length) {
    console.log(`\nerrors (${result.errors.length}):`);
    for (const e of result.errors) console.log(`  ${e.table} ${e.key}: ${e.error}`);
  }
}

if (UNDO) {
  printResult(await post({ undo: true, dryRun: !APPLY }));
  if (!APPLY) console.log("\nAdd --apply to undo for real.");
} else {
  const payload = await readOld();
  console.log(
    `read: ${payload.members.length} members, ${payload.locations.length} locations, ${payload.block_types.length} block types, ${payload.blocks.length} blocks, ${payload.waking_overrides.length} waking overrides, ${payload.pets.length} pets, ${payload.ideas.length} ideas, ${payload.route_overrides.length} route overrides, ${payload.plans.length} plans (${payload.plan_items.length} items, ${payload.plan_legs.length} legs)${SINCE ? ` since ${SINCE}` : ""}`,
  );
  printResult(await post({ payload, dryRun: !APPLY }));
  if (!APPLY) console.log("\nAdd --apply to write.");
}
