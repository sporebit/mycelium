/**
 * PhirstMaxx — settings on the server (claude/phirstmaxx-spec.md §8):
 * the caller's pm_people row (name, colour, car, waking hours, buffers,
 * home), the space's start points, block types and pets, a "late one
 * tonight" waking override, and the inbox token, shown once.
 *
 * The research spend cap (settings.research_cap_pence) is money-adjacent
 * (spec §11.5), so only the instance owner may set it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHIL_AUTH_UID } from "@/lib/system/identity";
import { UUID_RE, int, str } from "./http";
import { PLACE_COLS, TYPE_COLS, rotateInboxToken, type PmCtx, type PmPersonRow } from "./server";
import { ENGINE_KINDS, FIRMNESS, type PmBlockType, type PmPlace } from "./types";

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (error: string, status = 400): Result<never> => ({ ok: false, status, error });
const done = <T>(value: T): Result<T> => ({ ok: true, value });
const dbFail = (err: { code?: string; message: string }): Result<never> => {
  if (err.code === "42501") return fail("You cannot change this space.", 403);
  if (err.code === "23505") return fail("There is one with that name already.", 409);
  if (err.code === "23503") return fail("That is still in use.", 409);
  return fail(err.message, 400);
};

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOUR_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLACE_KINDS = ["home", "work", "other"] as const;

export type PmPet = { id: string; name: string; kind: string; notes: string | null };
export type WakingOverride = { id: string; person_id: string; day: string; day_end: string };

/** What the caller sees of themself: the row without the token hash (never stored in the row type anyway). */
export type MeView = Omit<PmPersonRow, "settings"> & { settings: { research_cap_pence: number | null; last_used?: unknown }; is_owner: boolean };

export function meView(ctx: PmCtx): MeView {
  const cap = ctx.me.settings?.research_cap_pence;
  return { ...ctx.me, settings: { research_cap_pence: typeof cap === "number" ? cap : null, last_used: ctx.me.settings?.last_used }, is_owner: ctx.uid === PHIL_AUTH_UID };
}

export async function listPets(db: SupabaseClient, spaceId: string): Promise<PmPet[]> {
  const { data, error } = await db.from("pm_pets").select("id, name, kind, notes").eq("space_id", spaceId).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PmPet[];
}

export async function listWakingOverrides(db: SupabaseClient, spaceId: string, fromDay: string): Promise<WakingOverride[]> {
  const { data, error } = await db.from("pm_waking").select("id, person_id, day, day_end").eq("space_id", spaceId).gte("day", fromDay).order("day");
  if (error) throw new Error(error.message);
  return (data ?? []) as WakingOverride[];
}

// ---------------------------------------------------------------------------
// person

export async function updatePerson(db: SupabaseClient, ctx: PmCtx, body: Record<string, unknown>): Promise<Result<PmPersonRow>> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("name" in body) {
    const n = str(body.name, 60);
    if (!n) return fail("A name is needed.");
    patch.name = n;
  }
  if ("colour" in body) {
    if (typeof body.colour !== "string" || !COLOUR_RE.test(body.colour)) return fail("colour is a hex colour like #7aa2f7.");
    patch.colour = body.colour.toLowerCase();
  }
  if ("has_car" in body) {
    if (typeof body.has_car !== "boolean") return fail("has_car is yes or no.");
    patch.has_car = body.has_car;
  }
  if ("waking" in body) {
    const w = body.waking as Record<string, { start?: unknown; end?: unknown }> | null;
    for (const k of ["weekday", "weekend"] as const) {
      const v = w?.[k];
      if (!v || typeof v.start !== "string" || typeof v.end !== "string" || !HM_RE.test(v.start) || !HM_RE.test(v.end)) return fail(`Waking hours are HH:mm for ${k}s.`);
    }
    patch.waking = { weekday: { start: w!.weekday.start, end: w!.weekday.end }, weekend: { start: w!.weekend.start, end: w!.weekend.end } };
  }
  if ("buffers" in body) {
    const b = body.buffers as Record<string, unknown> | null;
    const out: Record<string, number> = {};
    for (const k of ["shift", "sit", "walk"] as const) {
      const n = int(b?.[k], 0, 240);
      if (n === null) return fail(`The ${k} buffer is whole minutes, up to four hours.`);
      out[k] = n;
    }
    patch.buffers = out;
  }
  if ("home_place_id" in body) {
    if (body.home_place_id !== null) {
      if (typeof body.home_place_id !== "string" || !UUID_RE.test(body.home_place_id)) return fail("home_place_id is a place.");
      const { data } = await db.from("pm_places").select("id").eq("id", body.home_place_id).eq("space_id", ctx.spaceId).maybeSingle();
      if (!data) return fail("No such place.");
    }
    patch.home_place_id = body.home_place_id;
  }
  if ("research_cap_pence" in body) {
    // money-adjacent (spec §11.5): the instance owner's call alone
    if (ctx.uid !== PHIL_AUTH_UID) return fail("Only the instance owner sets the research spend.", 403);
    const cap = body.research_cap_pence === null ? null : int(body.research_cap_pence, 0, 100_000);
    if (cap === undefined || (body.research_cap_pence !== null && cap === null)) return fail("research_cap_pence is whole pence, up to £1,000.");
    const settings = { ...ctx.me.settings };
    if (cap === null) delete settings.research_cap_pence;
    else settings.research_cap_pence = cap;
    patch.settings = settings;
  }
  if (Object.keys(patch).length === 1) return fail("Nothing to change.");
  const { data, error } = await db.from("pm_people").update(patch).eq("id", ctx.me.row_id).select("id, person_id, name, colour, has_car, waking, buffers, home_place_id, settings, inbox_token_hint, updated_at").single();
  if (error) return dbFail(error);
  const r = data as Record<string, unknown>;
  return done({ ...(r as unknown as PmPersonRow), row_id: r.id as string, id: r.person_id as string });
}

// ---------------------------------------------------------------------------
// places

export async function savePlace(db: SupabaseClient, ctx: PmCtx, body: Record<string, unknown>, id: string | null): Promise<Result<PmPlace>> {
  const c: Record<string, unknown> = {};
  if (!id || "label" in body) {
    const l = str(body.label, 80);
    if (!l) return fail("A place needs a name.");
    c.label = l;
  }
  if ("address" in body) c.address = body.address === null ? null : str(body.address, 300);
  for (const k of ["lat", "lng"] as const) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v === null) c[k] = null;
    else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= (k === "lat" ? 90 : 180)) c[k] = v;
    else return fail(`${k} is a number.`);
  }
  if ("kind" in body) {
    if (!(PLACE_KINDS as readonly unknown[]).includes(body.kind)) return fail("kind is home, work or other.");
    c.kind = body.kind;
  }
  if ("shared" in body) c.person_id = body.shared === true ? null : ctx.uid;
  else if (!id) c.person_id = ctx.uid;
  if (!id) {
    const { data, error } = await db.from("pm_places").insert({ space_id: ctx.spaceId, created_by: ctx.uid, saved: true, ...c }).select(PLACE_COLS).single();
    if (error) return dbFail(error);
    return done(data as PmPlace);
  }
  if (!UUID_RE.test(id)) return fail("No such place.", 404);
  if (Object.keys(c).length === 0) return fail("Nothing to change.");
  const { data, error } = await db.from("pm_places").update({ ...c, updated_at: new Date().toISOString() }).eq("id", id).eq("space_id", ctx.spaceId).select(PLACE_COLS).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such place.", 404);
  return done(data as PmPlace);
}

export async function deletePlace(db: SupabaseClient, ctx: PmCtx, id: string): Promise<Result<{ deleted: number }>> {
  if (!UUID_RE.test(id)) return fail("No such place.", 404);
  const { data, error } = await db.from("pm_places").delete().eq("id", id).eq("space_id", ctx.spaceId).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("No such place.", 404);
  return done({ deleted: data.length });
}

// ---------------------------------------------------------------------------
// block types

export async function saveType(db: SupabaseClient, ctx: PmCtx, body: Record<string, unknown>, id: string | null): Promise<Result<PmBlockType>> {
  const c: Record<string, unknown> = {};
  if (!id || "name" in body) {
    const n = str(body.name, 40);
    if (!n) return fail("A type needs a name.");
    c.name = n;
  }
  if (!id || "engine_kind" in body) {
    if (!(ENGINE_KINDS as readonly unknown[]).includes(body.engine_kind)) return fail(`engine_kind is one of ${ENGINE_KINDS.join(", ")}.`);
    c.engine_kind = body.engine_kind;
  }
  if ("colour" in body) {
    if (body.colour !== null && (typeof body.colour !== "string" || !COLOUR_RE.test(body.colour))) return fail("colour is a hex colour like #7d8a9e.");
    c.colour = body.colour === null ? null : (body.colour as string).toLowerCase();
  }
  if ("default_firmness" in body) {
    if (!(FIRMNESS as readonly unknown[]).includes(body.default_firmness)) return fail("default_firmness is firm or flexible.");
    c.default_firmness = body.default_firmness;
  }
  if ("default_place_id" in body) {
    if (body.default_place_id !== null && (typeof body.default_place_id !== "string" || !UUID_RE.test(body.default_place_id))) return fail("default_place_id is a place.");
    c.default_place_id = body.default_place_id;
  }
  if ("sort" in body) {
    const s = int(body.sort, 0, 999);
    if (s === null) return fail("sort is a whole number.");
    c.sort = s;
  }
  if (!id) {
    const { data, error } = await db.from("pm_block_types").insert({ space_id: ctx.spaceId, created_by: ctx.uid, sort: 50, ...c }).select(TYPE_COLS).single();
    if (error) return dbFail(error);
    return done(data as PmBlockType);
  }
  if (!UUID_RE.test(id)) return fail("No such type.", 404);
  if (Object.keys(c).length === 0) return fail("Nothing to change.");
  if ("engine_kind" in c) {
    // blocks carry their kind too; keep them in step with the type
    await db.from("pm_blocks").update({ engine_kind: c.engine_kind }).eq("type_id", id).eq("space_id", ctx.spaceId);
  }
  const { data, error } = await db.from("pm_block_types").update({ ...c, updated_at: new Date().toISOString() }).eq("id", id).eq("space_id", ctx.spaceId).select(TYPE_COLS).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such type.", 404);
  return done(data as PmBlockType);
}

/** A type with blocks under it cannot go (409); the blocks would have no type. */
export async function deleteType(db: SupabaseClient, ctx: PmCtx, id: string): Promise<Result<{ deleted: number }>> {
  if (!UUID_RE.test(id)) return fail("No such type.", 404);
  const { count } = await db.from("pm_blocks").select("id", { count: "exact", head: true }).eq("type_id", id).eq("space_id", ctx.spaceId);
  if (count && count > 0) return fail(`That type is on ${count} ${count === 1 ? "block" : "blocks"}. Change them first.`, 409);
  const { data, error } = await db.from("pm_block_types").delete().eq("id", id).eq("space_id", ctx.spaceId).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("No such type.", 404);
  return done({ deleted: data.length });
}

// ---------------------------------------------------------------------------
// pets

export async function addPet(db: SupabaseClient, ctx: PmCtx, body: Record<string, unknown>): Promise<Result<PmPet>> {
  const name = str(body.name, 40);
  if (!name) return fail("A pet needs a name.");
  const { data, error } = await db.from("pm_pets").insert({ space_id: ctx.spaceId, created_by: ctx.uid, name, kind: str(body.kind, 30) ?? "dog", notes: str(body.notes, 300) }).select("id, name, kind, notes").single();
  if (error) return dbFail(error);
  return done(data as PmPet);
}

export async function deletePet(db: SupabaseClient, ctx: PmCtx, id: string): Promise<Result<{ deleted: number }>> {
  if (!UUID_RE.test(id)) return fail("No such pet.", 404);
  const { data, error } = await db.from("pm_pets").delete().eq("id", id).eq("space_id", ctx.spaceId).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail("No such pet.", 404);
  return done({ deleted: data.length });
}

// ---------------------------------------------------------------------------
// "late one tonight"

export async function setWakingOverride(db: SupabaseClient, ctx: PmCtx, body: Record<string, unknown>): Promise<Result<WakingOverride | { cleared: true }>> {
  const day = typeof body.day === "string" && DATE_RE.test(body.day) && !Number.isNaN(Date.parse(`${body.day}T00:00:00Z`)) ? body.day : null;
  if (!day) return fail("day is a date (YYYY-MM-DD).");
  const person = typeof body.person_id === "string" && ctx.people.some((p) => p.id === body.person_id) ? body.person_id : ctx.uid;
  if (body.day_end === null || body.clear === true) {
    const { error } = await db.from("pm_waking").delete().eq("space_id", ctx.spaceId).eq("person_id", person).eq("day", day);
    if (error) return dbFail(error);
    return done({ cleared: true as const });
  }
  if (typeof body.day_end !== "string" || !HM_RE.test(body.day_end)) return fail("day_end is HH:mm.");
  const { data, error } = await db
    .from("pm_waking")
    .upsert({ space_id: ctx.spaceId, created_by: ctx.uid, person_id: person, day, day_end: body.day_end }, { onConflict: "space_id,person_id,day" })
    .select("id, person_id, day, day_end")
    .single();
  if (error) return dbFail(error);
  return done(data as WakingOverride);
}

/** A new inbox token for the caller, returned once. The hint (last four) is what settings shows afterwards. */
export async function newInboxToken(db: SupabaseClient, ctx: PmCtx): Promise<Result<{ token: string; hint: string }>> {
  try {
    const token = await rotateInboxToken(db, ctx.spaceId, ctx.uid);
    return done({ token, hint: `…${token.slice(-4)}` });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The token could not be made.", 500);
  }
}
