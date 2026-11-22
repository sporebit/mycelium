/**
 * PhirstMaxx — the engine fed from the database (spec §6 step 5).
 *
 * The engine (lib/phirstmaxx/engine) is pure; this is the one place that
 * reads pm_people, pm_blocks, pm_waking, pm_places, pm_pets, pm_things,
 * pm_thing_facts and pm_travel and hands the engine its inputs. Three
 * questions are answered:
 *
 *   windowsFor       when is everyone free and awake in a range
 *   fitsForThing     for one thing, does it fit each window in the next
 *                    eight weeks, and which is the next that does
 *   thingsForWindow  for one window, which ready things fit, best first
 *
 * Family appointments are busy time for everyone (spec §4), read through
 * the adapter. Travel comes from pm_travel (Google, OpenRouteService), and
 * where no row exists yet from the straight-line estimate, which says so in
 * its provider. Nothing here is stored: it is recomputed whenever blocks,
 * facts or travel change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { familyBusyEvents } from "./adapter";
import {
  distanceKm,
  type EngineThing,
  type EngineWindow,
  findWindows,
  type FitPerson,
  type FitThing,
  fitThing,
  londonDate,
  nextFit,
  type OpeningHours,
  type ScoreContext,
  scoreCandidate,
  type Season,
  type TimeOfDay,
  type TravelLookup,
  travelMinutes,
  type WeekdayKey,
  type WindowPersonInput,
} from "./engine";
import type { WeeklyHours } from "./research/readers/hours";
import { PEOPLE_COLS, PLACE_COLS } from "./server";
import type { EngineBlock, FitResult, PmPerson, PmPlace, PmThing, TogetherWindow, TravelMode, TravelProvider } from "./types";

export const FIT_WEEKS = 8;
export const THING_COLS = "id, name, kind, lat, lng, address, status, min_minutes, max_minutes, indoor, dog_rule, cost_pence, image_path, summary, tags, best_time_of_day, seasons, stars, hand_edited, done_count, last_researched_at, next_recheck_at, created_at, updated_at, old_id";

/** A pm_things row in full: PmThing plus the columns the engine's scoring reads. */
export type ThingRow = PmThing & {
  tags: string[];
  best_time_of_day: string[];
  seasons: string[];
  stars: Record<string, number>;
  hand_edited: string[];
  last_researched_at: string | null;
  next_recheck_at: string | null;
};

type PersonRow = { person_id: string; name: string; has_car: boolean; waking: PmPerson["waking"]; buffers: PmPerson["buffers"]; home_place_id: string | null };
type BlockRow = { person_id: string; engine_kind: EngineBlock["kind"]; firmness: EngineBlock["firmness"]; starts_at: string; ends_at: string; place_id: string | null };

export type FitContext = {
  range: { start: number; end: number };
  people: PersonRow[];
  places: PmPlace[];
  /** Every person's engine blocks in the range, family appointments included. */
  blocks: Record<string, EngineBlock[]>;
  dayOverrides: Record<string, string>;
  hasPet: boolean;
  windows: EngineWindow[];
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Everything the engine needs for a range, read once. */
export async function loadFitContext(db: SupabaseClient, spaceId: string, range: { start: number; end: number }): Promise<FitContext> {
  const [people, places, blocks, waking, pets, family] = await Promise.all([
    db.from("pm_people").select(PEOPLE_COLS).eq("space_id", spaceId).order("created_at"),
    db.from("pm_places").select(PLACE_COLS).eq("space_id", spaceId),
    db.from("pm_blocks").select("person_id, engine_kind, firmness, starts_at, ends_at, place_id").eq("space_id", spaceId).lt("starts_at", iso(range.end)).gt("ends_at", iso(range.start - 36 * 3_600_000)).limit(5000),
    db.from("pm_waking").select("person_id, day, day_end").eq("space_id", spaceId).gte("day", londonDate(range.start - 86_400_000)).lte("day", londonDate(range.end)),
    db.from("pm_pets").select("id").eq("space_id", spaceId).limit(1),
    familyBusyEvents(db, spaceId, iso(range.start - 36 * 3_600_000), iso(range.end)),
  ]);
  for (const r of [people, places, blocks, waking, pets]) if (r.error) throw new Error(r.error.message);
  const persons = (people.data ?? []) as PersonRow[];
  const byPerson: Record<string, EngineBlock[]> = {};
  for (const p of persons) byPerson[p.person_id] = [];
  for (const b of (blocks.data ?? []) as BlockRow[]) {
    (byPerson[b.person_id] ??= []).push({ person_id: b.person_id, kind: b.engine_kind, firmness: b.firmness, start: Date.parse(b.starts_at), end: Date.parse(b.ends_at), place_id: b.place_id });
  }
  for (const ev of family) {
    for (const p of persons) byPerson[p.person_id].push({ person_id: p.person_id, kind: "busy", firmness: "firm", start: ev.start, end: ev.end, place_id: null });
  }
  const dayOverrides: Record<string, string> = {};
  for (const w of (waking.data ?? []) as Array<{ day: string; day_end: string }>) {
    const cur = dayOverrides[w.day];
    dayOverrides[w.day] = cur && cur > w.day_end && w.day_end > "04:00" ? cur : w.day_end;
  }
  const windowPeople: WindowPersonInput[] = persons.map((p) => ({
    id: p.person_id,
    waking: p.waking,
    buffers: p.buffers,
    home_place_id: p.home_place_id,
    has_car: p.has_car,
    has_pet: (pets.data ?? []).length > 0,
    blocks: byPerson[p.person_id] ?? [],
  }));
  const windows = findWindows({ range, people: windowPeople, dayOverrides });
  return { range, people: persons, places: (places.data ?? []) as PmPlace[], blocks: byPerson, dayOverrides, hasPet: (pets.data ?? []).length > 0, windows };
}

/** The together-windows in a range (epoch ms). */
export async function windowsFor(db: SupabaseClient, spaceId: string, range: { start: number; end: number }): Promise<EngineWindow[]> {
  return (await loadFitContext(db, spaceId, range)).windows;
}

// ---------------------------------------------------------------------------
// Things

const WEEKDAY_KEYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** The readers' WeeklyHours (0 = Sunday) in the engine's shape. */
export function weeklyToOpening(w: WeeklyHours | null | undefined): OpeningHours | null {
  if (!w || typeof w !== "object") return null;
  const out: OpeningHours = {};
  let any = false;
  for (let d = 0; d < 7; d += 1) {
    const spans = (w as Record<number, Array<{ open: string; close: string }> | undefined>)[d];
    if (Array.isArray(spans) && spans.length) {
      out[WEEKDAY_KEYS[d]] = spans.map((s) => ({ open: s.open, close: s.close === "24:00" ? "00:00" : s.close }));
      any = true;
    }
  }
  return any ? out : null;
}

export function toFitThing(thing: Pick<PmThing, "lat" | "lng" | "min_minutes" | "max_minutes" | "indoor">, opening: WeeklyHours | null): FitThing {
  return { lat: thing.lat, lng: thing.lng, min_minutes: thing.min_minutes, max_minutes: thing.max_minutes, opening: weeklyToOpening(opening), indoor: thing.indoor };
}

export function toEngineThing(t: ThingRow): EngineThing {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    tags: t.tags ?? [],
    lat: t.lat,
    lng: t.lng,
    cost_pence: t.cost_pence,
    min_minutes: t.min_minutes,
    dog_rule: t.dog_rule,
    best_time_of_day: (t.best_time_of_day ?? []) as TimeOfDay[],
    seasons: (t.seasons ?? []) as Season[],
    stars_by: t.stars ?? {},
    created_at: t.created_at,
  };
}

type TravelRow = { thing_id: string; origin_place_id: string; mode: TravelMode; minutes: number; provider: TravelProvider };

/** The best opening_hours fact per thing (a hand edit wins, then confidence). */
async function openingFacts(db: SupabaseClient, thingIds: string[]): Promise<Record<string, WeeklyHours>> {
  if (thingIds.length === 0) return {};
  const { data } = await db.from("pm_thing_facts").select("thing_id, value, confidence, edited_by_user").eq("key", "opening_hours").in("thing_id", thingIds).limit(2000);
  const best: Record<string, { score: number; value: WeeklyHours }> = {};
  for (const f of (data ?? []) as Array<{ thing_id: string; value: WeeklyHours; confidence: number; edited_by_user: boolean }>) {
    const score = (f.edited_by_user ? 10 : 0) + Number(f.confidence ?? 0);
    if (!best[f.thing_id] || best[f.thing_id].score < score) best[f.thing_id] = { score, value: f.value };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.value]));
}

async function travelRows(db: SupabaseClient, thingIds: string[]): Promise<TravelRow[]> {
  if (thingIds.length === 0) return [];
  const { data } = await db.from("pm_travel").select("thing_id, origin_place_id, mode, minutes, provider").in("thing_id", thingIds).limit(5000);
  return (data ?? []) as TravelRow[];
}

/** pm_travel first; the straight-line estimate when there is no row and both ends have a pin. */
export function travelLookup(thing: Pick<PmThing, "lat" | "lng">, rows: readonly TravelRow[], places: readonly PmPlace[]): TravelLookup {
  const byKey = new Map(rows.map((r) => [`${r.origin_place_id}:${r.mode}`, r]));
  const placeById = new Map(places.map((p) => [p.id, p]));
  return (fromPlaceId, mode) => {
    const row = byKey.get(`${fromPlaceId}:${mode}`);
    if (row) return { minutes: row.minutes, provider: row.provider };
    const place = placeById.get(fromPlaceId);
    if (!place || place.lat === null || place.lng === null || thing.lat === null || thing.lng === null) return null;
    const minutes = travelMinutes(distanceKm({ lat: place.lat, lng: place.lng }, { lat: thing.lat, lng: thing.lng }), mode);
    return minutes === null ? null : { minutes, provider: "estimate" };
  };
}

function fitPeople(ctx: FitContext): FitPerson[] {
  return ctx.people.map((p) => ({ person: { id: p.person_id, buffers: p.buffers, home_place_id: p.home_place_id }, blocks: ctx.blocks[p.person_id] ?? [], mode: p.has_car ? "drive" : undefined }));
}

export async function loadThing(db: SupabaseClient, spaceId: string, thingId: string): Promise<ThingRow | null> {
  const { data, error } = await db.from("pm_things").select(THING_COLS).eq("space_id", spaceId).eq("id", thingId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ThingRow | null) ?? null;
}

export type FitsForThing = { results: FitResult[]; next: { result: FitResult; text: string } | null };

/** Every window in the next `weeks` (default eight) fitted for one thing, and the next that fits. */
export async function fitsForThing(db: SupabaseClient, spaceId: string, thingId: string, opts: { weeks?: number; now?: number } = {}): Promise<FitsForThing> {
  const now = opts.now ?? Date.now();
  const range = { start: now, end: now + (opts.weeks ?? FIT_WEEKS) * 7 * 86_400_000 };
  const thing = await loadThing(db, spaceId, thingId);
  if (!thing) return { results: [], next: null };
  const [ctx, opening, rows] = await Promise.all([loadFitContext(db, spaceId, range), openingFacts(db, [thingId]), travelRows(db, [thingId])]);
  const results = fitThing({ windows: ctx.windows, people: fitPeople(ctx), thing: toFitThing(thing, opening[thingId] ?? null), travel: travelLookup(thing, rows, ctx.places), horizon: range });
  return { results, next: nextFit(results, now) };
}

/** The engine window that overlaps a span most, or the span itself as a firm window. */
function windowFor(ctx: FitContext, span: { start: number; end: number }): TogetherWindow {
  let best: EngineWindow | null = null;
  let bestOverlap = 0;
  for (const w of ctx.windows) {
    const overlap = Math.min(w.end, span.end) - Math.max(w.start, span.start);
    if (overlap > bestOverlap) {
      best = w;
      bestOverlap = overlap;
    }
  }
  return best ?? { start: span.start, end: span.end, firmness: "firm", day: londonDate(span.start) };
}

/**
 * One thing fitted into one span (a plan's window): the engine window that
 * holds the span when there is one, so travel can start as soon as both are
 * free. Null when the thing is unknown.
 */
export async function fitForWindow(db: SupabaseClient, spaceId: string, thingId: string, span: { start: number; end: number }): Promise<{ fit: FitResult | null; ctx: FitContext }> {
  const range = { start: span.start - 12 * 3_600_000, end: span.end + 12 * 3_600_000 };
  const thing = await loadThing(db, spaceId, thingId);
  const ctx = await loadFitContext(db, spaceId, range);
  if (!thing) return { fit: null, ctx };
  const [opening, rows] = await Promise.all([openingFacts(db, [thingId]), travelRows(db, [thingId])]);
  const w = windowFor(ctx, span);
  const results = fitThing({ windows: [w], people: fitPeople(ctx), thing: toFitThing(thing, opening[thingId] ?? null), travel: travelLookup(thing, rows, ctx.places) });
  return { fit: results[0] ?? null, ctx };
}

export type RankedThing = { thing: ThingRow; fit: FitResult; score: number; reasons: string[] };

const VERDICT_RANK = { fits: 0, tight: 1, no: 2 } as const;

/** The kinds of the things done most recently, newest first (feeds the variety term). */
async function recentKinds(db: SupabaseClient, spaceId: string): Promise<string[]> {
  const { data } = await db.from("pm_plans").select("thing_id, ends_at").eq("space_id", spaceId).eq("status", "done").not("thing_id", "is", null).order("ends_at", { ascending: false }).limit(6);
  const ids = ((data ?? []) as Array<{ thing_id: string }>).map((r) => r.thing_id);
  if (ids.length === 0) return [];
  const { data: things } = await db.from("pm_things").select("id, kind").in("id", ids);
  const kind = new Map(((things ?? []) as Array<{ id: string; kind: string | null }>).map((t) => [t.id, t.kind]));
  return ids.map((id) => kind.get(id)).filter((k): k is string => !!k);
}

/**
 * Ready things ranked for one window: by verdict (fits, then tight; "no" is
 * left out), then by the scoring module. The score's weights lean on the
 * spec's engine-proposal terms (variety, how long it has waited).
 */
export async function thingsForWindow(db: SupabaseClient, spaceId: string, window: { start: number; end: number }, opts: { now?: number; includeNo?: boolean } = {}): Promise<RankedThing[]> {
  const now = opts.now ?? Date.now();
  const range = { start: Math.min(now, window.start) - 12 * 3_600_000, end: window.end + 12 * 3_600_000 };
  const [ctx, thingsRes, recent] = await Promise.all([loadFitContext(db, spaceId, range), db.from("pm_things").select(THING_COLS).eq("space_id", spaceId).eq("status", "ready").limit(300), recentKinds(db, spaceId)]);
  if (thingsRes.error) throw new Error(thingsRes.error.message);
  const things = (thingsRes.data ?? []) as ThingRow[];
  if (things.length === 0) return [];
  const ids = things.map((t) => t.id);
  const [opening, rows] = await Promise.all([openingFacts(db, ids), travelRows(db, ids)]);
  const w = windowFor(ctx, window);
  const people = fitPeople(ctx);
  const minutes = Math.round((w.end - w.start) / 60_000);
  const scoreCtx: ScoreContext = {
    window: { start: w.start, end: w.end, day: w.day, minutes },
    remainingBudgetPence: 100_000,
    hasPet: ctx.hasPet,
    tasteWeights: {},
    lastDone: {},
    sky: null,
    weights: { variety: 0.08, waited: 0.1 },
    forUserId: ctx.people[0]?.person_id ?? "",
    partnerUserId: ctx.people[1]?.person_id ?? null,
    bufferMin: 0,
    recentKinds: recent,
    now,
  };
  const out: RankedThing[] = [];
  for (const t of things) {
    const fit = fitThing({ windows: [w], people, thing: toFitThing(t, opening[t.id] ?? null), travel: travelLookup(t, rows.filter((r) => r.thing_id === t.id), ctx.places) })[0];
    if (!fit) continue;
    if (fit.verdict === "no" && !opts.includeNo) continue;
    const travel = fit.legs.reduce((m, l) => Math.max(m, l.travel_minutes), 0) * 2;
    const total = fit.minutes_there + travel;
    const scored = scoreCandidate(
      { things: [toEngineThing(t)], plan: { mode: "meet_there", legs: [], activityMinutes: fit.minutes_there, travelMinutes: travel, totalMinutes: total, travelShare: total > 0 ? travel / total : 0, complete: true } },
      scoreCtx,
    );
    if (!scored.hard.dogOk || !scored.hard.seasonOk) continue;
    out.push({ thing: t, fit, score: scored.score, reasons: scored.reasons });
  }
  return out.sort((a, b) => VERDICT_RANK[a.fit.verdict] - VERDICT_RANK[b.fit.verdict] || b.score - a.score);
}
