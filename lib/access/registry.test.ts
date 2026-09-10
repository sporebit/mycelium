/**
 * Global Rule 6 (P12): every public table is in exactly one of the entity
 * registry, the shared-reference list, or Supabase-internal. This test
 * proves it against the running LOCAL stack, so it fails when:
 *   - a migration adds a table nobody classified,
 *   - the registry names a table that no longer exists,
 *   - a table is listed twice,
 *   - a new view appears that DERIVED_RELATIONS does not know about.
 *
 * It needs the local stack (`supabase start` or `supabase db start`) and
 * fails loudly, not skips, when it is absent. That is deliberate: a silent
 * skip would let an unclassified table reach Part 2.
 */
import { describe, expect, it } from "vitest";
import { listPublicRelations } from "./introspect";
import {
  DERIVED_RELATIONS,
  ENTITY_GROUPS,
  FINANCE_SECTION,
  SECTIONS,
  SHARED_REFERENCE,
  classifyTable,
  entityGroupSeedRows,
  registeredTables,
} from "./registry";

describe("entity registry — internal consistency", () => {
  it("lists every table at most once across entity groups and shared reference", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const g of ENTITY_GROUPS) {
      for (const t of g.tables) {
        const where = `${g.section}.${g.group}`;
        if (seen.has(t)) dupes.push(`${t} (${seen.get(t)} and ${where})`);
        seen.set(t, where);
      }
    }
    for (const s of SHARED_REFERENCE) {
      if (seen.has(s.table)) dupes.push(`${s.table} (${seen.get(s.table)} and shared)`);
      seen.set(s.table, "shared");
    }
    for (const v of DERIVED_RELATIONS) {
      if (seen.has(v)) dupes.push(`${v} (${seen.get(v)} and derived)`);
    }
    expect(dupes).toEqual([]);
  });

  it("uses only known sections and unique (section, group) keys", () => {
    const keys = new Set<string>();
    for (const g of ENTITY_GROUPS) {
      expect(SECTIONS).toContain(g.section);
      const key = `${g.section}.${g.group}`;
      expect(keys.has(key), `duplicate group ${key}`).toBe(false);
      keys.add(key);
      expect(g.tables.length, `${key} has no tables`).toBeGreaterThan(0);
    }
  });

  it("keeps every finance table under the finance section only", () => {
    const financeTables = ENTITY_GROUPS.filter((g) => g.section === FINANCE_SECTION).flatMap(
      (g) => g.tables,
    );
    expect(financeTables.sort()).toEqual(
      ["accounts", "bank_accounts", "investments", "paypal_payments", "transactions"].sort(),
    );
  });

  it("produces one entity_groups seed row per registered table", () => {
    const rows = entityGroupSeedRows();
    expect(rows.map((r) => r.table_name)).toEqual([...registeredTables()]);
    for (const r of rows) expect(SECTIONS).toContain(r.section);
  });
});

describe("entity registry — coverage against the local database", () => {
  const relations = listPublicRelations();
  const tables = relations.filter((r) => r.kind === "table").map((r) => r.name);
  const views = relations.filter((r) => r.kind === "view").map((r) => r.name);

  it("sees a populated public schema (the local stack is up and migrated)", () => {
    expect(tables.length).toBeGreaterThan(50);
  });

  it("classifies every public base table as entity or shared — none unregistered", () => {
    const unregistered = tables.filter((t) => classifyTable(t).kind === "unregistered");
    expect(
      unregistered,
      "Tables in public with no registry entry. Add each to ENTITY_GROUPS or SHARED_REFERENCE " +
        "in lib/access/registry.ts — or STOP and ask if the group is not obvious.",
    ).toEqual([]);
  });

  it("does not classify a base table as derived", () => {
    const misfiled = tables.filter((t) => classifyTable(t).kind === "derived");
    expect(misfiled).toEqual([]);
  });

  it("names no table that the database does not have", () => {
    const live = new Set(tables);
    const stale = [
      ...registeredTables().filter((t) => !live.has(t)),
      ...SHARED_REFERENCE.map((s) => s.table).filter((t) => !live.has(t)),
    ];
    expect(stale, "Registry entries with no matching table in public").toEqual([]);
  });

  it("knows every view in public as a derived relation", () => {
    expect([...views].sort()).toEqual([...DERIVED_RELATIONS].sort());
  });

  it("covers exactly the live table count", () => {
    const covered = registeredTables().length + SHARED_REFERENCE.length;
    expect(covered).toBe(tables.length);
  });
});
