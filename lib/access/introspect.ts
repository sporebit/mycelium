/**
 * Schema introspection for the LOCAL Supabase stack.
 *
 * Node-only: shells out to psql inside the database container. Used by the
 * registry coverage test and by the Part 2 ownership verifier. Never import
 * from app code.
 *
 * Why docker exec rather than a Postgres driver: the project has no pg
 * driver, PostgREST's OpenAPI document cannot tell a view from a table, and
 * the container is always present when the local stack is up. The container
 * name is derived from `project_id` in supabase/config.toml.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export type RelationKind = "table" | "view";
export type PublicRelation = { name: string; kind: RelationKind };

export function localDbContainer(): string {
  if (process.env.MYCELIUM_DB_CONTAINER) return process.env.MYCELIUM_DB_CONTAINER;
  const toml = readFileSync(path.resolve(process.cwd(), "supabase/config.toml"), "utf8");
  const m = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error("supabase/config.toml has no project_id; run `supabase init`");
  return `supabase_db_${m[1]}`;
}

/** Run one SQL statement as postgres on the local stack; returns raw rows split on tabs. */
export function localSql(sql: string): string[][] {
  const container = localDbContainer();
  let out: string;
  try {
    out = execFileSync(
      "docker",
      ["exec", container, "psql", "-U", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not query the local Supabase stack via container "${container}". ` +
        `Is Docker running and has \`supabase start\` (or \`supabase db start\`) been run? ` +
        `Underlying error: ${msg}`,
    );
  }
  return out
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

/** Every relation in the public schema, tables and views, sorted by name. */
export function listPublicRelations(): PublicRelation[] {
  const rows = localSql(
    "select table_name, table_type from information_schema.tables " +
      "where table_schema = 'public' order by table_name",
  );
  return rows.map(([name, type]) => ({
    name,
    kind: type === "VIEW" ? "view" : "table",
  }));
}
