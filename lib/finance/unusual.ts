/**
 * A payment larger than usual (master run §10: a spending nudge on "a
 * big/unusual payment"). Pure: the newly imported payments and the person's
 * recent history in, the ones worth a word out.
 *
 * Unusual means all three of: at least £100; in the top two per cent of
 * what the person has paid lately; and, when the merchant has been paid
 * before, at least three times what they usually get. With too little
 * history nothing is called unusual: there is no "usual" yet.
 */
import { isSpend, merchantKey, type Txn } from "./recurring";

export const FLOOR_PENCE = 10_000;
export const MIN_HISTORY = 20;
/** Only payments this close to the newest one count as "came in with the import": an old statement is not news. */
export const RECENT_DAYS = 14;

const DAY = 86_400_000;
const pence = (t: Txn) => Math.round(-t.amount * 100);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function unusualPayments(fresh: readonly Txn[], history: readonly Txn[]): Txn[] {
  const past = history.filter(isSpend);
  if (past.length < MIN_HISTORY) return [];
  const sorted = past.map(pence).sort((a, b) => a - b);
  const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];

  const byMerchant = new Map<string, number[]>();
  for (const t of past) {
    const key = merchantKey(t.description, t.enriched_merchant);
    if (key.length < 3) continue;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), pence(t)]);
  }

  const spend = fresh.filter(isSpend);
  if (spend.length === 0) return [];
  const newest = spend.reduce((m, t) => (t.txn_date > m ? t.txn_date : m), spend[0].txn_date);
  const since = new Date(Date.parse(`${newest}T00:00:00Z`) - RECENT_DAYS * DAY).toISOString().slice(0, 10);

  return spend
    .filter((t) => t.txn_date >= since)
    .filter((t) => {
      const p = pence(t);
      if (p < FLOOR_PENCE || p < p98) return false;
      const usual = byMerchant.get(merchantKey(t.description, t.enriched_merchant));
      return !usual || p >= 3 * median(usual);
    })
    .sort((a, b) => pence(b) - pence(a));
}

/** The one line said about it: a count, never an amount or a name. */
export function unusualTitle(count: number): string {
  return count === 1 ? "A payment larger than usual came in with the latest import. Worth a look." : `${count} payments larger than usual came in with the latest import. Worth a look.`;
}
