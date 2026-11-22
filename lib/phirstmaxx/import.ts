/**
 * PhirstMaxx — the old app's data into pm_* (claude/phirstmaxx-spec.md §10).
 *
 * scripts/phirstmaxx-import.mjs reads the old Postgres and POSTs a payload
 * to /api/phirstmaxx/import; this module turns it into rows under RLS, as
 * the caller. Idempotent on the old row id: every pm_* table carries
 * `old_id`, so a second run with the same payload changes nothing, and the
 * nightly mirror (§10) is the same code. The dry run runs the same planner
 * against the rows already here and writes nothing.
 *
 * Mapping (old → new):
 *
 *   members              pm_people (rows exist from pm_seed_space; updated, never inserted)
 *                          email = caller's email → ctx.uid; any other email → the one other
 *                          pm_people row when there is exactly one; else unmapped (their blocks,
 *                          drops and plans are reported, not imported). Falls back to the old
 *                          app's own rule when the caller's email is unknown: green (#2E9E5B) is Phil.
 *                          settings.waking → waking, settings.buffers → buffers,
 *                          settings.taste → settings.taste, has_car, home_location_id → home_place_id
 *   locations            pm_places (label, address, lat, lng, kind, saved, person_id = created_by mapped)
 *   block_types          pm_block_types (name, engine_kind (missing → busy), colour, default_flexible →
 *                          default_firmness, sort_order → sort; seeds here are the new space's own)
 *   availability_blocks  pm_blocks, local = false; starts rounded DOWN and ends rounded UP to the half
 *                          hour; flexible → firmness; status ≠ confirmed skipped; a recurrence_rule is
 *                          expanded to concrete blocks for the next 12 weeks from today, old_id
 *                          "<id>:<yyyy-mm-dd>", series_id = the old id (a uuid)
 *   waking_overrides     pm_waking, one row per mapped person (the old row was shared), old_id "<id>:<person>"
 *   known_days           nothing (the new engine treats every day as known); counted
 *   pets                 pm_pets
 *   ideas                pm_things (title → name, category → kind, lat/lng, place_address → address,
 *                          duration_min → min/max minutes, dog_friendly → dog_rule, cost, tags, indoor,
 *                          best_time_of_day, seasons, stars_by → stars by mapped person, status ready when
 *                          it has coordinates else researching; archived stays archived; done → done_count 1)
 *                        + pm_thing_facts (image_url, opening_notes, place_name; source_kind import)
 *                        + one pm_drops (source import, client_id "old:idea:<id>", url, title/description,
 *                          received_at = created_at) pointing at the thing. Research is queued for things
 *                          with no coordinates, once, when their drop is first inserted.
 *   route_overrides      pm_travel (mode drive, provider override) where one end is a location that became
 *                          a pm_place and the other a "lat,lng" key matching an idea that became a thing
 *   plans                pm_plans (kind, title, times, status, proposed_by mapped or "engine", thing_id from
 *                          the first plan_item's idea, notes, score)
 *   plans (responded_*)  pm_plan_responses (accepted → yes, declined → no)
 *   plan_legs            pm_plan_legs: who a → the proposer, b → the other person, both → one per person;
 *                          kind home → home, everything else → travel; pickup/outbound chain back from the
 *                          plan start, return/dropoff/home chain on from the plan end (the old legs had no times)
 *   plan_items           only the first item's idea is used (thing_id); the snapshot titles are not kept
 *   expenses, budget_goals, contributions, memories, trips, astro_events, notifications
 *                        not imported in phase 1 (spec §3: their screens are phase 2); counted
 *
 * Undo removes everything that came from the old app and nothing made here:
 * rows with a non-null old_id (blocks only where local = false). Block types
 * still used by a local block are kept and reported.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { expandRecurrence } from "./engine/recurrence";
import { addLondonDays, londonDate, londonDayStart } from "./engine/time";
import type { PmCtx } from "./server";
import { startResearch } from "./server";
import { ENGINE_KINDS, type EngineKind } from "./types";

// ---------------------------------------------------------------------------
// The payload the script posts

export type OldMember = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string;
  colour: string;
  home_location_id: string | null;
  has_car: boolean;
  settings: Record<string, unknown>;
};
export type OldLocation = { id: string; label: string; address: string | null; lat: number | null; lng: number | null; kind: string; saved: boolean; created_by: string | null };
export type OldPet = { id: string; name: string; notes: string | null };
export type OldBlockType = { id: string; name: string; engine_kind: string | null; colour: string | null; sort_order: number; default_flexible: boolean };
export type OldBlock = {
  id: string;
  user_id: string;
  entered_by: string | null;
  start_at: string;
  end_at: string;
  block_type_id: string;
  kind: string | null;
  flexible: boolean;
  title: string | null;
  location_id: string | null;
  recurrence_rule: string | null;
  recurrence_exceptions: string[];
  status: string;
};
export type OldWaking = { id: string; day: string; day_end: string };
export type OldIdea = {
  id: string;
  created_by: string;
  title: string;
  url: string | null;
  image_url: string | null;
  description: string | null;
  place_name: string | null;
  place_address: string | null;
  lat: number | null;
  lng: number | null;
  category: string;
  tags: string[];
  cost_pence: number | null;
  duration_min: number | null;
  dog_friendly: string;
  indoor: boolean;
  best_time_of_day: string[];
  seasons: string[];
  opening_notes: string | null;
  status: string;
  stars_by: Record<string, number>;
  created_at: string;
};
export type OldRoute = { id: string; from_key: string; to_key: string; minutes: number; updated_at: string };
export type OldPlan = {
  id: string;
  kind: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  proposed_by: string;
  responded_by: string | null;
  responded_at: string | null;
  notes: string | null;
  score: Record<string, unknown>;
};
export type OldPlanItem = { id: string; plan_id: string; idea_id: string | null; position: number };
export type OldPlanLeg = { id: string; plan_id: string; position: number; kind: string; who: string; from_label: string; to_label: string; minutes: number };

export type ImportPayload = {
  exported_at: string;
  members: OldMember[];
  locations: OldLocation[];
  pets: OldPet[];
  block_types: OldBlockType[];
  blocks: OldBlock[];
  known_days_count: number;
  waking_overrides: OldWaking[];
  ideas: OldIdea[];
  route_overrides: OldRoute[];
  plans: OldPlan[];
  plan_items: OldPlanItem[];
  plan_legs: OldPlanLeg[];
  /** Row counts of the tables that stay in the old database for now. */
  phase2: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Pure pieces

export const HALF_HOUR_MS = 30 * 60 * 1000;
export const EXPAND_WEEKS = 12;
/** The old app's own rule: Phil is whoever wears green (decision 2026-09-02). */
export const PHIL_GREEN = "#2e9e5b";

/** Start down, end up to the half hour (pm_blocks_half_hour). */
export function roundOutHalfHour(startIso: string, endIso: string): { starts_at: string; ends_at: string } {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  const starts = Math.floor(s / HALF_HOUR_MS) * HALF_HOUR_MS;
  let ends = Math.ceil(e / HALF_HOUR_MS) * HALF_HOUR_MS;
  if (ends <= starts) ends = starts + HALF_HOUR_MS;
  return { starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString() };
}

export type MemberMap = {
  /** old auth user id → Mycelium user id */
  byOldUser: Map<string, string>;
  /** old members that did not map, with why */
  unmapped: Array<{ display_name: string; reason: string }>;
  /** how each old member was placed, for the report */
  report: Array<{ display_name: string; mapped_to: "me" | "other" | null }>;
};

export type MemberMapInput = {
  /** The caller. */
  uid: string;
  /** The caller's email when the route can learn it; lower-cased. */
  email: string | null;
  /** Every other pm_people person id in the space. */
  others: string[];
};

export function mapMembers(members: OldMember[], me: MemberMapInput): MemberMap {
  const byOldUser = new Map<string, string>();
  const unmapped: MemberMap["unmapped"] = [];
  const report: MemberMap["report"] = [];
  const myEmail = me.email?.trim().toLowerCase() ?? null;
  let mine: OldMember | undefined = myEmail ? members.find((m) => (m.email ?? "").trim().toLowerCase() === myEmail) : undefined;
  if (!mine) mine = members.find((m) => m.colour.trim().toLowerCase() === PHIL_GREEN);
  if (!mine && members.length === 1) mine = members[0];
  for (const m of members) {
    if (m === mine) {
      byOldUser.set(m.user_id, me.uid);
      report.push({ display_name: m.display_name, mapped_to: "me" });
    } else if (me.others.length === 1) {
      byOldUser.set(m.user_id, me.others[0]);
      report.push({ display_name: m.display_name, mapped_to: "other" });
    } else {
      const reason = me.others.length === 0 ? "nobody else is in the PhirstMaxx space yet" : `${me.others.length} other people are in the space; which one is this?`;
      unmapped.push({ display_name: m.display_name, reason });
      report.push({ display_name: m.display_name, mapped_to: null });
    }
  }
  return { byOldUser, unmapped, report };
}

/** The twelve-week window the recurring blocks are expanded into: today (London) to today + 12 weeks. */
export function expansionRange(now: Date | number = Date.now()): { start: number; end: number } {
  const today = londonDate(now);
  return { start: londonDayStart(today), end: londonDayStart(addLondonDays(today, EXPAND_WEEKS * 7)) };
}

/** A recurring block → its concrete half-hour-aligned instances for the window; a one-off → itself. */
export function expandBlock(b: OldBlock, now: Date | number = Date.now()): Array<{ old_id: string; starts_at: string; ends_at: string; series_id: string | null }> {
  const rounded = roundOutHalfHour(b.start_at, b.end_at);
  if (!b.recurrence_rule) return [{ old_id: b.id, ...rounded, series_id: null }];
  const occ = expandRecurrence({ start: Date.parse(rounded.starts_at), end: Date.parse(rounded.ends_at), rule: b.recurrence_rule, exceptions: b.recurrence_exceptions ?? [] }, expansionRange(now));
  return occ.map((o) => {
    // the wall-clock anchor may land off the half hour after a clock change; round again
    const r = roundOutHalfHour(new Date(o.start).toISOString(), new Date(o.end).toISOString());
    return { old_id: `${b.id}:${londonDate(o.start)}`, ...r, series_id: b.id };
  });
}

function engineKind(v: string | null | undefined): EngineKind {
  return (ENGINE_KINDS as readonly string[]).includes(v ?? "") ? (v as EngineKind) : "busy";
}

const PLAN_STATUS = new Set(["proposed", "accepted", "declined", "expired", "done", "cancelled"]);
const DOG_RULE = new Set(["yes", "no", "outside_only", "unknown"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The old route-override key for a pinned place: "lat,lng" to three decimals. */
export function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// The plan

/** A column whose value is another imported row, named by table and old id; resolved to an id at write time. */
export type Ref = { $ref: Table; old_id: string };
export const isRef = (v: unknown): v is Ref => !!v && typeof v === "object" && "$ref" in (v as Record<string, unknown>);

export type Table = "pm_people" | "pm_places" | "pm_block_types" | "pm_blocks" | "pm_waking" | "pm_pets" | "pm_things" | "pm_thing_facts" | "pm_drops" | "pm_plans" | "pm_plan_responses" | "pm_plan_legs" | "pm_travel";
export const TABLES: Table[] = ["pm_people", "pm_places", "pm_block_types", "pm_blocks", "pm_waking", "pm_pets", "pm_things", "pm_thing_facts", "pm_drops", "pm_plans", "pm_plan_responses", "pm_plan_legs", "pm_travel"];

export type Row = Record<string, unknown>;
export type ExistingRow = Row & { id: string };
/** What is already in the space, keyed by table; rows carry their id and, where the table has one, old_id. */
export type Existing = Partial<Record<Table, ExistingRow[]>>;

export type Desired = { key: string; row: Row };
export type Skipped = { old_id: string; reason: string };
export type TableStep = {
  table: Table;
  inserts: Desired[];
  updates: Array<{ id: string; key: string; row: Row }>;
  unchanged: number;
  skipped: Skipped[];
  /** Rows no longer wanted (legs of a plan whose leg set changed). */
  deletes: string[];
};
export type Plan = {
  steps: TableStep[];
  members: MemberMap["report"];
  unmapped: MemberMap["unmapped"];
  known_days: number;
  phase2: Record<string, number>;
  /** old idea ids whose things have no coordinates and whose drop is new: research is queued for these */
  research: string[];
};

const TIME_COLS = new Set(["starts_at", "ends_at", "received_at", "at", "fetched_at"]);

function norm(v: unknown, col: string): string {
  if (v === undefined || v === null || v === "") return "null";
  if (TIME_COLS.has(col) && typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return JSON.stringify(sortKeys(v));
  return String(v);
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => ((acc[k] = sortKeys(o[k])), acc), {});
  }
  return v;
}

/** Resolve the refs in a row against id maps; a ref to a row not yet here resolves to undefined. */
export function resolveRow(row: Row, ids: Map<Table, Map<string, string>>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = isRef(v) ? ids.get(v.$ref)?.get(v.old_id) : v;
  return out;
}

function idMaps(existing: Existing): Map<Table, Map<string, string>> {
  const ids = new Map<Table, Map<string, string>>();
  for (const t of TABLES) {
    const m = new Map<string, string>();
    for (const r of existing[t] ?? []) if (typeof r.old_id === "string") m.set(r.old_id, r.id);
    ids.set(t, m);
  }
  return ids;
}

/** Diff desired rows against existing ones with the same key; refs are compared through the id maps. */
function diffStep(table: Table, desired: Desired[], existingRows: ExistingRow[], keyOf: (r: ExistingRow) => string | null, ids: Map<Table, Map<string, string>>, skipped: Skipped[] = []): TableStep {
  const byKey = new Map<string, ExistingRow>();
  for (const r of existingRows) {
    const k = keyOf(r);
    if (k) byKey.set(k, r);
  }
  const step: TableStep = { table, inserts: [], updates: [], unchanged: 0, skipped, deletes: [] };
  for (const d of desired) {
    const cur = byKey.get(d.key);
    if (!cur) {
      step.inserts.push(d);
      continue;
    }
    const resolved = resolveRow(d.row, ids);
    const changed = Object.keys(resolved).some((col) => norm(resolved[col], col) !== norm(cur[col], col));
    if (changed) step.updates.push({ id: cur.id, key: d.key, row: d.row });
    else step.unchanged++;
  }
  return step;
}

const oldKey = (r: ExistingRow) => (typeof r.old_id === "string" ? r.old_id : null);

export type PlanInput = {
  payload: ImportPayload;
  existing: Existing;
  me: MemberMapInput;
  now?: Date | number;
};

/** The whole import as a plan: what to insert, update, leave and skip, per table. Pure. */
export function buildPlan({ payload, existing, me, now = Date.now() }: PlanInput): Plan {
  const ids = idMaps(existing);
  const members = mapMembers(payload.members, me);
  const person = (oldUser: string | null | undefined) => (oldUser ? (members.byOldUser.get(oldUser) ?? null) : null);
  const nameOf = (oldUser: string) => payload.members.find((m) => m.user_id === oldUser)?.display_name ?? oldUser.slice(0, 8);
  const steps: TableStep[] = [];

  // pm_places
  const locationIds = new Set(payload.locations.map((l) => l.id));
  steps.push(
    diffStep(
      "pm_places",
      payload.locations.map((l) => ({
        key: l.id,
        row: {
          label: l.label,
          address: l.address,
          lat: l.lat,
          lng: l.lng,
          kind: ["home", "work", "other"].includes(l.kind) ? l.kind : /home/i.test(l.label) ? "home" : /work|office/i.test(l.label) ? "work" : "other",
          saved: l.saved !== false,
          person_id: person(l.created_by),
          old_id: l.id,
        },
      })),
      existing.pm_places ?? [],
      oldKey,
      ids,
    ),
  );

  // pm_block_types
  const typeIds = new Set(payload.block_types.map((t) => t.id));
  steps.push(
    diffStep(
      "pm_block_types",
      payload.block_types.map((t) => ({
        key: t.id,
        row: { name: t.name, engine_kind: engineKind(t.engine_kind), colour: t.colour, default_firmness: t.default_flexible ? "flexible" : "firm", sort: t.sort_order ?? 0, old_id: t.id },
      })),
      existing.pm_block_types ?? [],
      oldKey,
      ids,
    ),
  );

  // pm_people: updates to the rows pm_seed_space made
  {
    const desired: Desired[] = [];
    const skipped: Skipped[] = [];
    for (const m of payload.members) {
      const pid = person(m.user_id);
      if (!pid) {
        skipped.push({ old_id: m.id, reason: `${m.display_name}: ${members.unmapped.find((u) => u.display_name === m.display_name)?.reason ?? "not mapped"}` });
        continue;
      }
      const s = m.settings ?? {};
      const row: Row = { has_car: !!m.has_car, old_id: m.id };
      if (s.waking && typeof s.waking === "object") row.waking = s.waking;
      if (s.buffers && typeof s.buffers === "object") row.buffers = s.buffers;
      if (m.home_location_id && locationIds.has(m.home_location_id)) row.home_place_id = { $ref: "pm_places", old_id: m.home_location_id } satisfies Ref;
      const cur = (existing.pm_people ?? []).find((p) => p.person_id === pid);
      const curSettings = (cur?.settings as Record<string, unknown> | undefined) ?? {};
      if (s.taste && typeof s.taste === "object") row.settings = { ...curSettings, taste: s.taste };
      desired.push({ key: pid, row });
    }
    steps.push(diffStep("pm_people", desired, existing.pm_people ?? [], (r) => (typeof r.person_id === "string" ? r.person_id : null), ids, skipped));
  }

  // pm_blocks
  {
    const desired: Desired[] = [];
    const skipped: Skipped[] = [];
    const typeKind = new Map(payload.block_types.map((t) => [t.id, engineKind(t.engine_kind)]));
    for (const b of payload.blocks) {
      if (b.status !== "confirmed") {
        skipped.push({ old_id: b.id, reason: `status ${b.status}` });
        continue;
      }
      const pid = person(b.user_id);
      if (!pid) {
        skipped.push({ old_id: b.id, reason: `member not mapped: ${nameOf(b.user_id)}` });
        continue;
      }
      if (!typeIds.has(b.block_type_id)) {
        skipped.push({ old_id: b.id, reason: "block type not in the payload" });
        continue;
      }
      if (Number.isNaN(Date.parse(b.start_at)) || Number.isNaN(Date.parse(b.end_at)) || Date.parse(b.end_at) <= Date.parse(b.start_at)) {
        skipped.push({ old_id: b.id, reason: "ends before it starts" });
        continue;
      }
      for (const inst of expandBlock(b, now)) {
        desired.push({
          key: inst.old_id,
          row: {
            person_id: pid,
            entered_by: person(b.entered_by) ?? pid,
            type_id: { $ref: "pm_block_types", old_id: b.block_type_id } satisfies Ref,
            engine_kind: typeKind.get(b.block_type_id) ?? engineKind(b.kind),
            starts_at: inst.starts_at,
            ends_at: inst.ends_at,
            firmness: b.flexible ? "flexible" : "firm",
            place_id: b.location_id && locationIds.has(b.location_id) ? ({ $ref: "pm_places", old_id: b.location_id } satisfies Ref) : null,
            title: b.title?.trim() || null,
            series_id: inst.series_id,
            local: false,
            old_id: inst.old_id,
          },
        });
      }
    }
    steps.push(diffStep("pm_blocks", desired, existing.pm_blocks ?? [], oldKey, ids, skipped));
  }

  // pm_waking: the old row was the couple's; one per mapped person here
  {
    const desired: Desired[] = [];
    const people = [...new Set(members.byOldUser.values())];
    for (const w of payload.waking_overrides) {
      for (const pid of people) {
        const key = `${w.id}:${pid}`;
        desired.push({ key, row: { person_id: pid, day: w.day, day_end: w.day_end, old_id: key } });
      }
    }
    steps.push(diffStep("pm_waking", desired, existing.pm_waking ?? [], oldKey, ids));
  }

  // pm_pets
  steps.push(
    diffStep(
      "pm_pets",
      payload.pets.map((p) => ({ key: p.id, row: { name: p.name, kind: "dog", notes: p.notes, old_id: p.id } })),
      existing.pm_pets ?? [],
      oldKey,
      ids,
    ),
  );

  // pm_things + facts + drops
  const research: string[] = [];
  {
    const things: Desired[] = [];
    const facts: Desired[] = [];
    const drops: Desired[] = [];
    const dropSkipped: Skipped[] = [];
    const existingDrops = new Map((existing.pm_drops ?? []).map((d) => [d.old_id as string, d]));
    for (const i of payload.ideas) {
      const pinned = typeof i.lat === "number" && typeof i.lng === "number";
      const stars: Record<string, number> = {};
      for (const [oldUser, n] of Object.entries(i.stars_by ?? {})) {
        const pid = person(oldUser);
        if (pid && typeof n === "number") stars[pid] = Math.max(0, Math.min(3, Math.round(n)));
      }
      things.push({
        key: i.id,
        row: {
          name: i.title,
          kind: i.category ?? null,
          lat: pinned ? i.lat : null,
          lng: pinned ? i.lng : null,
          address: i.place_address,
          status: i.status === "archived" ? "archived" : pinned ? "ready" : "researching",
          min_minutes: i.duration_min,
          max_minutes: i.duration_min,
          indoor: !!i.indoor,
          dog_rule: DOG_RULE.has(i.dog_friendly) ? i.dog_friendly : "unknown",
          cost_pence: i.cost_pence,
          summary: i.description,
          tags: i.tags ?? [],
          best_time_of_day: i.best_time_of_day ?? [],
          seasons: i.seasons ?? [],
          stars,
          done_count: i.status === "done" ? 1 : 0,
          old_id: i.id,
        },
      });
      const factOf = (key: string, value: unknown) => {
        if (value === null || value === undefined || value === "") return;
        facts.push({ key: `${i.id}:${key}`, row: { thing_id: { $ref: "pm_things", old_id: i.id } satisfies Ref, key, value, source_url: i.url, source_kind: "import", confidence: 0.6 } });
      };
      factOf("image_url", i.image_url);
      factOf("opening_notes", i.opening_notes);
      factOf("place_name", i.place_name);

      const pid = person(i.created_by) ?? me.uid;
      const text = [i.title, i.description].filter((s) => s && s.trim()).join("\n") || null;
      if (!i.url && !text) {
        dropSkipped.push({ old_id: i.id, reason: "no link and no words" });
      } else {
        drops.push({
          key: i.id,
          row: {
            person_id: pid,
            client_id: `old:idea:${i.id}`,
            source: "import",
            url: i.url,
            text,
            media_paths: [],
            received_at: i.created_at,
            thing_id: { $ref: "pm_things", old_id: i.id } satisfies Ref,
            old_id: i.id,
          },
        });
        if (!pinned && i.status !== "archived" && !existingDrops.has(i.id)) research.push(i.id);
      }
    }
    steps.push(diffStep("pm_things", things, existing.pm_things ?? [], oldKey, ids));
    const factKey = (r: ExistingRow) => {
      const t = (existing.pm_things ?? []).find((x) => x.id === r.thing_id);
      return t && typeof t.old_id === "string" && r.source_kind === "import" ? `${t.old_id}:${r.key}` : null;
    };
    steps.push(diffStep("pm_thing_facts", facts, existing.pm_thing_facts ?? [], factKey, ids));
    steps.push(diffStep("pm_drops", drops, existing.pm_drops ?? [], oldKey, ids, dropSkipped));
  }

  // pm_plans, responses, legs
  {
    const plans: Desired[] = [];
    const responses: Desired[] = [];
    const skipped: Skipped[] = [];
    const ideaIds = new Set(payload.ideas.map((i) => i.id));
    const firstItem = new Map<string, OldPlanItem>();
    for (const it of [...payload.plan_items].sort((a, b) => a.position - b.position)) if (!firstItem.has(it.plan_id)) firstItem.set(it.plan_id, it);
    const legsByPlan = new Map<string, OldPlanLeg[]>();
    for (const l of payload.plan_legs) legsByPlan.set(l.plan_id, [...(legsByPlan.get(l.plan_id) ?? []), l]);
    const legDesired: Desired[] = [];
    const legSets = new Map<string, Row[]>();

    for (const p of payload.plans) {
      if (Number.isNaN(Date.parse(p.start_at)) || Date.parse(p.end_at) <= Date.parse(p.start_at)) {
        skipped.push({ old_id: p.id, reason: "ends before it starts" });
        continue;
      }
      const proposer = person(p.proposed_by);
      const item = firstItem.get(p.id);
      const thingRef = item?.idea_id && ideaIds.has(item.idea_id) ? ({ $ref: "pm_things", old_id: item.idea_id } satisfies Ref) : null;
      plans.push({
        key: p.id,
        row: {
          kind: p.kind === "hold" ? "hold" : "plan",
          thing_id: thingRef,
          title: p.title,
          starts_at: p.start_at,
          ends_at: p.end_at,
          status: PLAN_STATUS.has(p.status) ? p.status : "proposed",
          proposed_by: proposer ?? "engine",
          notes: p.notes,
          score: p.score && Object.keys(p.score).length ? p.score : null,
          old_id: p.id,
        },
      });
      const responder = person(p.responded_by);
      if (responder && (p.status === "accepted" || p.status === "declined")) {
        responses.push({
          key: `${p.id}:${responder}`,
          row: { plan_id: { $ref: "pm_plans", old_id: p.id } satisfies Ref, person_id: responder, answer: p.status === "accepted" ? "yes" : "no", at: p.responded_at ?? p.start_at },
        });
      }

      // legs: the old ones had no times; chain them around the plan window
      const other = [...new Set(members.byOldUser.values())].find((id) => id !== proposer) ?? null;
      const who = (w: string): string[] => (w === "a" ? (proposer ? [proposer] : []) : w === "b" ? (other ? [other] : []) : [proposer, other].filter((x): x is string => !!x));
      const old = [...(legsByPlan.get(p.id) ?? [])].sort((a, b) => a.position - b.position);
      const pre = old.filter((l) => l.kind === "pickup" || l.kind === "outbound");
      const post = old.filter((l) => !(l.kind === "pickup" || l.kind === "outbound"));
      const rows: Row[] = [];
      let cursor = Date.parse(p.start_at);
      for (const l of [...pre].reverse()) {
        const end = cursor;
        cursor = end - l.minutes * 60_000;
        for (const pid of who(l.who)) rows.push(legRow(p.id, pid, l, cursor, end));
      }
      cursor = Date.parse(p.end_at);
      for (const l of post) {
        const start = cursor;
        cursor = start + l.minutes * 60_000;
        for (const pid of who(l.who)) rows.push(legRow(p.id, pid, l, start, cursor));
      }
      if (rows.length) legSets.set(p.id, rows);
    }
    steps.push(diffStep("pm_plans", plans, existing.pm_plans ?? [], oldKey, ids, skipped));
    steps.push(
      diffStep(
        "pm_plan_responses",
        responses,
        existing.pm_plan_responses ?? [],
        (r) => {
          const pl = (existing.pm_plans ?? []).find((x) => x.id === r.plan_id);
          return pl && typeof pl.old_id === "string" ? `${pl.old_id}:${r.person_id}` : null;
        },
        ids,
      ),
    );

    // legs have no old_id: a plan's leg set is replaced whole when it differs
    const legStep: TableStep = { table: "pm_plan_legs", inserts: [], updates: [], unchanged: 0, skipped: [], deletes: [] };
    const planIdByOld = ids.get("pm_plans")!;
    for (const [planOld, rows] of legSets) {
      const planId = planIdByOld.get(planOld);
      const current = planId ? (existing.pm_plan_legs ?? []).filter((l) => l.plan_id === planId) : [];
      const cols = Object.keys(rows[0]).filter((k) => k !== "plan_id").sort();
      const fingerprint = (r: Row) => cols.map((k) => norm(r[k], k)).join("|");
      const want = rows.map((r) => fingerprint(resolveRow(r, ids))).sort();
      const have = current.map((l) => fingerprint(l)).sort();
      if (planId && want.length === have.length && want.every((w, i) => w === have[i])) {
        legStep.unchanged += rows.length;
        continue;
      }
      legStep.deletes.push(...current.map((l) => l.id));
      for (const r of rows) legDesired.push({ key: planOld, row: r });
    }
    legStep.inserts = legDesired;
    steps.push(legStep);
  }

  // pm_travel from route overrides
  {
    const desired: Desired[] = [];
    const skipped: Skipped[] = [];
    const thingByCoord = new Map<string, string>();
    for (const i of payload.ideas) if (typeof i.lat === "number" && typeof i.lng === "number") thingByCoord.set(coordKey(i.lat, i.lng), i.id);
    for (const r of payload.route_overrides) {
      const ends = [r.from_key, r.to_key].map((k) => (UUID_RE.test(k) && locationIds.has(k) ? { place: k } : thingByCoord.has(k) ? { thing: thingByCoord.get(k)! } : null));
      const place = ends.find((e) => e && "place" in e) as { place: string } | undefined;
      const thing = ends.find((e) => e && "thing" in e) as { thing: string } | undefined;
      if (!place || !thing) {
        skipped.push({ old_id: r.id, reason: `${r.from_key} → ${r.to_key}: needs one saved place and one pinned idea` });
        continue;
      }
      desired.push({
        key: `${thing.thing}:${place.place}`,
        row: { thing_id: { $ref: "pm_things", old_id: thing.thing } satisfies Ref, origin_place_id: { $ref: "pm_places", old_id: place.place } satisfies Ref, mode: "drive", minutes: Math.max(0, Math.round(r.minutes)), km: null, provider: "override", fetched_at: r.updated_at },
      });
    }
    const travelKey = (t: ExistingRow) => {
      if (t.provider !== "override" || t.mode !== "drive") return null;
      const th = (existing.pm_things ?? []).find((x) => x.id === t.thing_id);
      const pl = (existing.pm_places ?? []).find((x) => x.id === t.origin_place_id);
      return th && pl && typeof th.old_id === "string" && typeof pl.old_id === "string" ? `${th.old_id}:${pl.old_id}` : null;
    };
    steps.push(diffStep("pm_travel", desired, existing.pm_travel ?? [], travelKey, ids, skipped));
  }

  return { steps, members: members.report, unmapped: members.unmapped, known_days: payload.known_days_count ?? 0, phase2: payload.phase2 ?? {}, research };
}

function legRow(planOld: string, pid: string, l: OldPlanLeg, start: number, end: number): Row {
  return {
    plan_id: { $ref: "pm_plans", old_id: planOld } satisfies Ref,
    person_id: pid,
    position: l.position,
    kind: l.kind === "home" ? "home" : "travel",
    from_label: l.from_label || null,
    to_label: l.to_label || null,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
    minutes: Math.max(0, Math.round(l.minutes)),
    mode: "drive",
    provider: "estimate",
  };
}

export type TableCounts = { inserted: number; updated: number; unchanged: number; skipped: Skipped[] };

export function summarise(plan: Plan): Record<string, TableCounts> {
  const out: Record<string, TableCounts> = {};
  for (const s of plan.steps) out[s.table] = { inserted: s.inserts.length, updated: s.updates.length, unchanged: s.unchanged, skipped: s.skipped };
  return out;
}

// ---------------------------------------------------------------------------
// Reading what is here, writing the plan

const COLS: Record<Table, string> = {
  pm_people: "id, person_id, old_id, waking, buffers, settings, has_car, home_place_id",
  pm_places: "id, old_id, label, address, lat, lng, kind, saved, person_id",
  pm_block_types: "id, old_id, name, engine_kind, colour, default_firmness, sort",
  pm_blocks: "id, old_id, person_id, entered_by, type_id, engine_kind, starts_at, ends_at, firmness, place_id, title, series_id, local",
  pm_waking: "id, old_id, person_id, day, day_end",
  pm_pets: "id, old_id, name, kind, notes",
  pm_things: "id, old_id, name, kind, lat, lng, address, status, min_minutes, max_minutes, indoor, dog_rule, cost_pence, summary, tags, best_time_of_day, seasons, stars, done_count",
  pm_thing_facts: "id, thing_id, key, value, source_url, source_kind, confidence",
  pm_drops: "id, old_id, person_id, client_id, source, url, text, media_paths, received_at, thing_id",
  pm_plans: "id, old_id, kind, thing_id, title, starts_at, ends_at, status, proposed_by, notes, score",
  pm_plan_responses: "id, plan_id, person_id, answer, at",
  pm_plan_legs: "id, plan_id, person_id, position, kind, from_label, to_label, starts_at, ends_at, minutes, mode, provider",
  pm_travel: "id, thing_id, origin_place_id, mode, minutes, km, provider, fetched_at",
};

/** Everything imported so far (old_id set), plus the children of imported things and plans. */
export async function loadExisting(db: SupabaseClient, spaceId: string): Promise<Existing> {
  const out: Existing = {};
  const base = (t: Table) => db.from(t).select(COLS[t]).eq("space_id", spaceId);
  type Q = ReturnType<typeof base>;
  const get = async (t: Table, q: Q) => {
    const { data, error } = await q;
    if (error) throw new Error(`${t}: ${error.message}`);
    out[t] = (data ?? []) as unknown as ExistingRow[];
  };
  await get("pm_people", base("pm_people"));
  for (const t of ["pm_places", "pm_block_types", "pm_blocks", "pm_waking", "pm_pets", "pm_things", "pm_drops", "pm_plans"] as Table[]) await get(t, base(t).not("old_id", "is", null));
  const thingIds = (out.pm_things ?? []).map((r) => r.id);
  const planIds = (out.pm_plans ?? []).map((r) => r.id);
  if (thingIds.length) {
    await get("pm_thing_facts", base("pm_thing_facts").in("thing_id", thingIds).eq("source_kind", "import"));
    await get("pm_travel", base("pm_travel").in("thing_id", thingIds).eq("provider", "override"));
  }
  if (planIds.length) {
    await get("pm_plan_responses", base("pm_plan_responses").in("plan_id", planIds));
    await get("pm_plan_legs", base("pm_plan_legs").in("plan_id", planIds));
  }
  return out;
}

export type ApplyResult = {
  dry_run: boolean;
  undo: boolean;
  tables: Record<string, TableCounts>;
  members: MemberMap["report"];
  unmapped: MemberMap["unmapped"];
  known_days: number;
  phase2: Record<string, number>;
  research_queued: number;
  errors: Array<{ table: string; key: string; error: string }>;
};

/** The caller's email, when the client can tell us (a session or a minted JWT that GoTrue recognises). */
export async function callerEmail(db: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await db.auth.getUser();
    return data.user?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Plan and, unless dryRun, write. Rows are written table by table in
 * dependency order so children can take their parents' new ids; a row that
 * fails is reported and the rest carries on (the next run picks it up —
 * the planner only sees what landed).
 */
export async function applyImport(db: SupabaseClient, ctx: PmCtx, payload: ImportPayload, opts: { dryRun: boolean; undo?: boolean; email?: string | null }): Promise<ApplyResult> {
  if (opts.undo) return undoImport(db, ctx, opts.dryRun);
  const existing = await loadExisting(db, ctx.spaceId);
  const me: MemberMapInput = { uid: ctx.uid, email: opts.email ?? null, others: ctx.people.filter((p) => p.person_id !== ctx.uid).map((p) => p.person_id) };
  const plan = buildPlan({ payload, existing, me });
  const result: ApplyResult = { dry_run: opts.dryRun, undo: false, tables: summarise(plan), members: plan.members, unmapped: plan.unmapped, known_days: plan.known_days, phase2: plan.phase2, research_queued: 0, errors: [] };
  if (opts.dryRun) {
    result.research_queued = plan.research.length;
    return result;
  }

  const ids = idMaps(existing);
  const insertedDrops = new Map<string, string>();
  for (const step of plan.steps) {
    const map = ids.get(step.table)!;
    if (step.deletes.length) {
      const { error } = await db.from(step.table).delete().in("id", step.deletes);
      if (error) result.errors.push({ table: step.table, key: "*", error: error.message });
    }
    for (const u of step.updates) {
      const row = resolveRow(u.row, ids);
      const { error } = await db.from(step.table).update(step.table === "pm_drops" ? { thing_id: row.thing_id, old_id: row.old_id } : row).eq("id", u.id);
      if (error) {
        result.errors.push({ table: step.table, key: u.key, error: error.message });
        result.tables[step.table].updated--;
      }
    }
    for (const d of step.inserts) {
      const row = resolveRow(d.row, ids);
      const missing = Object.entries(d.row).find(([k, v]) => isRef(v) && row[k] === undefined);
      if (missing) {
        result.errors.push({ table: step.table, key: d.key, error: `${missing[0]} refers to a row that did not land` });
        result.tables[step.table].inserted--;
        continue;
      }
      const { data, error } = await db
        .from(step.table)
        .insert({ ...row, space_id: ctx.spaceId, created_by: ctx.uid })
        .select("id")
        .single();
      if (error) {
        result.errors.push({ table: step.table, key: d.key, error: error.message });
        result.tables[step.table].inserted--;
        continue;
      }
      const id = (data as { id: string }).id;
      if (typeof row.old_id === "string") map.set(row.old_id, id);
      if (step.table === "pm_drops") insertedDrops.set(d.key, id);
    }
  }

  for (const ideaOld of plan.research) {
    const dropId = insertedDrops.get(ideaOld);
    if (!dropId) continue;
    try {
      await startResearch(db, ctx.spaceId, dropId);
      result.research_queued++;
    } catch (e) {
      result.errors.push({ table: "jobs", key: ideaOld, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}

const UNDO_ORDER: Table[] = ["pm_plans", "pm_drops", "pm_things", "pm_blocks", "pm_waking", "pm_pets", "pm_places", "pm_block_types"];

/** Remove what the import brought: rows with an old_id (blocks only where local = false). Local rows survive (spec §10). */
export async function undoImport(db: SupabaseClient, ctx: PmCtx, dryRun: boolean): Promise<ApplyResult> {
  const result: ApplyResult = { dry_run: dryRun, undo: true, tables: {}, members: [], unmapped: [], known_days: 0, phase2: {}, research_queued: 0, errors: [] };
  for (const t of UNDO_ORDER) {
    let q = db.from(t).select("id").eq("space_id", ctx.spaceId).not("old_id", "is", null);
    if (t === "pm_blocks") q = q.eq("local", false);
    const { data, error } = await q;
    if (error) {
      result.errors.push({ table: t, key: "*", error: error.message });
      continue;
    }
    const rows = (data ?? []) as Array<{ id: string }>;
    const counts: TableCounts = { inserted: 0, updated: 0, unchanged: 0, skipped: [] };
    // "updated" stands for removed here
    if (!dryRun && rows.length) {
      for (const r of rows) {
        const del = await db.from(t).delete().eq("id", r.id);
        if (del.error) {
          // a block type a local block still uses stays (restrict); say so
          counts.skipped.push({ old_id: r.id, reason: del.error.code === "23503" ? "still used by a local row; kept" : del.error.message });
        } else counts.updated++;
      }
    } else counts.updated = rows.length;
    result.tables[t] = counts;
  }
  // people: the rows stay (they are the space's members); the import's mark comes off
  const people = await db.from("pm_people").select("id").eq("space_id", ctx.spaceId).not("old_id", "is", null);
  const n = (people.data ?? []).length;
  if (!dryRun && n) await db.from("pm_people").update({ old_id: null }).eq("space_id", ctx.spaceId).not("old_id", "is", null);
  result.tables.pm_people = { inserted: 0, updated: n, unchanged: 0, skipped: [] };
  return result;
}
