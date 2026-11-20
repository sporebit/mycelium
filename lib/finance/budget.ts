/**
 * Budget against actual, for one month (master run §10). Pure.
 *
 * A budget is what a month is meant to cost in a category. The page shows
 * each against what has been spent so far, and where the month is heading
 * at the rate so far. A nudge goes out when a category passes 80% and when
 * it passes 100%, once each a month, and says a percentage, never an
 * amount: a notification can be seen by whoever is holding the phone.
 */

export type BudgetLine = {
  category: string;
  budget_pence: number;
  spent_pence: number;
  /** Negative when over. */
  left_pence: number;
  /** Spent as a share of the budget; 1 is all of it. Null when no budget is set. */
  used: number | null;
  /** Where the month ends at the rate so far. */
  projected_pence: number;
  state: "none" | "fine" | "heading_over" | "over";
};

export type BudgetMonth = { month: string; day: number; days: number; lines: BudgetLine[]; budget_pence: number; spent_pence: number; unbudgeted_pence: number };

/** Categories that are money moving, not money spent: they have no budget and are left out of the totals. */
export const NOT_SPENDING = new Set(["Income", "Transfer (internal)"]);

export function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * @param budgets pence a month, by category
 * @param spent   pence spent this month so far, by category (positive numbers)
 * @param month   "YYYY-MM"
 * @param day     the day of the month the data runs to (the whole month for a past month)
 */
export function budgetMonth(budgets: Readonly<Record<string, number>>, spent: Readonly<Record<string, number>>, month: string, day: number): BudgetMonth {
  const days = daysIn(month);
  const through = Math.min(Math.max(day, 1), days);
  const categories = [...new Set([...Object.keys(budgets), ...Object.keys(spent)])].filter((c) => !NOT_SPENDING.has(c));
  const lines: BudgetLine[] = categories.map((category) => {
    const budget = budgets[category] ?? 0;
    const s = Math.max(0, Math.round(spent[category] ?? 0));
    const projected = Math.round((s * days) / through);
    const state: BudgetLine["state"] = budget <= 0 ? "none" : s > budget ? "over" : projected > budget * 1.05 && through < days ? "heading_over" : "fine";
    return { category, budget_pence: budget, spent_pence: s, left_pence: budget - s, used: budget > 0 ? s / budget : null, projected_pence: projected, state };
  });
  // what needs looking at first: over, then heading over, then by how much of the budget is used
  const rank = { over: 0, heading_over: 1, fine: 2, none: 3 } as const;
  lines.sort((a, b) => rank[a.state] - rank[b.state] || (b.used ?? -1) - (a.used ?? -1) || b.spent_pence - a.spent_pence);
  return {
    month,
    day: through,
    days,
    lines,
    budget_pence: lines.reduce((n, l) => n + l.budget_pence, 0),
    spent_pence: lines.reduce((n, l) => n + l.spent_pence, 0),
    unbudgeted_pence: lines.filter((l) => l.budget_pence <= 0).reduce((n, l) => n + l.spent_pence, 0),
  };
}

export type BudgetAlert = { category: string; level: 80 | 100; title: string };

/**
 * The nudges owed for a month: one when a category passes 80%, one when it
 * passes 100%. `sent` is the titles already sent this month; a title says
 * the category and the level, so each goes once. If a category jumps
 * straight past 100%, only that one is sent.
 */
export function budgetAlerts(m: BudgetMonth, sent: ReadonlySet<string>): BudgetAlert[] {
  const out: BudgetAlert[] = [];
  const left = m.days - m.day;
  const tail = left <= 0 ? "" : left === 1 ? ", with a day to go" : `, with ${left} days to go`;
  for (const l of m.lines) {
    if (l.used === null) continue;
    const level = l.used >= 1 ? 100 : l.used >= 0.8 ? 80 : null;
    if (!level) continue;
    const title = level === 100 ? `${l.category}: this month's budget is used up${tail}` : `${l.category}: 80% of this month's budget used${tail}`;
    const already = [...sent].some((t) => t.startsWith(`${l.category}: `) && (level === 80 || t.includes("used up")));
    if (!already) out.push({ category: l.category, level, title });
  }
  return out;
}
