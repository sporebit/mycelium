/**
 * Household money, pure: a prep list's running total, and who has paid what
 * this month. This is the family's own budget. It has nothing to do with
 * the finance section and reads nothing from it.
 */

/** "£12.50" from pence; "£1,250" when there are no pennies. */
export function pounds(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(Math.round(pence));
  const whole = Math.floor(abs / 100).toLocaleString("en-GB");
  const rest = abs % 100;
  return rest === 0 ? `${sign}£${whole}` : `${sign}£${whole}.${String(rest).padStart(2, "0")}`;
}

/** Pence from what someone typed: "12", "12.5", "£12.50", "1,250". Null when it is not an amount. */
export function parsePounds(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[£,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export type ListItem = { price_pence: number | null; qty: number; bought: boolean };
export type ListTotals = { items: number; bought: number; total_pence: number; spent_pence: number; left_pence: number; unpriced: number };

/** A list's running total: everything priced, what has been bought, what is still to buy, and how many have no price yet. */
export function listTotals(items: readonly ListItem[]): ListTotals {
  const t: ListTotals = { items: items.length, bought: 0, total_pence: 0, spent_pence: 0, left_pence: 0, unpriced: 0 };
  for (const i of items) {
    if (i.bought) t.bought += 1;
    if (i.price_pence === null) {
      if (!i.bought) t.unpriced += 1;
      continue;
    }
    const line = i.price_pence * Math.max(1, i.qty);
    t.total_pence += line;
    if (i.bought) t.spent_pence += line;
    else t.left_pence += line;
  }
  return t;
}

export type Cost = { amount_pence: number; paid_by: string | null; paid_on: string; category: string };
export type Share = { person: string | null; paid_pence: number; /** Paid more (+) or less (−) than an even share. */ over_pence: number };
export type MonthMoney = { month: string; total_pence: number; by_category: Record<string, number>; shares: Share[]; /** "A has paid £40 more than B", when exactly two people have paid or are expected to. */ even_up: { from: string; to: string; pence: number } | null };

/**
 * One month of household costs. `people` is who shares the household (the
 * team's members), so someone who has paid nothing still has a share.
 * A cost with nobody against it counts in the total and in nobody's column.
 */
export function monthMoney(costs: readonly Cost[], month: string, people: readonly string[]): MonthMoney {
  const mine = costs.filter((c) => c.paid_on.slice(0, 7) === month);
  const by_category: Record<string, number> = {};
  const paid = new Map<string | null, number>();
  for (const p of people) paid.set(p, 0);
  let total = 0;
  let attributed = 0;
  for (const c of mine) {
    total += c.amount_pence;
    by_category[c.category] = (by_category[c.category] ?? 0) + c.amount_pence;
    paid.set(c.paid_by, (paid.get(c.paid_by) ?? 0) + c.amount_pence);
    if (c.paid_by) attributed += c.amount_pence;
  }
  const payers = [...paid.keys()].filter((k): k is string => k !== null);
  const even = payers.length ? attributed / payers.length : 0;
  const shares: Share[] = [...paid.entries()].map(([person, paid_pence]) => ({ person, paid_pence, over_pence: person === null ? 0 : Math.round(paid_pence - even) }));
  shares.sort((a, b) => b.paid_pence - a.paid_pence);
  let even_up: MonthMoney["even_up"] = null;
  if (payers.length === 2) {
    const [a, b] = payers;
    const diff = (paid.get(a) ?? 0) - (paid.get(b) ?? 0);
    // half the difference moves from the one who paid less to the one who paid more
    if (Math.abs(diff) >= 2) even_up = diff > 0 ? { from: b, to: a, pence: Math.round(diff / 2) } : { from: a, to: b, pence: Math.round(-diff / 2) };
  }
  return { month, total_pence: total, by_category, shares, even_up };
}

export type BinSchedule = { weekday: number; every_weeks: number; anchor_on: string };

export function parseBinSchedule(v: unknown): BinSchedule | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const weekday = Number(o.weekday);
  const every = Number(o.every_weeks ?? 1);
  const anchor = typeof o.anchor_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.anchor_on) ? o.anchor_on : null;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  if (![1, 2, 3, 4].includes(every) || !anchor) return null;
  return { weekday, every_weeks: every, anchor_on: anchor };
}

/**
 * The next collection on or after `today`. The anchor is any date the bin
 * was (or will be) collected; collections repeat every N weeks from it.
 */
export function nextBinDay(s: BinSchedule, today: string): string {
  const DAY = 86_400_000;
  const t = Date.parse(`${today}T00:00:00Z`);
  const a = Date.parse(`${s.anchor_on}T00:00:00Z`);
  const period = s.every_weeks * 7 * DAY;
  // the anchor's own weekday is what repeats; `weekday` is kept for showing it
  const k = Math.max(0, Math.ceil((t - a) / period));
  return new Date(a + k * period).toISOString().slice(0, 10);
}
