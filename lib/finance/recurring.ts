/**
 * Bills and subscriptions, found in the transactions already imported
 * (master run §10). Pure: transactions in, recurring payments out. No
 * model: a merchant paid at a steady interval is a recurring payment, and
 * arithmetic says how often, how much, when next, and whether the price
 * has gone up.
 *
 * Everything is judged against the newest transaction given, not against
 * today. The data arrives by import, so it can be months old; a payment
 * "due" after the last import is not late, it is not known yet.
 */

export type Txn = { id: string; txn_date: string; description: string | null; enriched_merchant: string | null; amount: number; txn_type: string | null };
export type Cadence = "weekly" | "fortnightly" | "four_weekly" | "monthly" | "quarterly" | "yearly";
export type Recurring = {
  /** Stable for a merchant: what a mark is kept against. */
  key: string;
  /** As it reads on the statement, tidied. */
  name: string;
  cadence: Cadence;
  kind: "bill" | "subscription";
  /** The latest payment, in pence, as a positive number. */
  amount_pence: number;
  /** What it comes to per month, for adding things up across cadences. */
  monthly_pence: number;
  /** False when the amount moves from one payment to the next (energy, a phone bill with extras). */
  fixed: boolean;
  count: number;
  first_on: string;
  last_on: string;
  /** When the next one is expected. */
  next_on: string;
  /** Still running as far as the data goes: the next one was not yet well past when the data ends. */
  active: boolean;
  /** The latest payment is dearer than the ones before it. */
  rise: { from_pence: number; to_pence: number; since: string } | null;
  /** The ids of the payments it was found from, newest first. */
  txn_ids: string[];
};

const DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Movements of money that are not buying anything: never a bill or a subscription. */
const NOT_SPENDING = new Set(["transfer", "top-up", "cash withdrawal", "fee", "charge", "exchange", "atm"]);
const STANDING = new Set(["direct debit", "standing order"]);

const BANDS: Array<{ cadence: Cadence; min: number; max: number; days: number; perMonth: number }> = [
  { cadence: "weekly", min: 6, max: 8, days: 7, perMonth: 52 / 12 },
  { cadence: "fortnightly", min: 13, max: 15, days: 14, perMonth: 26 / 12 },
  { cadence: "four_weekly", min: 27, max: 28.5, days: 28, perMonth: 13 / 12 },
  { cadence: "monthly", min: 28.5, max: 34, days: 30, perMonth: 1 },
  { cadence: "quarterly", min: 85, max: 97, days: 91, perMonth: 1 / 3 },
  { cadence: "yearly", min: 350, max: 380, days: 365, perMonth: 1 / 12 },
];

/**
 * A merchant's name from a statement line: the reference numbers, dates,
 * card markers and town names that change from one payment to the next are
 * taken off, so the same merchant reads the same every month.
 */
export function merchantKey(description: string | null, enriched: string | null = null): string {
  const raw = (enriched?.trim() || description || "").toUpperCase();
  return raw
    // "…,10.99 GBP ON 03-06-2026": the amount and date some banks append to the line
    .replace(/,?\s*\d+(\.\d+)?\s*(GBP|EUR|USD)\b(\s+ON\b)?/g, " ")
    .replace(/\b(CARD PAYMENT TO|PAYMENT TO|DIRECT DEBIT( PAYMENT)? TO|STANDING ORDER TO|DD|SO|CD \d{4}|POS|CONTACTLESS|VIS|DEB)\b/g, " ")
    .replace(/\b\d{1,2}\s?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s?\d{0,4}\b/g, " ")
    .replace(/\b\d{2}[/-]\d{2}([/-]\d{2,4})?\b/g, " ")
    .replace(/[*#]\S*/g, " ")
    .replace(/\b[A-Z]*\d[A-Z0-9]{3,}\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\b(LTD|LIMITED|PLC|UK|GB|GBR|LONDON|WWW|COM|CO|INC|LLC)\b/g, " ")
    .replace(/[^A-Z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

/** "OCTOPUS ENERGY" as "Octopus Energy". Initials stay as they are: two letters (EE, BT), or three with no vowel or Y (DPD, BBC). */
const titled = (key: string) =>
  key
    .split(" ")
    .map((w) => (w.length <= 2 || (w.length === 3 && !/[AEIOUY]/.test(w)) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");

/** The same day next month (the 31st falls back to the month's last day). */
function addMonths(day: string, months: number): string {
  const d = new Date(utc(day));
  const want = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(want, last));
  return d.toISOString().slice(0, 10);
}

function nextAfter(last: string, cadence: Cadence): string {
  if (cadence === "monthly") return addMonths(last, 1);
  if (cadence === "quarterly") return addMonths(last, 3);
  if (cadence === "yearly") return addMonths(last, 12);
  return iso(utc(last) + BANDS.find((b) => b.cadence === cadence)!.days * DAY);
}

/**
 * Recurring payments among these transactions, the costliest per month
 * first. `asOf` is the day the data runs to; left out, it is the newest
 * transaction's date.
 */
export function findRecurring(txns: readonly Txn[], asOf?: string): Recurring[] {
  const spend = txns.filter((t) => t.amount < 0 && !NOT_SPENDING.has((t.txn_type ?? "").toLowerCase()));
  if (spend.length === 0) return [];
  const end = asOf ?? spend.reduce((m, t) => (t.txn_date > m ? t.txn_date : m), spend[0].txn_date);

  const groups = new Map<string, Txn[]>();
  for (const t of spend) {
    const key = merchantKey(t.description, t.enriched_merchant);
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: Recurring[] = [];
  for (const [key, all] of groups) {
    // one payment a day: two charges on the same day are one visit, not a rhythm
    const byDay = new Map<string, Txn>();
    for (const t of [...all].sort((a, b) => a.txn_date.localeCompare(b.txn_date))) if (!byDay.has(t.txn_date)) byDay.set(t.txn_date, t);
    const rows = [...byDay.values()];
    const standing = rows.some((t) => STANDING.has((t.txn_type ?? "").toLowerCase()));
    if (rows.length < 2) continue;

    const gaps = rows.slice(1).map((t, i) => (utc(t.txn_date) - utc(rows[i].txn_date)) / DAY);
    const typical = median(gaps);
    const band = BANDS.find((b) => typical >= b.min && typical <= b.max);
    if (!band) continue;
    // how many payments it takes to believe it: a yearly one, or a direct debit, on two; anything else on three
    const needed = band.cadence === "yearly" || standing ? 2 : 3;
    if (rows.length < needed) continue;
    const steady = gaps.filter((g) => g >= band.min - 2 && g <= band.max + 3).length / gaps.length;
    if (steady < 0.6) continue;

    const pence = rows.map((t) => Math.round(Math.abs(t.amount) * 100));
    const latest = pence[pence.length - 1];
    const mid = median(pence);
    // "The same price": within 50p or 5%, whichever is more.
    const same = (x: number, y: number) => Math.abs(x - y) <= Math.max(50, y * 0.05);
    // Where the price it is at now began: the run of payments at the latest price, counted back from the end.
    let start = pence.length - 1;
    while (start > 0 && same(pence[start - 1], latest)) start -= 1;
    const head = pence.slice(0, start);
    // A fixed price is one level, or one level that stepped once to another (a price change is still a fixed
    // price). A bill that moves every month is neither.
    const fixed = head.length === 0 || head.every((p) => same(p, median(head)));
    // a card payment that varies a lot at a steady interval is the weekly shop, not a subscription
    if (!standing && !fixed && pence.some((p) => Math.abs(p - mid) > mid * 0.35)) continue;

    // A rise: it stepped up from what it had settled at, recently enough to be news (within the last three
    // payments). The step is already more than "the same price", or the run above would have carried on.
    let rise: Recurring["rise"] = null;
    const earlier = pence.slice(Math.max(0, start - 3), start);
    if (earlier.length >= 2 && pence.length - start <= 3) {
      const was = median(earlier);
      if (earlier.every((p) => same(p, was)) && latest > was) rise = { from_pence: Math.round(was), to_pence: latest, since: rows[start].txn_date };
    }

    const last = rows[rows.length - 1].txn_date;
    const next = nextAfter(last, band.cadence);
    const amountForMonth = fixed ? latest : Math.round(median(pence.slice(-6)));
    out.push({
      key,
      name: titled(key),
      cadence: band.cadence,
      kind: standing || amountForMonth > 6000 ? "bill" : "subscription",
      amount_pence: latest,
      monthly_pence: Math.round(amountForMonth * band.perMonth),
      fixed,
      count: rows.length,
      first_on: rows[0].txn_date,
      last_on: last,
      next_on: next,
      // half a cadence of grace: a payment a few days late is not a cancelled one
      active: utc(next) + band.days * 0.5 * DAY >= utc(end),
      rise,
      txn_ids: rows.map((t) => t.id).reverse(),
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.monthly_pence - a.monthly_pence);
}

export type Mark = "keep" | "cancel" | "not_recurring";
export type RecurringSummary = {
  /** The day the data runs to. */
  as_of: string | null;
  monthly_pence: number;
  yearly_pence: number;
  bills: number;
  subscriptions: number;
  rises: number;
  /** Running subscriptions nobody has yet said "keep" or "cancel" to. */
  unlooked: number;
};

/** What the page says at the top. Things marked "not recurring" are left out of everything. */
export function summarise(items: readonly Recurring[], marks: Readonly<Record<string, Mark>>, asOf: string | null): RecurringSummary {
  const live = items.filter((i) => i.active && marks[i.key] !== "not_recurring");
  const monthly = live.reduce((s, i) => s + i.monthly_pence, 0);
  return {
    as_of: asOf,
    monthly_pence: monthly,
    yearly_pence: monthly * 12,
    bills: live.filter((i) => i.kind === "bill").length,
    subscriptions: live.filter((i) => i.kind === "subscription").length,
    rises: live.filter((i) => i.rise).length,
    unlooked: live.filter((i) => i.kind === "subscription" && !marks[i.key]).length,
  };
}

export const CADENCE_LABEL: Record<Cadence, string> = { weekly: "weekly", fortnightly: "every two weeks", four_weekly: "every four weeks", monthly: "monthly", quarterly: "every three months", yearly: "yearly" };
