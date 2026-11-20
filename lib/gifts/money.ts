/**
 * Money on an occasion, pure (spec decision 8). Committed is what is
 * shortlisted or bought, at target price; paid is what was paid. A gift
 * with no price adds nothing and is counted so the view can say "2 without
 * a price" instead of pretending the total is complete.
 */
import type { GiftRow } from "./types";

export type Totals = {
  budget: number | null;
  committed: number;
  paid: number;
  /** committed + paid-but-unpriced gifts the total cannot see */
  unpriced: number;
  /** budget - max(committed, paid); null without a budget */
  left: number | null;
  /** 0..1+ of the budget used by the larger of committed and paid; null without a budget */
  used: number | null;
  counts: { idea: number; shortlisted: number; bought: number; given: number; rejected: number };
};

type Money = Pick<GiftRow, "status" | "target_price" | "paid_amount">;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function occasionTotals(gifts: readonly Money[], budget: number | null | undefined): Totals {
  const counts = { idea: 0, shortlisted: 0, bought: 0, given: 0, rejected: 0 };
  let committed = 0;
  let paid = 0;
  let unpriced = 0;
  for (const g of gifts) {
    counts[g.status] += 1;
    const target = num(g.target_price);
    const paidAmount = num(g.paid_amount);
    if (g.status === "shortlisted" || g.status === "bought" || g.status === "given") {
      // what was actually paid is the better figure once it is known
      const price = paidAmount ?? target;
      if (price === null) unpriced += 1;
      else committed = round(committed + price);
    }
    if ((g.status === "bought" || g.status === "given") && paidAmount !== null) paid = round(paid + paidAmount);
  }
  const b = num(budget);
  const spent = Math.max(committed, paid);
  return {
    budget: b,
    committed,
    paid,
    unpriced,
    left: b === null ? null : round(b - spent),
    used: b === null || b === 0 ? null : spent / b,
    counts,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function money(n: number | null | undefined, currency = "GBP"): string {
  if (n === null || n === undefined) return "";
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${Number(n).toFixed(2).replace(/\.00$/, "")}`;
}
