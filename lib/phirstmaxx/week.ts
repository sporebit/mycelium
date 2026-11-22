/**
 * PhirstMaxx — the weekly grid on the server (claude/phirstmaxx-spec.md §4).
 *
 *   weekData()       everything the grid draws for one week: both people's
 *                    blocks, the together-windows (the engine, with the
 *                    Family calendar's appointments folded in as busy time
 *                    for everyone), the calendar events for the hatched
 *                    layer, types, places, patterns, what the save bar
 *                    opens with, and whether the last save can be undone.
 *   saveBlocks()     one painted set of ranges through pm_save_blocks, in
 *                    one transaction (spec §2.6). Either person may enter
 *                    the other's shifts; the RPC records who entered them.
 *   undoLast()       the saver's last save put back, within ten minutes.
 *   resizeBlock()    drag an edge: a plain update, half-hour aligned.
 *   deleteBlock()
 *   copyLastWeek()   the saver's own blocks from the week before, re-saved
 *                    a week on with policy "trim" so nothing already there
 *                    is cut.
 *   savePattern()    the saver's blocks of the shown week, kept as slots
 *                    relative to Monday 00:00 London.
 *   applyPattern()   a pattern laid onto a week, through the RPC.
 *
 * Every read and write runs as the caller; RLS decides. The pure parts
 * (patterns, shifting, grouping, last used, undo age) are in weekShape.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { familyBusyEvents } from "./adapter";
import { findWindows, type WindowPersonInput } from "./engine/windows";
import { shiftDate, shiftWeek, slotToInstant, weekDays } from "./grid";
import { listBlockTypes, listPlaces, type PmCtx } from "./server";
import type { Firmness, PmBlock, PmBlockType, PmPlace, TogetherWindow } from "./types";
import { FIRMNESS } from "./types";
import { canUndo, groupForSave, isHalfHour, lastBatchFrom, lastUsedFrom, patternFromBlocks, rangesFromPattern, settingsAfterSave, settingsAfterUndo, shiftRangeWeeks, type IsoRange, type LastUsed, type ShapedRange } from "./weekShape";

export const BLOCK_COLS = "id, person_id, entered_by, type_id, engine_kind, starts_at, ends_at, firmness, place_id, title, series_id, local";
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (error: string, status = 400): Result<never> => ({ ok: false, status, error });
const done = <T>(value: T): Result<T> => ({ ok: true, value });

/** A database error as a status and a sentence: RLS refusing is 403, a raised exception is its own words. */
function dbFail(err: { code?: string; message: string }): Result<never> {
  if (err.code === "42501") return fail("You cannot change this space.", 403);
  return fail(err.message, 400);
}

export type CalendarEvent = { id: string; title: string; start: string; end: string };
export type WeekData = {
  weekStart: string;
  /** The caller's auth user id: whose half opens for editing. */
  me: string;
  blocks: PmBlock[];
  types: PmBlockType[];
  places: PmPlace[];
  windows: TogetherWindow[];
  calendarEvents: CalendarEvent[];
  people: Array<{ id: string; name: string; colour: string }>;
  wakingStart: string;
  patterns: Array<{ id: string; name: string }>;
  lastUsed: LastUsed;
  canUndo: boolean;
};

export const isWeekStart = (v: unknown): v is string => typeof v === "string" && WEEK_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** The instants the week runs between: Monday 00:00 London to the next Monday 00:00. */
export function weekSpan(weekStart: string): { start: number; end: number } {
  return { start: slotToInstant(weekStart, 0, 0), end: slotToInstant(weekStart, 6, 48) };
}

async function blocksBetween(db: SupabaseClient, spaceId: string, startIso: string, endIso: string, personId?: string): Promise<PmBlock[]> {
  let q = db.from("pm_blocks").select(BLOCK_COLS).eq("space_id", spaceId).lt("starts_at", endIso).gt("ends_at", startIso).order("starts_at");
  if (personId) q = q.eq("person_id", personId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PmBlock[];
}

async function listPatterns(db: SupabaseClient, spaceId: string, personId: string): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await db.from("pm_patterns").select("id, name").eq("space_id", spaceId).eq("person_id", personId).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function weekData(db: SupabaseClient, ctx: PmCtx, weekStart: string, now: Date = new Date()): Promise<WeekData> {
  const span = weekSpan(weekStart);
  // A day either side: Sunday night's block runs into Monday, and the
  // engine wants the evening before the week for windows that cross midnight.
  const fromIso = new Date(span.start - 86_400_000).toISOString();
  const toIso = new Date(span.end + 86_400_000).toISOString();
  const [blocks, types, places, patterns, waking, calendarEvents] = await Promise.all([
    blocksBetween(db, ctx.spaceId, fromIso, toIso),
    listBlockTypes(db, ctx.spaceId),
    listPlaces(db, ctx.spaceId),
    listPatterns(db, ctx.spaceId, ctx.uid),
    db.from("pm_waking").select("person_id, day, day_end").eq("space_id", ctx.spaceId).gte("day", shiftDate(weekStart, -1)).lte("day", shiftDate(weekStart, 7)),
    familyBusyEvents(db, ctx.spaceId, fromIso, toIso)
      .then((rows) => rows.map((c): CalendarEvent => ({ id: c.id, title: c.title, start: new Date(c.start).toISOString(), end: new Date(c.end).toISOString() })))
      .catch((e: unknown) => {
        // the grid still draws without the calendar layer; the hatching is a courtesy
        console.error("[phirstmaxx] family calendar events:", e);
        return [] as CalendarEvent[];
      }),
  ]);

  // "Late one tonight" extends the evening; the engine applies the latest end given for a day.
  const dayOverrides: Record<string, string> = {};
  for (const w of (waking.data ?? []) as Array<{ day: string; day_end: string }>) {
    if (!dayOverrides[w.day] || w.day_end > dayOverrides[w.day]) dayOverrides[w.day] = w.day_end;
  }

  const people: WindowPersonInput[] = ctx.people.map((p) => ({
    id: p.id,
    waking: p.waking,
    buffers: p.buffers,
    home_place_id: p.home_place_id,
    has_car: p.has_car,
    blocks: [
      ...blocks.filter((b) => b.person_id === p.id).map((b) => ({ person_id: b.person_id, kind: b.engine_kind, firmness: b.firmness, start: Date.parse(b.starts_at), end: Date.parse(b.ends_at), place_id: b.place_id })),
      // an appointment on the Family calendar is busy time for both of them (spec §4)
      ...calendarEvents.map((c) => ({ person_id: p.id, kind: "busy" as const, firmness: "firm" as const, start: Date.parse(c.start), end: Date.parse(c.end), place_id: null })),
    ],
  }));
  const windows: TogetherWindow[] = findWindows({ range: span, people, dayOverrides }).map((w) => ({ start: w.start, end: w.end, firmness: w.firmness, day: w.day }));

  return {
    weekStart,
    me: ctx.uid,
    blocks,
    types,
    places,
    windows,
    calendarEvents,
    people: ctx.people.map((p) => ({ id: p.id, name: p.name, colour: p.colour })),
    wakingStart: ctx.me.waking.weekday.start,
    patterns,
    lastUsed: lastUsedFrom(ctx.me.settings),
    canUndo: canUndo(lastBatchFrom(ctx.me.settings), now.getTime()),
  };
}

// ---------------------------------------------------------------------------
// Saving

export type SaveInput = {
  person_id: string;
  ranges: IsoRange[];
  type_id: string;
  firmness: Firmness;
  place_id: string | null;
  title: string | null;
  repeat_until: string | null;
  overlap_policy: "replace" | "trim";
};

export type SaveOutcome = { batch_id: string; created: number; removed: number; trimmed: number; series_id: string | null; weeks: number };

/** The request body as a SaveInput, or the sentence that is wrong with it. */
export function parseSaveInput(body: Record<string, unknown>, ctx: PmCtx): Result<SaveInput> {
  const person = typeof body.person_id === "string" && body.person_id ? body.person_id : ctx.uid;
  if (!ctx.people.some((p) => p.id === person)) return fail("That person is not in this space.");
  if (!Array.isArray(body.ranges) || body.ranges.length === 0) return fail("Nothing highlighted.");
  if (body.ranges.length > 400) return fail("That is too many ranges for one save.");
  const ranges: IsoRange[] = [];
  for (const r of body.ranges as unknown[]) {
    const o = r as { start?: unknown; end?: unknown };
    if (typeof o?.start !== "string" || typeof o?.end !== "string" || !isHalfHour(o.start) || !isHalfHour(o.end)) return fail("Ranges are half-hour aligned instants.");
    if (Date.parse(o.end) <= Date.parse(o.start)) return fail("A range ends after it starts.");
    ranges.push({ start: new Date(o.start).toISOString(), end: new Date(o.end).toISOString() });
  }
  if (typeof body.type_id !== "string" || !UUID_RE.test(body.type_id)) return fail("Choose a type.");
  const firmness = body.firmness ?? "firm";
  if (!(FIRMNESS as readonly unknown[]).includes(firmness)) return fail("Firmness is firm or flexible.");
  const place = body.place_id ?? null;
  if (place !== null && (typeof place !== "string" || !UUID_RE.test(place))) return fail("place_id is a place.");
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : null;
  const repeat = body.repeat_until ?? null;
  if (repeat !== null && !isWeekStart(repeat)) return fail("repeat_until is a date (YYYY-MM-DD).");
  const policy = body.overlap_policy ?? "replace";
  if (policy !== "replace" && policy !== "trim") return fail("overlap_policy is replace or trim.");
  return done({ person_id: person, ranges, type_id: body.type_id, firmness: firmness as Firmness, place_id: place as string | null, title, repeat_until: repeat as string | null, overlap_policy: policy });
}

async function callSave(db: SupabaseClient, ctx: PmCtx, input: SaveInput): Promise<Result<SaveOutcome>> {
  const { data, error } = await db.rpc("pm_save_blocks", {
    p_space: ctx.spaceId,
    p_person: input.person_id,
    p_ranges: input.ranges,
    p_type: input.type_id,
    p_firmness: input.firmness,
    p_place: input.place_id,
    p_title: input.title,
    p_repeat_until: input.repeat_until,
    p_policy: input.overlap_policy,
  });
  if (error) return dbFail(error);
  return done(data as SaveOutcome);
}

async function writeSettings(db: SupabaseClient, ctx: PmCtx, settings: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("pm_people").update({ settings, updated_at: new Date().toISOString() }).eq("id", ctx.me.row_id);
  if (error) console.error("[phirstmaxx] settings not kept:", error.message);
  else ctx.me.settings = settings;
}

/** One save for everything highlighted. Remembers the choice for next time and the batch for undo. */
export async function saveBlocks(db: SupabaseClient, ctx: PmCtx, input: SaveInput): Promise<Result<SaveOutcome>> {
  const r = await callSave(db, ctx, input);
  if (!r.ok) return r;
  await writeSettings(db, ctx, settingsAfterSave(ctx.me.settings, { type_id: input.type_id, firmness: input.firmness, place_id: input.place_id }, [r.value.batch_id]));
  return r;
}

/** Several shapes saved together (a pattern, a copied week): one RPC call per shape, all undone as one. */
async function saveShaped(db: SupabaseClient, ctx: PmCtx, personId: string, items: ShapedRange[], policy: "replace" | "trim"): Promise<Result<{ created: number; batches: number }>> {
  const groups = groupForSave(items);
  if (groups.length === 0) return fail("Nothing to save.", 409);
  const batches: string[] = [];
  let created = 0;
  for (const g of groups) {
    const r = await callSave(db, ctx, { person_id: personId, ranges: g.ranges, type_id: g.type_id, firmness: g.firmness, place_id: g.place_id, title: g.title, repeat_until: null, overlap_policy: policy });
    if (!r.ok) {
      // undo what this call's predecessors did, so the week is not half-applied
      for (const b of batches.reverse()) await db.rpc("pm_undo_blocks", { p_space: ctx.spaceId, p_batch: b });
      return r;
    }
    batches.push(r.value.batch_id);
    created += r.value.created;
  }
  const last = lastUsedFrom(ctx.me.settings);
  await writeSettings(db, ctx, settingsAfterSave(ctx.me.settings, last, batches));
  return done({ created, batches: batches.length });
}

/** The saver's last save, put back. 409 when there is none or it is too old. */
export async function undoLast(db: SupabaseClient, ctx: PmCtx): Promise<Result<{ removed: number; restored: number }>> {
  const batch = lastBatchFrom(ctx.me.settings);
  if (!canUndo(batch)) {
    if (batch) await writeSettings(db, ctx, settingsAfterUndo(ctx.me.settings));
    return fail("Nothing to undo: the last save is over ten minutes old.", 409);
  }
  let removed = 0;
  let restored = 0;
  for (const id of [...batch!.ids].reverse()) {
    const { data, error } = await db.rpc("pm_undo_blocks", { p_space: ctx.spaceId, p_batch: id });
    if (error) {
      await writeSettings(db, ctx, settingsAfterUndo(ctx.me.settings));
      return dbFail(error);
    }
    const d = data as { removed: number; restored: number };
    removed += d.removed;
    restored += d.restored;
  }
  await writeSettings(db, ctx, settingsAfterUndo(ctx.me.settings));
  return done({ removed, restored });
}

/** An edge dragged: a plain update, on the half hour, ending after it starts. */
export async function resizeBlock(db: SupabaseClient, ctx: PmCtx, id: string, startsAt: string, endsAt: string): Promise<Result<PmBlock>> {
  if (!UUID_RE.test(id)) return fail("No such block.", 404);
  if (!isHalfHour(startsAt) || !isHalfHour(endsAt)) return fail("Blocks sit on the half hour.");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return fail("A block ends after it starts.");
  const { data, error } = await db
    .from("pm_blocks")
    .update({ starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("space_id", ctx.spaceId)
    .select(BLOCK_COLS)
    .maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such block.", 404);
  return done(data as PmBlock);
}

export async function deleteBlock(db: SupabaseClient, ctx: PmCtx, id: string): Promise<Result<{ deleted: number }>> {
  if (!UUID_RE.test(id)) return fail("No such block.", 404);
  const { data, error } = await db.from("pm_blocks").delete().eq("id", id).eq("space_id", ctx.spaceId).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("No such block.", 404);
  return done({ deleted: data.length });
}

/** A block changed by hand on the edit sheet: type, firmness, place, title. */
export async function updateBlock(db: SupabaseClient, ctx: PmCtx, id: string, body: Record<string, unknown>): Promise<Result<PmBlock>> {
  if (!UUID_RE.test(id)) return fail("No such block.", 404);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("type_id" in body) {
    if (typeof body.type_id !== "string" || !UUID_RE.test(body.type_id)) return fail("type_id is a type.");
    const types = await listBlockTypes(db, ctx.spaceId);
    const t = types.find((x) => x.id === body.type_id);
    if (!t) return fail("That block type is not in this space.");
    patch.type_id = t.id;
    patch.engine_kind = t.engine_kind;
  }
  if ("firmness" in body) {
    if (!(FIRMNESS as readonly unknown[]).includes(body.firmness)) return fail("Firmness is firm or flexible.");
    patch.firmness = body.firmness;
  }
  if ("place_id" in body) {
    if (body.place_id !== null && (typeof body.place_id !== "string" || !UUID_RE.test(body.place_id))) return fail("place_id is a place.");
    patch.place_id = body.place_id;
  }
  if ("title" in body) patch.title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : null;
  if ("starts_at" in body || "ends_at" in body) {
    if (typeof body.starts_at !== "string" || typeof body.ends_at !== "string" || !isHalfHour(body.starts_at) || !isHalfHour(body.ends_at)) return fail("Blocks sit on the half hour.");
    if (Date.parse(body.ends_at) <= Date.parse(body.starts_at)) return fail("A block ends after it starts.");
    patch.starts_at = new Date(body.starts_at).toISOString();
    patch.ends_at = new Date(body.ends_at).toISOString();
  }
  const { data, error } = await db.from("pm_blocks").update(patch).eq("id", id).eq("space_id", ctx.spaceId).select(BLOCK_COLS).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such block.", 404);
  return done(data as PmBlock);
}

/** The saver's own blocks from the week before, a week on, around whatever is already there. */
export async function copyLastWeek(db: SupabaseClient, ctx: PmCtx, weekStart: string): Promise<Result<{ created: number; batches: number }>> {
  const prev = weekSpan(shiftWeek(weekStart, -1));
  const blocks = await blocksBetween(db, ctx.spaceId, new Date(prev.start).toISOString(), new Date(prev.end).toISOString(), ctx.uid);
  // only blocks that start in that week; one running in from the Sunday before belongs to the week before that
  const items: ShapedRange[] = blocks
    .filter((b) => Date.parse(b.starts_at) >= prev.start)
    .map((b) => ({ ...shiftRangeWeeks({ start: b.starts_at, end: b.ends_at }, 1), type_id: b.type_id, firmness: b.firmness, place_id: b.place_id, title: b.title }));
  if (items.length === 0) return fail("Last week has nothing of yours to copy.", 409);
  return saveShaped(db, ctx, ctx.uid, items, "trim");
}

/** The saver's blocks of the shown week, kept under a name. The same name again replaces the pattern. */
export async function savePattern(db: SupabaseClient, ctx: PmCtx, name: string, weekStart: string): Promise<Result<{ id: string; name: string; blocks: number }>> {
  const label = name.trim().slice(0, 60);
  if (!label) return fail("A pattern needs a name.");
  const span = weekSpan(weekStart);
  const blocks = await blocksBetween(db, ctx.spaceId, new Date(span.start).toISOString(), new Date(span.end).toISOString(), ctx.uid);
  const shape = patternFromBlocks(weekStart, blocks);
  if (shape.length === 0) return fail("This week has nothing of yours to keep as a pattern.", 409);
  const { data: existing } = await db.from("pm_patterns").select("id").eq("space_id", ctx.spaceId).eq("person_id", ctx.uid).ilike("name", label).maybeSingle();
  const row = existing as { id: string } | null;
  const q = row
    ? db.from("pm_patterns").update({ name: label, blocks: shape, updated_at: new Date().toISOString() }).eq("id", row.id).select("id, name").single()
    : db.from("pm_patterns").insert({ space_id: ctx.spaceId, created_by: ctx.uid, person_id: ctx.uid, name: label, blocks: shape }).select("id, name").single();
  const { data, error } = await q;
  if (error) return dbFail(error);
  const saved = data as { id: string; name: string };
  return done({ ...saved, blocks: shape.length });
}

/** A saved pattern laid onto a week, for the saver. Existing blocks give way (policy replace). */
export async function applyPattern(db: SupabaseClient, ctx: PmCtx, id: string, weekStart: string): Promise<Result<{ created: number; batches: number }>> {
  if (!UUID_RE.test(id)) return fail("No such pattern.", 404);
  const { data, error } = await db.from("pm_patterns").select("id, blocks").eq("id", id).eq("space_id", ctx.spaceId).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such pattern.", 404);
  const items = rangesFromPattern(weekStart, ((data as { blocks: unknown }).blocks ?? []) as Parameters<typeof rangesFromPattern>[1]);
  if (items.length === 0) return fail("That pattern is empty.", 409);
  return saveShaped(db, ctx, ctx.uid, items, "replace");
}

export async function deletePattern(db: SupabaseClient, ctx: PmCtx, id: string): Promise<Result<{ deleted: number }>> {
  if (!UUID_RE.test(id)) return fail("No such pattern.", 404);
  const { data, error } = await db.from("pm_patterns").delete().eq("id", id).eq("space_id", ctx.spaceId).eq("person_id", ctx.uid).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("No such pattern.", 404);
  return done({ deleted: data.length });
}

/** Monday of the week holding a London date, for the route's default. */
export function defaultWeek(now: Date = new Date()): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return shiftDate(d, -((dow + 6) % 7));
}

export { weekDays };
