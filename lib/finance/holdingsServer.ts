/**
 * By-hand holdings and the net-worth line — server side (master run §10).
 * Everything runs as the caller against finance tables, which are theirs
 * alone. Nothing here calls a model or a feed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { londonClock } from "@/lib/daylog/day";
import { statusIdFor } from "@/lib/tickets/server";
import { ageWords, freshness, type Freshness, type HoldingKind, type HoldingValue, netWorthSeries, type NetWorthPoint, storedPence } from "./netWorth";

export type Holding = {
  id: string;
  kind: HoldingKind;
  name: string;
  note: string | null;
  /** The latest figure, or null when none has been given yet. */
  value_pence: number | null;
  as_of: string | null;
  /** How old the latest figure is, in words; null when there is none. */
  age: string | null;
  freshness: Freshness | null;
  /** How many figures have been given over time. */
  figures: number;
};

type HoldingRow = { id: string; kind: HoldingKind; name: string; note: string | null };
type ValueRow = { holding_id: string; value_pence: number; as_of: string };

async function loadValues(db: SupabaseClient): Promise<ValueRow[]> {
  const out: ValueRow[] = [];
  for (let start = 0; start < 20_000; start += 1000) {
    const { data, error } = await db.from("finance_holding_values").select("holding_id, value_pence, as_of").order("as_of").order("holding_id").range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as ValueRow[]).map((r) => ({ ...r, value_pence: Number(r.value_pence) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadHoldings(db: SupabaseClient): Promise<HoldingRow[]> {
  const { data, error } = await db.from("finance_holdings").select("id, kind, name, note").order("created_at").limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as HoldingRow[];
}

function describe(rows: HoldingRow[], values: ValueRow[], today: string): Holding[] {
  const latest = new Map<string, ValueRow>();
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v.holding_id, (counts.get(v.holding_id) ?? 0) + 1);
    const cur = latest.get(v.holding_id);
    if (!cur || v.as_of > cur.as_of) latest.set(v.holding_id, v);
  }
  return rows.map((h) => {
    const l = latest.get(h.id);
    return {
      ...h,
      value_pence: l ? l.value_pence : null,
      as_of: l ? l.as_of : null,
      age: l ? ageWords(l.as_of, today) : null,
      freshness: l ? freshness(l.as_of, today) : null,
      figures: counts.get(h.id) ?? 0,
    };
  });
}

export async function listHoldings(db: SupabaseClient): Promise<Holding[]> {
  const [rows, values] = await Promise.all([loadHoldings(db), loadValues(db)]);
  return describe(rows, values, londonClock().date);
}

export type NetWorthView = {
  today: string;
  holdings: Holding[];
  /** The line, oldest first: a point for every day the sheet or a holding changed. */
  series: NetWorthPoint[];
  /** The latest point, or null when there is nothing yet. */
  now: NetWorthPoint | null;
  /** The sheet's latest snapshot date, so the page can say how old that side is. */
  sheet_as_of: string | null;
  /** What the Investments page's unsold holdings come to at their last prices: shown apart, never added (the sheet may already count them). */
  investments_pence: number;
};

export async function netWorthView(db: SupabaseClient, months = 36): Promise<NetWorthView> {
  const today = londonClock().date;
  const from = new Date(Date.parse(`${today}T00:00:00Z`));
  from.setUTCMonth(from.getUTCMonth() - months);
  const since = from.toISOString().slice(0, 10);
  const [rows, values, snapsRes, invRes] = await Promise.all([
    loadHoldings(db),
    loadValues(db),
    db.from("finance_snapshots").select("snapshot_date, snapshot").gte("snapshot_date", since).order("snapshot_date").limit(2000),
    db.from("investments").select("quantity, buy_price, current_price, sold").limit(1000),
  ]);
  if (snapsRes.error) throw new Error(snapsRes.error.message);
  if (invRes.error) throw new Error(invRes.error.message);
  const kinds = new Map(rows.map((h) => [h.id, h.kind]));
  const hv: HoldingValue[] = values.filter((v) => kinds.has(v.holding_id)).map((v) => ({ holding_id: v.holding_id, kind: kinds.get(v.holding_id)!, as_of: v.as_of, value_pence: v.value_pence }));
  const snaps = ((snapsRes.data ?? []) as Array<{ snapshot_date: string; snapshot: { net_worth?: unknown } | null }>)
    .filter((s) => s.snapshot && typeof s.snapshot.net_worth === "number")
    .map((s) => ({ date: s.snapshot_date, net_worth_pence: Math.round((s.snapshot!.net_worth as number) * 100) }));
  const series = netWorthSeries(snaps, hv);
  let investments = 0;
  for (const i of (invRes.data ?? []) as Array<{ quantity: number | string | null; buy_price: number | string | null; current_price: number | string | null; sold: boolean | null }>) {
    if (i.sold) continue;
    const q = Number(i.quantity ?? 0);
    const p = Number(i.current_price ?? i.buy_price ?? 0);
    if (Number.isFinite(q) && Number.isFinite(p)) investments += Math.round(q * p * 100);
  }
  return {
    today,
    holdings: describe(rows, values, today),
    series,
    now: series.length ? series[series.length - 1] : null,
    sheet_as_of: snaps.length ? snaps[snaps.length - 1].date : null,
    investments_pence: investments,
  };
}

/** A whole number of pence from a number of pounds or pence in a request body; null when none given; "bad" when unreadable. */
export function penceFrom(body: Record<string, unknown>): number | null | "bad" {
  if (typeof body.value_pence === "number") return Number.isInteger(body.value_pence) && Math.abs(body.value_pence) <= 100_000_000_000 ? body.value_pence : "bad";
  if (typeof body.value_pounds === "number") return Number.isFinite(body.value_pounds) && Math.abs(body.value_pounds) <= 1_000_000_000 ? Math.round(body.value_pounds * 100) : "bad";
  if (body.value_pence === null || body.value_pounds === null || (body.value_pence === undefined && body.value_pounds === undefined)) return null;
  return "bad";
}

/** A real calendar day as YYYY-MM-DD (30 February is not one). */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type NewHolding = { kind: HoldingKind; name: string; note: string | null; typed_pence: number | null; as_of: string };

/** A new holding, with its first figure when one was given. */
export async function addHolding(db: SupabaseClient, uid: string, input: NewHolding): Promise<string> {
  const { data, error } = await db.from("finance_holdings").insert({ kind: input.kind, name: input.name, note: input.note }).select("id, space_id").single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  const id = (data as { id: string }).id;
  if (input.typed_pence !== null) await setFigure(db, id, input.kind, input.typed_pence, input.as_of);
  if (input.kind === "pension") await ensurePensionItem(db, uid, (data as { space_id: string }).space_id);
  return id;
}

/** A figure for a holding on a day; a second figure for the same day replaces the first. */
export async function setFigure(db: SupabaseClient, holdingId: string, kind: HoldingKind, typedPence: number, asOf: string): Promise<void> {
  const { error } = await db.from("finance_holding_values").upsert({ holding_id: holdingId, value_pence: storedPence(kind, typedPence), as_of: asOf }, { onConflict: "holding_id,as_of" });
  if (error) throw new Error(error.message);
}

export async function holdingKind(db: SupabaseClient, holdingId: string): Promise<HoldingKind | null> {
  const { data } = await db.from("finance_holdings").select("kind").eq("id", holdingId).maybeSingle();
  return (data?.kind as HoldingKind | undefined) ?? null;
}

export async function renameHolding(db: SupabaseClient, holdingId: string, patch: { name?: string; note?: string | null }): Promise<void> {
  const { error } = await db.from("finance_holdings").update(patch).eq("id", holdingId);
  if (error) throw new Error(error.message);
}

/** Removes the holding and every figure it ever had. */
export async function removeHolding(db: SupabaseClient, holdingId: string): Promise<void> {
  const { error } = await db.from("finance_holdings").delete().eq("id", holdingId);
  if (error) throw new Error(error.message);
}

export const PENSION_ITEM_MARK = { finance_holding: "pension" } as const;

/**
 * The small recurring item that keeps the pension figure honest (master run
 * §10: Royal London has no personal API; the value comes from the statement,
 * by hand). A spawn template in the person's own tickets, once a month on
 * the 1st; the nightly job makes each month's occurrence. Made once per
 * space, the first time a pension holding is added; never twice.
 */
export async function ensurePensionItem(db: SupabaseClient, uid: string, spaceId: string): Promise<"made" | "present"> {
  const { data: present, error } = await db.from("tickets").select("id").eq("recurrence_mode", "spawn").is("series_id", null).is("deleted_at", null).contains("meta", PENSION_ITEM_MARK).limit(1);
  if (error) throw new Error(error.message);
  if (present && present.length > 0) return "present";
  const today = londonClock().date;
  const first = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`));
  first.setUTCMonth(first.getUTCMonth() + 1);
  const row: Record<string, unknown> = {
    title: "Update the pension figure",
    description: "Open the latest Royal London statement (the email or the app), read the current value, and type it under Holdings on Finance → Snapshot with today's date. Two minutes. The net-worth line shows how old the figure is until it is done.\n\n/finance/snapshot",
    kind: "task",
    where_ctx: "anywhere",
    tools: ["phone"],
    time_window: "anytime",
    points: 1,
    recurrence_mode: "spawn",
    recurrence_rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    scheduled_on: first.toISOString().slice(0, 10),
    source: "claude",
    owner: uid,
    priority_score: 0.5,
    meta: PENSION_ITEM_MARK,
  };
  const status = await statusIdFor(db, spaceId, "next");
  if (status) row.status_id = status;
  const ins = await db.from("tickets").insert(row);
  if (ins.error) throw new Error(ins.error.message);
  return "made";
}
