import { describe, expect, it } from "vitest";
import { buildPlan, expandBlock, isRef, mapMembers, resolveRow, roundOutHalfHour, summarise, TABLES, type Existing, type ExistingRow, type ImportPayload, type OldBlock, type Plan, type Table } from "./import";
import { londonTime } from "./engine/time";

const PHIL_OLD = "11111111-1111-4111-8111-111111111111";
const KIRSTY_OLD = "22222222-2222-4222-8222-222222222222";
const PHIL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KIRSTY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HOME = "33333333-3333-4333-8333-333333333333";
const SHIFT = "44444444-4444-4444-8444-444444444444";
const IDEA = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const NOW = Date.parse("2026-11-22T12:00:00Z");

const members = [
  { id: "m1", user_id: PHIL_OLD, email: "Phil@Example.com", display_name: "Phil", colour: "#2E9E5B", home_location_id: HOME, has_car: true, settings: { waking: { weekday: { start: "07:00", end: "23:00" }, weekend: { start: "08:00", end: "00:30" } }, buffers: { shift: 15, sit: 30, walk: 15 }, taste: { walk: 0.8 } } },
  { id: "m2", user_id: KIRSTY_OLD, email: "k@example.com", display_name: "Kirsty", colour: "#F2861B", home_location_id: null, has_car: true, settings: {} },
];

function block(over: Partial<OldBlock> = {}): OldBlock {
  return {
    id: "b1",
    user_id: PHIL_OLD,
    entered_by: PHIL_OLD,
    start_at: "2026-11-23T09:10:00Z",
    end_at: "2026-11-23T17:20:00Z",
    block_type_id: SHIFT,
    kind: "shift",
    flexible: false,
    title: null,
    location_id: HOME,
    recurrence_rule: null,
    recurrence_exceptions: [],
    status: "confirmed",
    ...over,
  };
}

function payload(over: Partial<ImportPayload> = {}): ImportPayload {
  return {
    exported_at: "2026-11-22T12:00:00Z",
    members,
    locations: [{ id: HOME, label: "Home", address: "1 Lane", lat: 54.5, lng: -1.5, kind: "home", saved: true, created_by: PHIL_OLD }],
    pets: [{ id: "p1", name: "Max", notes: null }],
    block_types: [{ id: SHIFT, name: "Shift", engine_kind: "shift", colour: null, sort_order: 2, default_flexible: false }],
    blocks: [block(), block({ id: "b2", status: "pending_confirm" })],
    known_days_count: 40,
    waking_overrides: [{ id: "w1", day: "2026-11-28", day_end: "02:00" }],
    ideas: [
      {
        id: IDEA,
        created_by: KIRSTY_OLD,
        title: "High Force",
        url: "https://example.com/high-force",
        image_url: "https://example.com/hf.jpg",
        description: "Waterfall walk",
        place_name: "High Force",
        place_address: null,
        lat: 54.651,
        lng: -2.187,
        category: "walk",
        tags: ["walk", "dog"],
        cost_pence: 400,
        duration_min: 90,
        dog_friendly: "yes",
        indoor: false,
        best_time_of_day: ["morning"],
        seasons: [],
        opening_notes: null,
        status: "idea",
        stars_by: { [PHIL_OLD]: 3, [KIRSTY_OLD]: 2 },
        created_at: "2026-09-01T10:00:00Z",
      },
    ],
    route_overrides: [{ id: "r1", from_key: HOME, to_key: "54.651,-2.187", minutes: 55, updated_at: "2026-09-02T10:00:00Z" }],
    plans: [{ id: PLAN, kind: "plan", title: "High Force", start_at: "2026-11-29T10:00:00Z", end_at: "2026-11-29T13:00:00Z", status: "accepted", proposed_by: PHIL_OLD, responded_by: KIRSTY_OLD, responded_at: "2026-11-20T18:00:00Z", notes: null, score: { taste: 0.7 } }],
    plan_items: [{ id: "i1", plan_id: PLAN, idea_id: IDEA, position: 0 }],
    plan_legs: [
      { id: "l1", plan_id: PLAN, position: 0, kind: "outbound", who: "both", from_label: "Home", to_label: "High Force", minutes: 55 },
      { id: "l2", plan_id: PLAN, position: 1, kind: "return", who: "both", from_label: "High Force", to_label: "Home", minutes: 55 },
    ],
    phase2: { expenses: 12, trips: 1 },
    ...over,
  };
}

const me = { uid: PHIL, email: "phil@example.com", others: [KIRSTY] };
const seeded: Existing = {
  pm_people: [
    { id: "pp1", person_id: PHIL, old_id: null, waking: {}, buffers: {}, settings: {}, has_car: false, home_place_id: null },
    { id: "pp2", person_id: KIRSTY, old_id: null, waking: {}, buffers: {}, settings: {}, has_car: false, home_place_id: null },
  ],
};

/** What the database would hold after the plan is written: every insert gets an id, refs resolve, updates land. */
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

describe("roundOutHalfHour", () => {
  it("rounds the start down and the end up", () => {
    expect(roundOutHalfHour("2026-11-23T09:10:00Z", "2026-11-23T17:20:00Z")).toEqual({ starts_at: "2026-11-23T09:00:00.000Z", ends_at: "2026-11-23T17:30:00.000Z" });
  });
  it("leaves aligned times alone", () => {
    expect(roundOutHalfHour("2026-11-23T09:30:00Z", "2026-11-23T17:00:00Z")).toEqual({ starts_at: "2026-11-23T09:30:00.000Z", ends_at: "2026-11-23T17:00:00.000Z" });
  });
  it("never produces an empty block", () => {
    const r = roundOutHalfHour("2026-11-23T09:00:00Z", "2026-11-23T09:00:01Z");
    expect(Date.parse(r.ends_at) - Date.parse(r.starts_at)).toBe(30 * 60 * 1000);
  });
});

describe("mapMembers", () => {
  it("maps the caller by email, case-insensitively, and the other member to the one other person", () => {
    const m = mapMembers(members, me);
    expect(m.byOldUser.get(PHIL_OLD)).toBe(PHIL);
    expect(m.byOldUser.get(KIRSTY_OLD)).toBe(KIRSTY);
    expect(m.unmapped).toEqual([]);
  });
  it("falls back to the green member when the caller's email is unknown", () => {
    const m = mapMembers(members, { ...me, email: null });
    expect(m.byOldUser.get(PHIL_OLD)).toBe(PHIL);
  });
  it("leaves the other member unmapped when nobody else is in the space, and says why", () => {
    const m = mapMembers(members, { ...me, others: [] });
    expect(m.byOldUser.get(KIRSTY_OLD)).toBeUndefined();
    expect(m.unmapped).toEqual([{ display_name: "Kirsty", reason: "nobody else is in the PhirstMaxx space yet" }]);
  });
  it("will not guess between two other people", () => {
    const m = mapMembers(members, { ...me, others: [KIRSTY, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"] });
    expect(m.byOldUser.has(KIRSTY_OLD)).toBe(false);
    expect(m.unmapped[0].reason).toMatch(/2 other people/);
  });
});

describe("expandBlock", () => {
  it("expands a weekly rule into twelve weeks of half-hour-aligned blocks sharing the old id as series", () => {
    // Mondays 17:00 London from August; the anchor is long past
    const b = block({ id: "rec", start_at: new Date(londonTime("2026-08-03", "17:05")).toISOString(), end_at: new Date(londonTime("2026-08-03", "22:55")).toISOString(), recurrence_rule: "FREQ=WEEKLY" });
    const out = expandBlock(b, NOW);
    expect(out).toHaveLength(12);
    expect(out[0].old_id).toBe("rec:2026-11-23");
    expect(out[0].series_id).toBe("rec");
    expect(out[0].starts_at).toBe(new Date(londonTime("2026-11-23", "17:00")).toISOString());
    expect(out[0].ends_at).toBe(new Date(londonTime("2026-11-23", "23:00")).toISOString());
    for (const o of out) {
      expect(Date.parse(o.starts_at) % 1_800_000).toBe(0);
      expect(Date.parse(o.ends_at) % 1_800_000).toBe(0);
    }
  });
  it("skips exception dates", () => {
    const b = block({ id: "rec", start_at: new Date(londonTime("2026-08-03", "17:00")).toISOString(), end_at: new Date(londonTime("2026-08-03", "22:00")).toISOString(), recurrence_rule: "FREQ=WEEKLY", recurrence_exceptions: ["2026-11-30"] });
    const out = expandBlock(b, NOW);
    expect(out).toHaveLength(11);
    expect(out.map((o) => o.old_id)).not.toContain("rec:2026-11-30");
  });
  it("keeps a one-off as itself", () => {
    expect(expandBlock(block(), NOW)).toEqual([{ old_id: "b1", starts_at: "2026-11-23T09:00:00.000Z", ends_at: "2026-11-23T17:30:00.000Z", series_id: null }]);
  });
});

describe("buildPlan", () => {
  it("plans every table on an empty space, skipping what does not fit and saying why", () => {
    const plan = buildPlan({ payload: payload(), existing: seeded, me, now: NOW });
    const s = summarise(plan);
    expect(s.pm_places.inserted).toBe(1);
    expect(s.pm_block_types.inserted).toBe(1);
    expect(s.pm_people.updated).toBe(2);
    expect(s.pm_blocks.inserted).toBe(1);
    expect(s.pm_blocks.skipped).toEqual([{ old_id: "b2", reason: "status pending_confirm" }]);
    expect(s.pm_waking.inserted).toBe(2); // the shared row, once per person
    expect(s.pm_pets.inserted).toBe(1);
    expect(s.pm_things.inserted).toBe(1);
    expect(s.pm_thing_facts.inserted).toBe(2); // image_url, place_name
    expect(s.pm_drops.inserted).toBe(1);
    expect(s.pm_plans.inserted).toBe(1);
    expect(s.pm_plan_responses.inserted).toBe(1);
    expect(s.pm_plan_legs.inserted).toBe(4); // two legs × both people
    expect(s.pm_travel.inserted).toBe(1);
    expect(plan.known_days).toBe(40);
    expect(plan.phase2).toEqual({ expenses: 12, trips: 1 });
    expect(plan.research).toEqual([]); // the idea has coordinates
  });

  it("maps the rows the way the table at the top of import.ts says", () => {
    const plan = buildPlan({ payload: payload(), existing: seeded, me, now: NOW });
    const step = (t: Table) => plan.steps.find((s) => s.table === t)!;
    const b = step("pm_blocks").inserts[0].row;
    expect(b).toMatchObject({ person_id: PHIL, firmness: "firm", engine_kind: "shift", local: false, old_id: "b1", starts_at: "2026-11-23T09:00:00.000Z", ends_at: "2026-11-23T17:30:00.000Z" });
    expect(b.type_id).toEqual({ $ref: "pm_block_types", old_id: SHIFT });
    const phil = step("pm_people").updates.find((u) => u.key === PHIL)!.row;
    expect(phil).toMatchObject({ has_car: true, old_id: "m1", waking: members[0].settings.waking, buffers: members[0].settings.buffers, settings: { taste: { walk: 0.8 } } });
    const thing = step("pm_things").inserts[0].row;
    expect(thing).toMatchObject({ name: "High Force", kind: "walk", status: "ready", min_minutes: 90, max_minutes: 90, dog_rule: "yes", stars: { [PHIL]: 3, [KIRSTY]: 2 } });
    const drop = step("pm_drops").inserts[0].row;
    expect(drop).toMatchObject({ person_id: KIRSTY, client_id: `old:idea:${IDEA}`, source: "import", url: "https://example.com/high-force", received_at: "2026-09-01T10:00:00Z" });
    const p = step("pm_plans").inserts[0].row;
    expect(p).toMatchObject({ kind: "plan", status: "accepted", proposed_by: PHIL, thing_id: { $ref: "pm_things", old_id: IDEA } });
    expect(step("pm_plan_responses").inserts[0].row).toMatchObject({ person_id: KIRSTY, answer: "yes", at: "2026-11-20T18:00:00Z" });
    const legs = step("pm_plan_legs").inserts.map((l) => l.row);
    expect(legs.filter((l) => l.kind === "travel" && l.starts_at === "2026-11-29T09:05:00.000Z" && l.ends_at === "2026-11-29T10:00:00.000Z")).toHaveLength(2);
    expect(legs.filter((l) => l.starts_at === "2026-11-29T13:00:00.000Z" && l.ends_at === "2026-11-29T13:55:00.000Z")).toHaveLength(2);
    expect(step("pm_travel").inserts[0].row).toMatchObject({ mode: "drive", provider: "override", minutes: 55 });
  });

  it("queues research only for things without coordinates whose drop is new", () => {
    const p = payload();
    p.ideas[0].lat = null;
    p.ideas[0].lng = null;
    const plan = buildPlan({ payload: p, existing: seeded, me, now: NOW });
    expect(plan.steps.find((s) => s.table === "pm_things")!.inserts[0].row.status).toBe("researching");
    expect(plan.research).toEqual([IDEA]);
    const after = applyInMemory(plan, seeded);
    expect(buildPlan({ payload: p, existing: after, me, now: NOW }).research).toEqual([]);
  });

  it("is idempotent: the same payload against what it produced is all unchanged", () => {
    const first = buildPlan({ payload: payload(), existing: seeded, me, now: NOW });
    const after = applyInMemory(first, seeded);
    const second = buildPlan({ payload: payload(), existing: after, me, now: NOW });
    for (const step of second.steps) {
      expect({ table: step.table, inserts: step.inserts.length, updates: step.updates.length, deletes: step.deletes.length }).toEqual({ table: step.table, inserts: 0, updates: 0, deletes: 0 });
    }
    const s = summarise(second);
    expect(s.pm_blocks.unchanged).toBe(1);
    expect(s.pm_plan_legs.unchanged).toBe(4);
    expect(s.pm_travel.unchanged).toBe(1);
    expect(s.pm_people.unchanged).toBe(2);
  });

  it("updates a row the old app changed and leaves the rest", () => {
    const first = buildPlan({ payload: payload(), existing: seeded, me, now: NOW });
    const after = applyInMemory(first, seeded);
    const p = payload();
    p.blocks[0].end_at = "2026-11-23T18:00:00Z";
    const second = buildPlan({ payload: p, existing: after, me, now: NOW });
    const blocks = second.steps.find((s) => s.table === "pm_blocks")!;
    expect(blocks.updates).toHaveLength(1);
    expect(blocks.updates[0].row.ends_at).toBe("2026-11-23T18:00:00.000Z");
    expect(blocks.inserts).toHaveLength(0);
  });

  it("does not import the blocks of a member it cannot place", () => {
    const plan = buildPlan({ payload: payload({ blocks: [block({ id: "kb", user_id: KIRSTY_OLD })] }), existing: seeded, me: { ...me, others: [] }, now: NOW });
    const blocks = plan.steps.find((s) => s.table === "pm_blocks")!;
    expect(blocks.inserts).toHaveLength(0);
    expect(blocks.skipped).toEqual([{ old_id: "kb", reason: "member not mapped: Kirsty" }]);
  });
});
