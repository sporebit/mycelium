/**
 * Bills, subscriptions and the budget — server side (master run §10).
 * Everything runs as the caller against finance tables, which are theirs
 * alone. Nothing here calls a model.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { londonClock } from "@/lib/daylog/day";
import { interrupt } from "@/lib/nudges/interrupt";
import { budgetAlerts, budgetMonth, daysIn, type BudgetMonth } from "./budget";
import { findRecurring, summarise, type Mark, type Recurring, type RecurringSummary, type Txn } from "./recurring";
import { TAXONOMY } from "./taxonomy";

const MARKS: readonly Mark[] = ["keep", "cancel", "not_recurring"];
export const isMark = (v: unknown): v is Mark => typeof v === "string" && (MARKS as readonly string[]).includes(v);

/** Spending over the last `months` months, oldest first. Paged: the API returns a thousand rows at a time. */
async function loadSpend(db: SupabaseClient, months: number): Promise<Txn[]> {
  const from = new Date();
  from.setUTCMonth(from.getUTCMonth() - months);
  const since = from.toISOString().slice(0, 10);
  const out: Txn[] = [];
  for (let start = 0; start < 20_000; start += 1000) {
    const { data, error } = await db
      .from("transactions")
      .select("id, txn_date, description, enriched_merchant, amount, txn_type")
      .gte("txn_date", since)
      .lt("amount", 0)
      .order("txn_date")
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Txn[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The day the imported transactions run to; null when there are none. */
export async function dataRunsTo(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("transactions").select("txn_date").order("txn_date", { ascending: false }).limit(1);
  return ((data ?? [])[0]?.txn_date as string | undefined) ?? null;
}

export type RecurringItem = Recurring & { mark: Mark | null; note: string | null };
export type RecurringView = { summary: RecurringSummary; items: RecurringItem[]; today: string };

export async function recurringView(db: SupabaseClient): Promise<RecurringView> {
  const [txns, marksRes, asOf] = await Promise.all([loadSpend(db, 26), db.from("finance_recurring_marks").select("merchant_key, mark, note").limit(2000), dataRunsTo(db)]);
  if (marksRes.error) throw new Error(marksRes.error.message);
  const marks: Record<string, Mark> = {};
  const notes: Record<string, string | null> = {};
  for (const m of (marksRes.data ?? []) as Array<{ merchant_key: string; mark: Mark; note: string | null }>) {
    marks[m.merchant_key] = m.mark;
    notes[m.merchant_key] = m.note;
  }
  const found = findRecurring(txns, asOf ?? undefined);
  return {
    summary: summarise(found, marks, asOf),
    items: found.map((r) => ({ ...r, mark: marks[r.key] ?? null, note: notes[r.key] ?? null })),
    today: londonClock().date,
  };
}

/** Say something about a recurring payment, or take it back (`mark` null). */
export async function setMark(db: SupabaseClient, key: string, mark: Mark | null, note: string | null): Promise<void> {
  if (mark === null) {
    const { error } = await db.from("finance_recurring_marks").delete().eq("merchant_key", key);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db.from("finance_recurring_marks").upsert({ merchant_key: key, mark, note, marked_at: new Date().toISOString() }, { onConflict: "space_id,merchant_key" });
  if (error) throw new Error(error.message);
}

export type BudgetView = BudgetMonth & {
  /** The day the imported transactions run to. */
  as_of: string | null;
  /** True when the month asked for is after the newest transaction: there is nothing to compare with yet. */
  no_data: boolean;
  /** Every category a budget can be set for. */
  categories: string[];
};

export async function budgetView(db: SupabaseClient, month: string): Promise<BudgetView> {
  const asOf = await dataRunsTo(db);
  const asOfMonth = asOf?.slice(0, 7) ?? null;
  const days = daysIn(month);
  // the day of the month the data reaches: all of a past month, none of one the imports have not got to
  const day = !asOfMonth || month > asOfMonth ? 1 : month < asOfMonth ? days : Number(asOf!.slice(8, 10));
  const [budgetsRes, spendRes] = await Promise.all([
    db.from("finance_budgets").select("category, monthly_pence").limit(200),
    db.rpc("spend_by_category", { p_start: `${month}-01`, p_end: `${month}-${String(days).padStart(2, "0")}` }),
  ]);
  if (budgetsRes.error) throw new Error(budgetsRes.error.message);
  if (spendRes.error) throw new Error(spendRes.error.message);
  const budgets: Record<string, number> = {};
  for (const b of (budgetsRes.data ?? []) as Array<{ category: string; monthly_pence: number }>) budgets[b.category] = b.monthly_pence;
  const spent: Record<string, number> = {};
  for (const s of (spendRes.data ?? []) as Array<{ category: string; total: number | string }>) spent[s.category] = Math.round(Number(s.total) * 100);
  return {
    ...budgetMonth(budgets, spent, month, day),
    as_of: asOf,
    no_data: !asOfMonth || month > asOfMonth,
    categories: TAXONOMY.filter((c) => c !== "Income" && c !== "Transfer (internal)"),
  };
}

/** Set a category's monthly budget in pence, or remove it (`pence` null). */
export async function setBudget(db: SupabaseClient, category: string, pence: number | null): Promise<void> {
  if (pence === null) {
    const { error } = await db.from("finance_budgets").delete().eq("category", category);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db.from("finance_budgets").upsert({ category, monthly_pence: pence, updated_at: new Date().toISOString() }, { onConflict: "space_id,category" });
  if (error) throw new Error(error.message);
}

/**
 * The spending nudges owed for this month, sent. One at 80% and one at 100%
 * per category per month, each inside the day's three. Nothing is sent
 * about a month the imports have not reached: there is nothing to say.
 */
export async function runBudgetAlerts(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<number> {
  const today = londonClock(now).date;
  const month = today.slice(0, 7);
  const view = await budgetView(db, month);
  if (view.no_data || view.lines.every((l) => l.used === null)) return 0;
  const { data: sentRows } = await db.from("interruptions").select("title").eq("kind", "budget").gte("day", `${month}-01`).limit(200);
  const sent = new Set(((sentRows ?? []) as Array<{ title: string | null }>).map((r) => r.title ?? ""));
  let count = 0;
  for (const alert of budgetAlerts(view, sent)) {
    const res = await interrupt(db, uid, { kind: "budget", title: alert.title, url: "/finance/budget" }, now);
    if (res.sent) count += 1;
  }
  return count;
}
