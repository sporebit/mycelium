/**
 * Finance never appears on the wall, under any person (master run §11).
 * Two guards: nothing under the wall's code imports anything from the
 * finance stream, and nothing in the wall's contract names a money field.
 * The e2e spec (e2e/wall.phil.spec.ts) walks the live JSON as well.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FINANCE_WORDS } from "./contract";

const ROOT = path.resolve(__dirname, "..", "..");
const WALL_DIRS = ["lib/wall", "app/api/wall", "app/wall", "components/wall", "lib/system/wall.ts", "lib/system/wallGlance.ts", "lib/system/wallRequest.ts", "lib/system/quickUnlock.ts"];

function files(p: string): string[] {
  const full = path.join(ROOT, p);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(p, d.name)) : /\.(ts|tsx)$/.test(d.name) ? [path.join(full, d.name)] : []));
}

describe("the wall and finance", () => {
  const all = WALL_DIRS.flatMap(files);
  it("has wall code to check", () => {
    expect(all.length).toBeGreaterThan(10);
  });
  it("imports nothing from the finance stream, the briefing composer or the bank", () => {
    for (const f of all) {
      const src = readFileSync(f, "utf8");
      const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      const bad = imports.filter((i) => /finance|briefings\/(compose|data|refreshFinance)|truelayer|monzo|paypal|budget/i.test(i));
      expect(bad, path.relative(ROOT, f)).toEqual([]);
    }
  });
  it("names no money field in the contract", () => {
    const src = readFileSync(path.join(ROOT, "lib/wall/contract.ts"), "utf8");
    const keys = [...src.matchAll(/^\s+([a-z_]+)\??:/gm)].map((m) => m[1].toLowerCase());
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) for (const w of FINANCE_WORDS) expect(k.includes(w), `${k} / ${w}`).toBe(false);
  });
  it("never speaks a finance kind", () => {
    const src = readFileSync(path.join(ROOT, "lib/system/wallGlance.ts"), "utf8");
    for (const kind of ["bill", "budget", "subscription", "unusual"]) expect(src.includes(`"${kind}"`), kind).toBe(true);
  });
});
