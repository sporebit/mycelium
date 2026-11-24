/**
 * The importer against the fixture dump (docs/fixtures/phirstmaxx-old-dump.json),
 * the file scripts/phirstmaxx-import.mjs --from-dump reads. This is the proof
 * the spec asks for without the old database (§10, §12): the dump has the
 * shape readOld() produces, the planner places every table, a second pass
 * over its own output changes nothing, and the deliberate oddities in the
 * data (an unconfirmed block, an idea with no pin, a weekly rule with an
 * exception, an unsaved place, a route whose coordinate key does not match an
 * idea to three decimals) come out the way the mapping table says.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPlan, isRef, resolveRow, summarise, TABLES, type Existing, type ExistingRow, type ImportPayload, type Plan, type Table } from "./import";

const dump = JSON.parse(readFileSync(path.join(process.cwd(), "docs/fixtures/phirstmaxx-old-dump.json"), "utf8")) as ImportPayload & { _about?: string };
const PHIL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KIRSTY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = Date.parse("2026-11-24T01:00:00Z");
const me = { uid: PHIL, email: "pwhelanonline@gmail.com", others: [KIRSTY] };
const seeded: Existing = {
  pm_people: [
    { id: "pp1", person_id: PHIL, old_id: null, waking: {}, buffers: {}, settings: {}, has_car: false, home_place_id: null },
    { id: "pp2", person_id: KIRSTY, old_id: null, waking: {}, buffers: {}, settings: {}, has_car: false, home_place_id: null },
  ],
};

function applyInMemory(plan: Plan, before: Existing): Existing {
  const after: Existing = {};
  for (const t of TABLES) after[t] = (before[t] ?? []).map((r) => ({ ...r }));
  const ids = new Map<Table, Map<string, string>>(TABLES.map((t) => [t, new Map((after[t] ?? []).filter((r) => typeof r.old_id === "string").map((r) => [r.old_id as string, r.id]))]));
  let n = 0;
  for (const step of plan.steps) {
    const rows = after[step.table]!;
    for (const id of step.deletes) rows.splice(rows.findIndex((r) => r.id === id), 1);
    for (const u of step.updates) Object.assign(rows.find((r) => r.id === u.id)!, resolveRow(u.row, ids));
    for (const d of step.inserts) {
      const resolved = resolveRow(d.row, ids);
      for (const [k, v] of Object.entries(d.row)) if (isRef(v) && resolved[k] === undefined) throw new Error(`${step.table} ${d.key}: ${k} unresolved`);
      const row: ExistingRow = { id: `new-${++n}`, ...resolved };
      rows.push(row);
      if (typeof row.old_id === "string") ids.get(step.table)!.set(row.old_id, row.id);
    }
  }
  return after;
}

describe("the fixture dump through the importer", () => {
  it("has the shape readOld() produces", () => {
    for (const k of ["members", "locations", "pets", "block_types", "blocks", "waking_overrides", "ideas", "route_overrides", "plans", "plan_items", "plan_legs"] as const) {
      expect(Array.isArray(dump[k]), k).toBe(true);
    }
    expect(typeof dump.known_days_count).toBe("number");
    expect(dump.members.map((m) => m.display_name)).toEqual(["Phil", "Kirsty"]);
  });

  it("plans every table on an empty space and says what it skipped and why", () => {
    const plan = buildPlan({ payload: dump, existing: seeded, me, now: NOW });
    const s = summarise(plan);
    expect(plan.members.map((m) => `${m.display_name}→${m.mapped_to ? "mapped" : "-"}`)).toEqual(["Phil→mapped", "Kirsty→mapped"]);
    expect(plan.unmapped).toEqual([]);
    expect(s.pm_people.updated).toBe(2);
    expect(s.pm_places.inserted).toBe(4);
    expect(s.pm_block_types.inserted).toBe(4);
    expect(s.pm_pets.inserted).toBe(1);
    // the weekly rule becomes twelve weeks of Mon–Thu shifts minus Christmas Day; the pending block is skipped, the two one-offs kept
    const weekly = plan.steps.find((st) => st.table === "pm_blocks")!.inserts.filter((d) => String(d.key).startsWith("b0000000-0000-4000-8000-000000000001:"));
    expect(weekly.length).toBeGreaterThanOrEqual(40);
    expect(weekly.some((d) => String(d.key).endsWith(":2026-12-25"))).toBe(false);
    expect(s.pm_blocks.inserted).toBe(weekly.length + 2);
    expect(s.pm_blocks.skipped.map((x) => x.reason)).toEqual([expect.stringMatching(/confirm/i)]);
    expect(s.pm_waking.inserted).toBe(4); // two overrides fanned out to two people
    expect(s.pm_things.inserted).toBe(3);
    expect(s.pm_drops.inserted).toBe(3);
    // one route joins Home to High Force; the other's "lat,lng" key is written to four decimals and
    // coordKey matches ideas to three, so the importer says so rather than guessing
    expect(s.pm_travel.inserted).toBe(1);
    expect(s.pm_travel.skipped.map((x) => x.reason)).toEqual([expect.stringMatching(/needs one saved place and one pinned idea/)]);
    expect(s.pm_plans.inserted).toBe(2);
    expect(s.pm_plan_legs.inserted).toBe(4); // two legs, "who: both" → one row per person
    // only the idea without a pin is re-researched
    expect(plan.research).toEqual(["55555555-5555-4555-8555-555555555552"]);
    expect(plan.known_days).toBe(61);
    expect(plan.phase2.expenses).toBe(14);
  });

  it("is idempotent: the same dump against what it produced is all unchanged", () => {
    const first = buildPlan({ payload: dump, existing: seeded, me, now: NOW });
    const after = applyInMemory(first, seeded);
    const second = buildPlan({ payload: dump, existing: after, me, now: NOW });
    const s = summarise(second);
    for (const t of TABLES) {
      expect(s[t].inserted, `${t} inserted`).toBe(0);
      expect(s[t].updated, `${t} updated`).toBe(0);
    }
    expect(second.research).toEqual([]);
  });
});
