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

export type LocalStackEnv = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
};

let cachedEnv: LocalStackEnv | null = null;

/**
 * URL and keys of the running local stack, from `supabase status -o env`.
 * Cached per process; the CLI call takes a second or two. Tests that talk
 * to PostgREST or mint user JWTs use this so nothing is hard-coded and
 * nothing from .env.local (the hosted project) is touched.
 */
export function localStackEnv(): LocalStackEnv {
  if (cachedEnv) return cachedEnv;
  let out: string;
  try {
    out = execFileSync(process.platform === "win32" ? "supabase.exe" : "supabase", ["status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`\`supabase status\` failed; is the local stack up? ${msg}`);
  }
  const vars: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) vars[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
  }
  const need = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET"];
  for (const k of need) {
    if (!vars[k]) throw new Error(`supabase status did not report ${k}`);
  }
  cachedEnv = {
    apiUrl: vars.API_URL,
    anonKey: vars.ANON_KEY,
    serviceRoleKey: vars.SERVICE_ROLE_KEY,
    jwtSecret: vars.JWT_SECRET,
  };
  return cachedEnv;
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
