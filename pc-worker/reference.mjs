/**
 * The PC's reference store (master run §9 "database size": bulk reference
 * data out of the hosted database, personal records stay).
 *
 * One SQLite file the worker owns, %LOCALAPPDATA%\Mycelium\reference.sqlite
 * (Node's own node:sqlite; no package to install). Today it holds Gousto
 * recipe details: 12,000 rows, 46 MB of the hosted database's 88 MB, that
 * are a copy of a public cookbook and not anything of Phil's. The hosted
 * row keeps its listing columns (title, picture, rating, cuisine, times), so
 * the cookbook pages and search lose nothing; the ingredients and method
 * live here and come back on request (the `reference_get` job) when a
 * recipe is opened, or are read straight from Gousto by the weekly sync.
 *
 * Nothing is removed from the hosted database until this store has
 * confirmed it holds the copy: the `reference_offload` job's result lists
 * exactly the slugs stored, and only those are cleared.
 *
 *   node pc-worker/reference.mjs --status            rows held, file size
 *   node pc-worker/reference.mjs --export [file]     every row as JSON lines (an archive dump)
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DIR = process.env.MYCELIUM_REFERENCE_DIR ?? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "Mycelium");
export const STORE_FILE = path.join(DIR, "reference.sqlite");

let db = null;
function open() {
  if (db) return db;
  mkdirSync(DIR, { recursive: true });
  db = new DatabaseSync(STORE_FILE);
  db.exec(`
    pragma journal_mode = wal;
    create table if not exists gousto_detail (
      slug        text primary key,
      detail      text not null,
      fetched_at  text,
      stored_at   text not null
    );
  `);
  return db;
}

export function available() {
  try {
    open();
    return true;
  } catch {
    return false;
  }
}

/** Store a batch of details. Returns the slugs now held (every one given, once written). */
export function storeGoustoDetails(rows) {
  const d = open();
  const put = d.prepare("insert into gousto_detail (slug, detail, fetched_at, stored_at) values (?, ?, ?, ?) on conflict (slug) do update set detail = excluded.detail, fetched_at = excluded.fetched_at, stored_at = excluded.stored_at");
  const now = new Date().toISOString();
  const held = [];
  d.exec("begin");
  try {
    for (const r of rows) {
      if (typeof r?.slug !== "string" || r.detail == null) continue;
      put.run(r.slug, typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail), r.fetched_at ?? null, now);
      held.push(r.slug);
    }
    d.exec("commit");
  } catch (err) {
    d.exec("rollback");
    throw err;
  }
  // Read back: a slug is reported held only if it can be read again.
  const check = d.prepare("select 1 from gousto_detail where slug = ? and length(detail) > 2");
  return held.filter((slug) => check.get(slug));
}

export function getGoustoDetail(slug) {
  const row = open().prepare("select detail, fetched_at from gousto_detail where slug = ?").get(slug);
  if (!row) return null;
  try {
    return { detail: JSON.parse(row.detail), fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

export function status() {
  const d = open();
  const { n } = d.prepare("select count(*) as n from gousto_detail").get();
  return { file: STORE_FILE, gousto_details: Number(n), bytes: existsSync(STORE_FILE) ? statSync(STORE_FILE).size : 0 };
}

export function exportJsonl(file) {
  const d = open();
  const lines = [];
  for (const row of d.prepare("select slug, detail, fetched_at, stored_at from gousto_detail order by slug").iterate()) {
    lines.push(JSON.stringify({ table: "gousto_recipes", slug: row.slug, detail: JSON.parse(row.detail), fetched_at: row.fetched_at, stored_at: row.stored_at }));
  }
  writeFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""));
  return { file, rows: lines.length };
}

// ---------------------------------------------------------------------------
// Job runners for worker.mjs

/** `reference_offload`: the cloud hands over rows; store them; say which are held. */
export async function offload(payload) {
  const table = payload.table ?? "gousto_recipes";
  if (table !== "gousto_recipes") throw new Error(`no reference store for ${table}`);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const held = storeGoustoDetails(rows);
  return { table, held, more: payload.more === true, store: status() };
}

/** `reference_get`: one detail back to the cloud. */
export async function get(payload) {
  const table = payload.table ?? "gousto_recipes";
  if (table !== "gousto_recipes") throw new Error(`no reference store for ${table}`);
  const slug = typeof payload.slug === "string" ? payload.slug : "";
  const found = slug ? getGoustoDetail(slug) : null;
  if (!found) throw new Error(`not held on this PC: ${slug || "(no slug)"}`);
  return { table, slug, detail: found.detail, fetched_at: found.fetched_at };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const args = process.argv.slice(2);
  if (args.includes("--export")) {
    const i = args.indexOf("--export");
    const file = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : path.join(DIR, `reference-${new Date().toISOString().slice(0, 10)}.jsonl`);
    console.log(JSON.stringify(exportJsonl(file)));
  } else {
    console.log(JSON.stringify(status()));
  }
}
