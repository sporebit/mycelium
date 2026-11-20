/**
 * The family space's lists, one definition each: what a request may set,
 * how the rows are read, and what is added on the way out (a running
 * total, who paid what, the votes). The routes under /api/family only
 * dispatch here. Every read and write is the caller's, under the row
 * rules; the checks here are about shape, not permission.
 */
import { tapToRow, type LogRow, summarise } from "./babylog";
import { listTotals, monthMoney, nextBinDay, parseBinSchedule, parsePounds, type Cost } from "./money";
import { londonToday, UUID_RE, type FamilyCtx } from "./server";
import { isDate, weekOf } from "./weeks";

export type Result<T = unknown> = { ok: true; value: T; status?: number } | { ok: false; status: number; error: string };
const fail = (error: string, status = 400): Result<never> => ({ ok: false, status, error });
const done = <T>(value: T, status = 200): Result<T> => ({ ok: true, value, status });
type Body = Record<string, unknown>;
type Cols = Record<string, unknown>;

export const RESOURCES = ["entries", "names", "list-items", "baby-log", "household", "costs"] as const;
export type ResourceName = (typeof RESOURCES)[number];
export const isResource = (v: string): v is ResourceName => (RESOURCES as readonly string[]).includes(v);

const TABLE: Record<ResourceName, string> = {
  entries: "family_entries",
  names: "family_names",
  "list-items": "family_list_items",
  "baby-log": "baby_log",
  household: "household_items",
  costs: "household_costs",
};

// ---------------------------------------------------------------------------
// Small validators. Each returns the cleaned value, or a sentence.

class Bad extends Error {}
const bad = (message: string): never => {
  throw new Bad(message);
};
const str = (v: unknown, name: string, max: number): string => {
  if (typeof v !== "string" || !v.trim()) return bad(`${name} is needed.`);
  if (v.trim().length > max) return bad(`${name} is at most ${max} characters.`);
  return v.trim();
};
const optStr = (v: unknown, name: string, max: number): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return bad(`${name} is text.`);
  return v.trim().slice(0, max) || null;
};
const optDate = (v: unknown, name: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  return isDate(v) ? v : bad(`${name} is a date (YYYY-MM-DD).`);
};
const optTime = (v: unknown, name: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? bad(`${name} is a date and time.`) : new Date(t).toISOString();
};
const oneOf = <T extends string>(v: unknown, name: string, allowed: readonly T[]): T => ((allowed as readonly unknown[]).includes(v) ? (v as T) : bad(`${name} is one of ${allowed.join(", ")}.`));
const money = (body: Body, pounds: string, pence: string, name: string, required: boolean): number | null | undefined => {
  if (pence in body) {
    const n = body[pence];
    if (n === null && !required) return null;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : bad(`${name} is an amount.`);
  }
  if (pounds in body) {
    const raw = body[pounds];
    if ((raw === null || raw === "") && !required) return null;
    const n = parsePounds(raw);
    return n === null || n > 100_000_000 ? bad(`${name} is an amount, like 12.50.`) : n;
  }
  return required ? bad(`${name} is needed.`) : undefined;
};

const ENTRY_KINDS = ["note", "scan", "appointment", "milestone", "photo", "letter"] as const;
const HOUSEHOLD_KINDS = ["document", "warranty", "bin", "other"] as const;
const COST_CATEGORIES = ["bill", "baby", "house", "food", "other"] as const;
const RECURS = ["none", "monthly", "yearly"] as const;

/** The columns a request body sets. `partial` is a change to an existing row: only what is present. */
async function columns(name: ResourceName, body: Body, ctx: FamilyCtx, partial: boolean): Promise<Cols> {
  const has = (k: string) => k in body;
  const c: Cols = {};
  switch (name) {
    case "entries": {
      if (!partial) c.kind = oneOf(body.kind ?? "note", "kind", ENTRY_KINDS);
      if (!partial || has("title")) c.title = str(body.title, "A title", 200);
      if (has("body")) c.body = optStr(body.body, "The text", 20_000);
      if (has("place")) c.place = optStr(body.place, "The place", 200);
      if (has("prompt")) c.prompt = optStr(body.prompt, "The question", 400);
      if (has("starts_at")) {
        c.starts_at = optTime(body.starts_at, "The time");
        // an appointment sits on the timeline on its own day, in London
        if (c.starts_at) c.happened_on = londonToday(new Date(c.starts_at as string)).today;
      }
      if (has("happened_on") && !c.happened_on) {
        const d = optDate(body.happened_on, "The date");
        if (d) c.happened_on = d;
      }
      if (!partial && c.kind === "appointment" && !c.starts_at) bad("An appointment needs a date and time.");
      return c;
    }
    case "names": {
      if (!partial || has("name")) c.name = str(body.name, "A name", 60);
      if (has("note")) c.note = optStr(body.note, "The note", 300);
      return c;
    }
    case "list-items": {
      if (!partial) {
        const listId = typeof body.list_id === "string" && UUID_RE.test(body.list_id) ? body.list_id : bad("list_id is a list.");
        const { data } = await ctx.supabase.from("family_lists").select("id").eq("id", listId).eq("space_id", ctx.spaceId).maybeSingle();
        if (!data) bad("No such list.");
        c.list_id = listId;
      }
      if (!partial || has("title")) c.title = str(body.title, "What it is", 200);
      const price = money(body, "price", "price_pence", "The price", false);
      if (price !== undefined) c.price_pence = price;
      if (has("qty")) {
        const q = Number(body.qty);
        c.qty = Number.isInteger(q) && q >= 1 && q <= 999 ? q : bad("How many is a whole number from 1.");
      }
      if (has("link")) {
        const l = optStr(body.link, "The link", 1000);
        c.link = l === null || /^https?:\/\//i.test(l) ? l : bad("The link starts with http:// or https://.");
      }
      if (has("note")) c.note = optStr(body.note, "The note", 500);
      if (has("sort")) c.sort = Number.isInteger(body.sort) ? body.sort : bad("sort is a whole number.");
      if (has("bought")) {
        if (typeof body.bought !== "boolean") bad("bought is yes or no.");
        c.bought = body.bought;
        // who ticked it and when: the server's word, not the request's
        c.bought_by = body.bought ? ctx.uid : null;
        c.bought_at = body.bought ? new Date().toISOString() : null;
      }
      return c;
    }
    case "baby-log": {
      if (!partial) {
        const tap = tapToRow(body, new Date());
        if (!tap.ok) return bad(tap.error);
        return { ...tap.row };
      }
      if (has("ended_at")) c.ended_at = body.ended_at === "now" ? new Date().toISOString() : optTime(body.ended_at, "The end");
      if (has("started_at")) c.started_at = optTime(body.started_at, "The start") ?? bad("The start is needed.");
      if (has("note")) c.note = optStr(body.note, "The note", 500);
      return c;
    }
    case "household": {
      if (!partial) c.kind = oneOf(body.kind ?? "other", "kind", HOUSEHOLD_KINDS);
      if (!partial || has("title")) c.title = str(body.title, "A title", 200);
      if (has("note")) c.note = optStr(body.note, "The note", 2000);
      if (has("expires_on")) c.expires_on = optDate(body.expires_on, "The date it runs out");
      if (has("schedule")) {
        if (body.schedule === null) c.schedule = null;
        else c.schedule = parseBinSchedule(body.schedule) ?? bad("A bin needs a weekday (0 to 6, Sunday is 0), every 1 to 4 weeks, and a date it is collected on.");
      }
      return c;
    }
    case "costs": {
      if (!partial || has("title")) c.title = str(body.title, "What it was for", 200);
      const amount = money(body, "amount", "amount_pence", "The amount", !partial);
      if (amount !== undefined) c.amount_pence = amount;
      if (has("paid_by")) {
        const p = body.paid_by;
        if (p === null || p === "") c.paid_by = null;
        else c.paid_by = typeof p === "string" && ctx.members.some((m) => m.id === p) ? p : bad("Whoever paid is someone in the family space.");
      } else if (!partial) c.paid_by = ctx.uid;
      if (has("paid_on")) {
        const d = optDate(body.paid_on, "The date");
        if (d) c.paid_on = d;
      }
      if (has("category")) c.category = oneOf(body.category, "category", COST_CATEGORIES);
      if (has("recurs")) c.recurs = oneOf(body.recurs, "recurs", RECURS);
      if (has("note")) c.note = optStr(body.note, "The note", 500);
      return c;
    }
  }
}

const TOUCHED: readonly ResourceName[] = ["entries", "list-items", "household", "costs"];
const writeStatus = (code: string | undefined) => (code === "42501" ? 403 : code === "23505" ? 409 : 400);
const writeMessage = (name: ResourceName, e: { code?: string; message?: string }) =>
  e.code === "42501" ? "Your role in this team cannot change that." : e.code === "23505" ? (name === "names" ? "That name is already on the list." : "That is already there.") : (e.message ?? "That could not be saved.");

export async function createRow(name: ResourceName, body: Body, ctx: FamilyCtx, extra: Cols = {}): Promise<Result> {
  try {
    const cols = await columns(name, body, ctx, false);
    if (name === "baby-log" && cols.kind === "sleep") {
      const { data: open } = await ctx.supabase.from("baby_log").select("id, started_at").eq("space_id", ctx.spaceId).eq("kind", "sleep").is("ended_at", null).limit(1);
      if ((open ?? []).length > 0) return fail("A sleep is already running. Stop that one first.", 409);
    }
    const { data, error } = await ctx.supabase.from(TABLE[name]).insert({ ...cols, ...extra, space_id: ctx.spaceId }).select("*").single();
    if (error || !data) return fail(writeMessage(name, error ?? {}), writeStatus(error?.code));
    return done(data, 201);
  } catch (e) {
    if (e instanceof Bad) return fail(e.message);
    throw e;
  }
}

export async function updateRow(name: ResourceName, id: string, body: Body, ctx: FamilyCtx): Promise<Result> {
  if (!UUID_RE.test(id)) return fail("not found", 404);
  try {
    const cols = await columns(name, body, ctx, true);
    if (Object.keys(cols).length === 0) return fail("Nothing to change.");
    if (TOUCHED.includes(name)) cols.updated_at = new Date().toISOString();
    const { data, error } = await ctx.supabase.from(TABLE[name]).update(cols).eq("id", id).eq("space_id", ctx.spaceId).select("*");
    if (error) return fail(writeMessage(name, error), writeStatus(error.code));
    if (!data || data.length === 0) return fail("not found", 404);
    return done(data[0]);
  } catch (e) {
    if (e instanceof Bad) return fail(e.message);
    throw e;
  }
}

export async function deleteRow(name: ResourceName, id: string, ctx: FamilyCtx): Promise<Result> {
  if (!UUID_RE.test(id)) return fail("not found", 404);
  // a file goes with its row
  let path: string | null = null;
  if (name === "entries" || name === "household") {
    const col = name === "entries" ? "media_path" : "file_path";
    const { data } = await ctx.supabase.from(TABLE[name]).select(col).eq("id", id).eq("space_id", ctx.spaceId).maybeSingle();
    path = ((data as Record<string, string | null> | null)?.[col] as string | null) ?? null;
  }
  const { data, error } = await ctx.supabase.from(TABLE[name]).delete().eq("id", id).eq("space_id", ctx.spaceId).select("id");
  if (error) return fail(writeMessage(name, error), writeStatus(error.code));
  if (!data || data.length === 0) return fail("not found", 404);
  if (path) await ctx.supabase.storage.from("family").remove([path]);
  return done({ ok: true });
}

// ---------------------------------------------------------------------------
// Reading

export async function listRows(name: ResourceName, sp: URLSearchParams, ctx: FamilyCtx, now: Date = new Date()): Promise<Result> {
  const { supabase, spaceId } = ctx;
  const { today, dayStart } = londonToday(now);
  switch (name) {
    case "entries": {
      let q = supabase
        .from("family_entries")
        .select("id, kind, title, body, happened_on, starts_at, place, media_path, media_mime, prompt, transcribed, source, created_by, created_at")
        .eq("space_id", spaceId)
        .order("happened_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80);
      const kind = sp.get("kind");
      if (kind && (ENTRY_KINDS as readonly string[]).includes(kind)) q = q.eq("kind", kind);
      const before = sp.get("before");
      if (before && isDate(before)) q = q.lt("happened_on", before);
      const { data, error } = await q;
      if (error) return fail(error.message, 500);
      const rows = (data ?? []) as Array<Record<string, unknown> & { happened_on: string; media_path: string | null }>;
      return done({
        entries: rows.map(({ media_path, ...r }) => ({ ...r, has_media: !!media_path, week: weekOf(ctx.profile.due_on, r.happened_on) })),
        more: rows.length === 80 ? rows[rows.length - 1].happened_on : null,
      });
    }
    case "names": {
      const [names, votes] = await Promise.all([
        supabase.from("family_names").select("id, name, note, created_by, created_at").eq("space_id", spaceId).order("created_at").limit(500),
        supabase.from("family_name_votes").select("name_id, voter_id, vote").eq("space_id", spaceId).limit(5000),
      ]);
      if (names.error) return fail(names.error.message, 500);
      const byName = new Map<string, Array<{ voter_id: string; vote: number }>>();
      for (const v of (votes.data ?? []) as Array<{ name_id: string; voter_id: string; vote: number }>) byName.set(v.name_id, [...(byName.get(v.name_id) ?? []), { voter_id: v.voter_id, vote: v.vote }]);
      const rows = ((names.data ?? []) as Array<{ id: string; name: string }>).map((n) => {
        const vs = byName.get(n.id) ?? [];
        return { ...n, votes: vs, mine: vs.find((v) => v.voter_id === ctx.uid)?.vote ?? null, score: vs.reduce((s, v) => s + v.vote, 0), everyone: ctx.members.length > 1 && ctx.members.every((m) => vs.some((v) => v.voter_id === m.id && v.vote > 0)) };
      });
      // the ones everybody likes first, then by score, then as added
      rows.sort((a, b) => Number(b.everyone) - Number(a.everyone) || b.score - a.score);
      return done({ names: rows });
    }
    case "list-items": {
      const [lists, items] = await Promise.all([
        supabase.from("family_lists").select("id, slug, title, sort").eq("space_id", spaceId).order("sort").order("created_at"),
        supabase.from("family_list_items").select("id, list_id, title, price_pence, qty, bought, bought_by, bought_at, link, note, sort").eq("space_id", spaceId).order("sort").order("created_at").limit(2000),
      ]);
      if (lists.error) return fail(lists.error.message, 500);
      type Item = { list_id: string; price_pence: number | null; qty: number; bought: boolean };
      const all = (items.data ?? []) as Item[];
      const out = ((lists.data ?? []) as Array<{ id: string }>).map((l) => {
        const mine = all.filter((i) => i.list_id === l.id);
        return { ...l, items: mine, totals: listTotals(mine) };
      });
      return done({ lists: out, totals: listTotals(all) });
    }
    case "baby-log": {
      const since = new Date(now.getTime() - 72 * 3_600_000).toISOString();
      const { data, error } = await supabase.from("baby_log").select("id, kind, started_at, ended_at, detail, note, created_by").eq("space_id", spaceId).gte("started_at", since).order("started_at", { ascending: false }).limit(400);
      if (error) return fail(error.message, 500);
      const rows = (data ?? []) as LogRow[];
      return done({ rows, summary: summarise(rows, now, dayStart) });
    }
    case "household": {
      const { data, error } = await supabase.from("household_items").select("id, kind, title, note, expires_on, file_path, file_mime, schedule, created_at").eq("space_id", spaceId).order("kind").order("title").limit(1000);
      if (error) return fail(error.message, 500);
      const rows = ((data ?? []) as Array<Record<string, unknown> & { file_path: string | null; schedule: unknown; expires_on: string | null }>).map(({ file_path, ...r }) => {
        const s = parseBinSchedule(r.schedule);
        return { ...r, has_file: !!file_path, next_on: s ? nextBinDay(s, today) : null };
      });
      return done({ items: rows, today });
    }
    case "costs": {
      const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? (sp.get("month") as string) : today.slice(0, 7);
      const [y, m] = month.split("-").map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("household_costs")
        .select("id, title, amount_pence, paid_by, paid_on, category, recurs, recurs_from, note, created_at")
        .eq("space_id", spaceId)
        .gte("paid_on", `${month}-01`)
        .lt("paid_on", `${next}-01`)
        .order("paid_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) return fail(error.message, 500);
      return done({ costs: data ?? [], month, money: monthMoney((data ?? []) as Cost[], month, ctx.members.map((p) => p.id)) });
    }
  }
}

/** A vote on a name: 2 love, 1 like, -1 not this one; null takes it back. Only ever the caller's own. */
export async function voteOnName(id: string, vote: unknown, ctx: FamilyCtx): Promise<Result> {
  if (!UUID_RE.test(id)) return fail("not found", 404);
  const { data: name } = await ctx.supabase.from("family_names").select("id").eq("id", id).eq("space_id", ctx.spaceId).maybeSingle();
  if (!name) return fail("not found", 404);
  if (vote === null) {
    const { error } = await ctx.supabase.from("family_name_votes").delete().eq("name_id", id).eq("voter_id", ctx.uid);
    return error ? fail(error.message, writeStatus(error.code)) : done({ ok: true, vote: null });
  }
  if (vote !== 2 && vote !== 1 && vote !== -1) return fail("vote is 2, 1, -1 or null.");
  const { error } = await ctx.supabase
    .from("family_name_votes")
    .upsert({ space_id: ctx.spaceId, name_id: id, voter_id: ctx.uid, vote, voted_at: new Date().toISOString() }, { onConflict: "name_id,voter_id" });
  return error ? fail(writeMessage("names", error), writeStatus(error.code)) : done({ ok: true, vote });
}
