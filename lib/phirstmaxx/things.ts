/**
 * PhirstMaxx — things on the server (claude/phirstmaxx-spec.md §6, §8):
 * the researched cards, their facts with sources, travel per person, and
 * the hand edits research must never overwrite.
 *
 *   listThings()   the Things page: filters for fits-this-week, indoor, dog,
 *                  distance, cost and words; each card carries the drive
 *                  from the caller's home when travel has been fetched.
 *   thingDetail()  one thing: every fact grouped by key with its source
 *                  line, travel per person per mode with the provider, the
 *                  fit list and the next fit in words.
 *   patchThing()   a hand edit: the column is written, the key goes into
 *                  hand_edited, and a "person" fact records it (spec §2.4).
 *   listDrops()    the newest drops with the thing each resolved to.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fitsForThing, thingsForWindow } from "./fitting";
import { UUID_RE, int, str } from "./http";
import { DROP_COLS, type PmCtx } from "./server";
import type { FitResult, PmDrop, PmFact, PmThing, PmTravel } from "./types";

export const THING_COLS =
  "id, name, kind, lat, lng, address, status, min_minutes, max_minutes, indoor, dog_rule, cost_pence, image_path, summary, tags, best_time_of_day, seasons, stars, hand_edited, done_count, last_researched_at, next_recheck_at, created_at, updated_at, old_id";
const FACT_COLS = "id, thing_id, key, value, source_url, source_kind, confidence, checked_at, edited_by_user";
const TRAVEL_COLS = "id, thing_id, origin_place_id, mode, minutes, km, provider, fetched_at";
const DOG_RULES = ["yes", "no", "outside_only", "unknown"] as const;

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (error: string, status = 400): Result<never> => ({ ok: false, status, error });
const done = <T>(value: T): Result<T> => ({ ok: true, value });
const dbFail = (err: { code?: string; message: string }): Result<never> => (err.code === "42501" ? fail("You cannot change this space.", 403) : fail(err.message, 400));

export type ThingRow = PmThing & { tags: string[]; best_time_of_day: string[]; seasons: string[]; stars: Record<string, number>; hand_edited: string[]; last_researched_at: string | null; next_recheck_at: string | null };

/** What the Things page shows per card. The image is fetched by id, never by path. */
export type ThingCard = Omit<ThingRow, "image_path"> & {
  has_image: boolean;
  /** From the caller's home, by car, when travel has been fetched. */
  from_home: { minutes: number; km: number | null; provider: string } | null;
  /** The fit for the coming week, when asked for. */
  fit: FitResult | null;
};

export type ThingFilters = {
  fits?: "week" | null;
  indoor?: boolean | null;
  dog?: "yes" | null;
  max_km?: number | null;
  max_cost_pence?: number | null;
  q?: string | null;
  archived?: boolean;
};

/** The query string as filters. `max_cost` is in pounds on the wire. */
export function parseThingFilters(sp: URLSearchParams): ThingFilters {
  const num = (k: string) => {
    const v = sp.get(k);
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const cost = num("max_cost");
  return {
    fits: sp.get("fits") === "week" ? "week" : null,
    indoor: sp.get("indoor") === "1" ? true : sp.get("indoor") === "0" ? false : null,
    dog: sp.get("dog") === "yes" ? "yes" : null,
    max_km: num("max_km"),
    max_cost_pence: cost === null ? null : Math.round(cost * 100),
    q: str(sp.get("q"), 80),
    archived: sp.get("archived") === "1",
  };
}

const card = (t: ThingRow, from: ThingCard["from_home"], fit: FitResult | null): ThingCard => {
  const { image_path, ...rest } = t;
  return { ...rest, has_image: !!image_path, from_home: from, fit };
};

export async function listThings(db: SupabaseClient, ctx: PmCtx, f: ThingFilters): Promise<ThingCard[]> {
  let q = db.from("pm_things").select(THING_COLS).eq("space_id", ctx.spaceId).order("created_at", { ascending: false }).limit(300);
  q = f.archived ? q.eq("status", "archived") : q.neq("status", "archived");
  if (f.indoor !== null && f.indoor !== undefined) q = q.eq("indoor", f.indoor);
  if (f.dog === "yes") q = q.in("dog_rule", ["yes", "outside_only"]);
  if (f.max_cost_pence !== null && f.max_cost_pence !== undefined) q = q.lte("cost_pence", f.max_cost_pence);
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    q = q.or(`name.ilike.${like},summary.ilike.${like},address.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let things = (data ?? []) as ThingRow[];

  // the drive from the caller's home, when there is one and it has been fetched
  const fromHome = new Map<string, ThingCard["from_home"]>();
  if (ctx.me.home_place_id && things.length) {
    const { data: travel } = await db.from("pm_travel").select(TRAVEL_COLS).eq("origin_place_id", ctx.me.home_place_id).eq("mode", "drive").in("thing_id", things.map((t) => t.id));
    for (const t of (travel ?? []) as PmTravel[]) fromHome.set(t.thing_id, { minutes: t.minutes, km: t.km, provider: t.provider });
  }
  if (f.max_km !== null && f.max_km !== undefined) {
    // no distance yet means the filter cannot say no: the card stays, marked unknown
    things = things.filter((t) => {
      const tr = fromHome.get(t.id);
      return !tr || tr.km === null || tr.km <= f.max_km!;
    });
  }

  const fits = new Map<string, FitResult>();
  if (f.fits === "week" && things.length) {
    const now = Date.now();
    const ranked = await thingsForWindow(db, ctx.spaceId, { start: now, end: now + 7 * 86_400_000 });
    for (const r of ranked) if (r.fit.verdict !== "no") fits.set(r.thing.id, r.fit);
    things = things.filter((t) => fits.has(t.id));
  }
  return things.map((t) => card(t, fromHome.get(t.id) ?? null, fits.get(t.id) ?? null));
}

export type TravelLine = PmTravel & { place_label: string; person_id: string | null };
export type ThingDetail = {
  thing: ThingCard;
  facts: Record<string, PmFact[]>;
  /** Travel grouped by whose start point it is; null person = a shared place. */
  travel: TravelLine[];
  fits: FitResult[];
  next: { result: FitResult; text: string } | null;
  drops: PmDrop[];
  /** When research has found nothing yet, or stopped on a question. */
  question: string | null;
};

export async function thingDetail(db: SupabaseClient, ctx: PmCtx, id: string): Promise<Result<ThingDetail>> {
  if (!UUID_RE.test(id)) return fail("No such thing.", 404);
  const { data, error } = await db.from("pm_things").select(THING_COLS).eq("id", id).eq("space_id", ctx.spaceId).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such thing.", 404);
  const thing = data as ThingRow;
  const [facts, travel, drops, fit] = await Promise.all([
    db.from("pm_thing_facts").select(FACT_COLS).eq("thing_id", id).order("key").order("confidence", { ascending: false }),
    db.from("pm_travel").select(`${TRAVEL_COLS}, origin:pm_places!pm_travel_origin_place_id_fkey(label, person_id)`).eq("thing_id", id),
    db.from("pm_drops").select(DROP_COLS).eq("thing_id", id).order("received_at", { ascending: false }).limit(20),
    fitsForThing(db, ctx.spaceId, id, { weeks: 8 }).catch((e: unknown) => {
      // the card is still useful without a fit (spec §2.2); say so rather than fail
      console.error("[phirstmaxx] fit:", e);
      return { results: [] as FitResult[], next: null };
    }),
  ]);
  const grouped: Record<string, PmFact[]> = {};
  for (const f of (facts.data ?? []) as PmFact[]) (grouped[f.key] ??= []).push(f);
  const lines: TravelLine[] = ((travel.data ?? []) as unknown as Array<PmTravel & { origin: { label: string; person_id: string | null } | null }>).map(({ origin, ...t }) => ({ ...t, place_label: origin?.label ?? "Somewhere", person_id: origin?.person_id ?? null }));
  const home = ctx.me.home_place_id ? lines.find((l) => l.origin_place_id === ctx.me.home_place_id && l.mode === "drive") : null;
  const dropRows = (drops.data ?? []) as PmDrop[];
  return done({
    thing: card(thing, home ? { minutes: home.minutes, km: home.km, provider: home.provider } : null, null),
    facts: grouped,
    travel: lines.sort((a, b) => (a.person_id ?? "").localeCompare(b.person_id ?? "") || a.mode.localeCompare(b.mode)),
    fits: fit.results,
    next: fit.next,
    drops: dropRows,
    question: thing.status === "needs_answer" ? (dropRows.find((d) => d.question && !d.answer)?.question ?? null) : null,
  });
}

/** The columns a person may set by hand, and how each is checked. */
const HAND_EDITS: Record<string, (v: unknown, ctx: PmCtx) => { ok: true; value: unknown } | { ok: false; error: string }> = {
  name: (v) => (str(v, 160) ? { ok: true, value: str(v, 160) } : { ok: false, error: "A name is needed." }),
  kind: (v) => (v === null ? { ok: true, value: null } : str(v, 60) ? { ok: true, value: str(v, 60) } : { ok: false, error: "kind is a word or two." }),
  min_minutes: (v) => (v === null || int(v, 0, 10_080) !== null ? { ok: true, value: v } : { ok: false, error: "min_minutes is whole minutes." }),
  max_minutes: (v) => (v === null || int(v, 0, 10_080) !== null ? { ok: true, value: v } : { ok: false, error: "max_minutes is whole minutes." }),
  indoor: (v) => (v === null || typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: "indoor is yes, no or unknown." }),
  dog_rule: (v) => ((DOG_RULES as readonly unknown[]).includes(v) ? { ok: true, value: v } : { ok: false, error: `dog_rule is one of ${DOG_RULES.join(", ")}.` }),
  cost_pence: (v) => (v === null || int(v, 0, 100_000_000) !== null ? { ok: true, value: v } : { ok: false, error: "cost_pence is whole pence." }),
  summary: (v) => (v === null ? { ok: true, value: null } : typeof v === "string" ? { ok: true, value: v.trim().slice(0, 2000) || null } : { ok: false, error: "summary is text." }),
  address: (v) => (v === null ? { ok: true, value: null } : str(v, 300) ? { ok: true, value: str(v, 300) } : { ok: false, error: "address is text." }),
  stars: (v) => (int(v, 0, 3) !== null ? { ok: true, value: v } : { ok: false, error: "stars is 0 to 3." }),
};

/** A hand edit. `stars` is the caller's own rating inside the per-person map. */
export async function patchThing(db: SupabaseClient, ctx: PmCtx, id: string, body: Record<string, unknown>): Promise<Result<ThingRow>> {
  if (!UUID_RE.test(id)) return fail("No such thing.", 404);
  const { data: cur, error: curErr } = await db.from("pm_things").select(THING_COLS).eq("id", id).eq("space_id", ctx.spaceId).maybeSingle();
  if (curErr) return dbFail(curErr);
  if (!cur) return fail("No such thing.", 404);
  const thing = cur as ThingRow;
  const patch: Record<string, unknown> = {};
  const edited = new Set(thing.hand_edited ?? []);
  const facts: Array<{ key: string; value: unknown }> = [];
  for (const [key, check] of Object.entries(HAND_EDITS)) {
    if (!(key in body)) continue;
    const r = check(body[key], ctx);
    if (!r.ok) return fail(r.error);
    if (key === "stars") {
      patch.stars = { ...(thing.stars ?? {}), [ctx.uid]: r.value as number };
      continue; // a rating is a preference, not a fact about the place
    }
    patch[key] = r.value;
    edited.add(key);
    facts.push({ key, value: r.value });
  }
  if (Object.keys(patch).length === 0) return fail("Nothing to change.");
  if (thing.min_minutes !== null || "min_minutes" in patch || "max_minutes" in patch) {
    const lo = ("min_minutes" in patch ? patch.min_minutes : thing.min_minutes) as number | null;
    const hi = ("max_minutes" in patch ? patch.max_minutes : thing.max_minutes) as number | null;
    if (lo !== null && hi !== null && hi < lo) return fail("The longest stay is at least the shortest.");
  }
  patch.hand_edited = [...edited];
  patch.updated_at = new Date().toISOString();
  const { data, error } = await db.from("pm_things").update(patch).eq("id", id).eq("space_id", ctx.spaceId).select(THING_COLS).single();
  if (error) return dbFail(error);
  if (facts.length) {
    // one "person" fact per key: the latest hand edit replaces the one before
    await db.from("pm_thing_facts").delete().eq("thing_id", id).eq("source_kind", "person").in("key", facts.map((f) => f.key));
    const { error: fErr } = await db.from("pm_thing_facts").insert(facts.map((f) => ({ space_id: ctx.spaceId, created_by: ctx.uid, thing_id: id, key: f.key, value: f.value, source_kind: "person", confidence: 1, edited_by_user: true })));
    if (fErr) console.error("[phirstmaxx] hand-edit fact not written:", fErr.message);
  }
  return done(data as ThingRow);
}

export async function setThingStatus(db: SupabaseClient, ctx: PmCtx, id: string, status: "archived" | "ready" | "researching"): Promise<Result<ThingRow>> {
  if (!UUID_RE.test(id)) return fail("No such thing.", 404);
  const { data, error } = await db.from("pm_things").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("space_id", ctx.spaceId).select(THING_COLS).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("No such thing.", 404);
  return done(data as ThingRow);
}

export type DropWithThing = PmDrop & { thing: Pick<PmThing, "id" | "name" | "status" | "summary" | "kind"> | null; research: Array<{ stage: string; status: string; error: string | null }> };

/** The space's drops, newest first, each with the thing it resolved to and where its research stands. */
export async function listDrops(db: SupabaseClient, ctx: PmCtx, limit = 50): Promise<DropWithThing[]> {
  const { data, error } = await db
    .from("pm_drops")
    .select(`${DROP_COLS}, thing:pm_things(id, name, status, summary, kind), research:pm_research_runs(stage, status, error)`)
    .eq("space_id", ctx.spaceId)
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...(r as unknown as DropWithThing), thing: (r.thing as DropWithThing["thing"]) ?? null, research: (r.research as DropWithThing["research"]) ?? [] }));
}
