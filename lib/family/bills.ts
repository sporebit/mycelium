/**
 * Household bills that add themselves (MYC-186; 0180). Pure.
 *
 * A cost marked monthly is a source. When the month turns, the family tick
 * writes that month's row for each source: the same title, amount, payer
 * and category as the most recent row of the rhythm (so a price rise typed
 * on last month's row carries forward), on the source's day of the month
 * (or the last day, in a shorter month), pointing back at the source with
 * `recurs_from`. A row the tick wrote is `recurs = 'none'`: it is never a
 * source of its own. One row a month per source is enforced by a unique
 * index, so two ticks in the same minute, or two members' ticks, write one.
 *
 * Nothing here reads or writes the finance section.
 */

export type BillRow = {
  id: string;
  title: string;
  amount_pence: number;
  paid_by: string | null;
  paid_on: string;
  category: string;
  recurs: string;
  recurs_from: string | null;
};

export type BillToAdd = {
  title: string;
  amount_pence: number;
  paid_by: string | null;
  paid_on: string;
  category: string;
  recurs: "none";
  recurs_from: string;
  note: null;
};

const month = (day: string) => day.slice(0, 7);

/** The last day of a month, "YYYY-MM" → 28..31. */
export function daysIn(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The source's day of the month, in the month asked for; the last day when that month is shorter. */
export function sameDayIn(anchor: string, ym: string): string {
  const day = Math.min(Number(anchor.slice(8, 10)), daysIn(ym));
  return `${ym}-${String(day).padStart(2, "0")}`;
}

/**
 * The rows the tick writes this month, given every row that is a source or
 * came from one. `today` is a London day. A source dated this month or
 * later adds nothing yet; a rhythm that already has a row this month adds
 * nothing; an earlier gap is not filled in (the months that passed with
 * nothing written are left as they were).
 */
export function monthlyBillsDue(rows: readonly BillRow[], today: string): BillToAdd[] {
  const thisMonth = month(today);
  const out: BillToAdd[] = [];
  for (const source of rows) {
    if (source.recurs !== "monthly" || source.recurs_from !== null) continue;
    if (month(source.paid_on) >= thisMonth) continue;
    const chain = [source, ...rows.filter((r) => r.recurs_from === source.id)];
    if (chain.some((r) => month(r.paid_on) === thisMonth)) continue;
    const latest = chain.reduce((a, b) => (b.paid_on > a.paid_on ? b : a));
    out.push({
      title: latest.title,
      amount_pence: latest.amount_pence,
      paid_by: latest.paid_by,
      paid_on: sameDayIn(source.paid_on, thisMonth),
      category: latest.category,
      recurs: "none",
      recurs_from: source.id,
      note: null,
    });
  }
  return out;
}
