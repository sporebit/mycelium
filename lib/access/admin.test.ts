import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { localSql } from "./introspect";
import { registeredTables } from "./registry";

/**
 * VERIFY 5: no admin endpoint reads a content table. Two proofs:
 *   1. Static — every file under app/api/admin, app/admin and
 *      lib/system/admin.ts names no registered (entity-group) table in a
 *      `.from("…")` call.
 *   2. Database — every admin_* function's source references no registered
 *      table, with ONE sanctioned exception: admin_get/set_feature_flags
 *      touch user_settings and only its three feature-flag columns (P12
 *      open item A puts the flags there). That exception is asserted
 *      narrowly: those two bodies may name user_settings and nothing else
 *      from the content list, and no other user_settings column.
 * "Instance owner manages access, never reads others' content."
 */

const ROOT = path.resolve(__dirname, "../..");
const CONTENT = new Set(registeredTables());
const FLAG_FUNCTIONS = new Set(["admin_get_feature_flags", "admin_set_feature_flags"]);
const FLAG_COLUMNS = ["voice_capture_enabled", "ai_categorisation_enabled", "claude_vision_label_scan_enabled"];

function walk(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("admin never touches content tables", () => {
  it("statically: app/api/admin, app/admin and lib/system/admin.ts", () => {
    const files = [
      ...walk(path.join(ROOT, "app", "api", "admin")),
      ...walk(path.join(ROOT, "app", "admin")),
      path.join(ROOT, "lib", "system", "admin.ts"),
    ];
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]/g)) {
        if (CONTENT.has(m[1])) offenders.push(`${path.relative(ROOT, f)}: .from("${m[1]}")`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("in the database: admin_* function bodies name no registered table (feature flags excepted, narrowly)", () => {
    const fns = localSql(
      "select p.proname, regexp_replace(p.prosrc, E'[\\\\n\\\\r\\\\t]+', ' ', 'g') from pg_proc p " +
        "join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'admin!_%' escape '!'",
    );
    expect(fns.length).toBeGreaterThanOrEqual(10);
    const offenders: string[] = [];
    const userSettingsColumns = localSql(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'user_settings'",
    ).map((r) => r[0]);
    for (const [name, src] of fns) {
      for (const t of CONTENT) {
        const named = new RegExp(`\\bpublic\\.${t}\\b`).test(src);
        if (!named) continue;
        if (FLAG_FUNCTIONS.has(name) && t === "user_settings") {
          const otherColumns = userSettingsColumns.filter(
            // "id" is the profile's id in the join, never user_settings.id.
            (c) => !FLAG_COLUMNS.includes(c) && !["id", "space_id", "created_by"].includes(c) && new RegExp(`\\b${c}\\b`).test(src),
          );
          if (otherColumns.length) offenders.push(`${name} touches user_settings.${otherColumns.join(",")}`);
          continue;
        }
        offenders.push(`${name} → public.${t}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
