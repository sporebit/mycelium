import { money } from "@/lib/receipts/reconcile";

/**
 * The one rule for turning a stored share into money, and the one rule for
 * whether a set of shares on a line is admissible.
 *
 * A share is expressed either as a percentage of the line or as a count of the
 * line's units, never both — see the receipt_line_shares_one_measure check in
 * 0094. Both reduce to an amount here so that the rest of the app never has to
 * branch on which measure was used.
 *
 * The owner is not represented. He is the remainder: whatever the line is worth
 * less everyone else's share. That is why the validity rules are one-sided —
 * shares may under-fill a line (the owner takes the rest) but may never
 * over-fill it (there would be nothing left to take, and the arithmetic would
 * imply he was owed money for his own shopping).
 */

/** A share as stored: exactly one of share_pct and units is non-null. */
export type ShareInput = {
  person_id: string;
  share_pct?: number | null;
  units?: number | null;
};

export type ShareAmount = ShareInput & {
  /** What this share is worth, rounded to 2dp. */
  amount: number;
};

/** Rounding for unit counts — units is numeric(10,3). */
function units3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * What one share is worth against a line.
 *
 * A percentage share is a fraction of the line total. A unit share is priced
 * off the line rather than off unit_price: `line_total / quantity` is the
 * amount actually charged per unit, which is what the split has to divide.
 * Using the printed unit_price instead would silently ignore a line discount
 * and leave the owner's remainder wrong.
 *
 * A line with a zero or missing quantity cannot price units, so a unit share
 * against it is worth nothing rather than infinity.
 */
export function shareAmount(
  share: ShareInput,
  lineTotal: number,
  quantity: number,
): number {
  if (share.share_pct !== null && share.share_pct !== undefined) {
    return money((lineTotal * share.share_pct) / 100);
  }
  if (share.units !== null && share.units !== undefined) {
    if (!quantity || quantity <= 0) return 0;
    return money((lineTotal / quantity) * share.units);
  }
  return 0;
}

/** Prices every share on a line. */
export function shareAmounts(
  shares: ShareInput[],
  lineTotal: number,
  quantity: number,
): ShareAmount[] {
  return shares.map((s) => ({
    ...s,
    amount: shareAmount(s, lineTotal, quantity),
  }));
}

/**
 * The owner's portion of a line: what is left after everyone else.
 *
 * Clamped at zero. Shares that over-fill a line are rejected before they are
 * stored, but a line total edited downwards afterwards can leave existing
 * shares exceeding it, and a negative remainder would read as the owner being
 * owed money for his own receipt.
 */
export function ownerRemainder(
  shares: ShareInput[],
  lineTotal: number,
  quantity: number,
): number {
  const claimed = shareAmounts(shares, lineTotal, quantity).reduce(
    (sum, s) => sum + s.amount,
    0,
  );
  return money(Math.max(0, lineTotal - claimed));
}

export type ShareValidation = { ok: true } | { ok: false; error: string };

/**
 * Whether a proposed set of shares may be stored against a line.
 *
 * Percentages and units are checked against their own ceilings rather than
 * against a combined figure: a line can carry both kinds at once, and the two
 * are only commensurable once priced, by which point the rounding at each
 * share would make a combined ceiling arbitrary at the edges.
 *
 * Duplicates are rejected here as well as by the unique constraint, so the API
 * can answer with something readable instead of a Postgres error.
 */
export function validateShares(
  shares: ShareInput[],
  quantity: number,
): ShareValidation {
  const seen = new Set<string>();
  let pctTotal = 0;
  let unitTotal = 0;

  for (const s of shares) {
    if (seen.has(s.person_id)) {
      return { ok: false, error: "a person may hold only one share per line" };
    }
    seen.add(s.person_id);

    const hasPct = s.share_pct !== null && s.share_pct !== undefined;
    const hasUnits = s.units !== null && s.units !== undefined;

    if (hasPct === hasUnits) {
      return {
        ok: false,
        error: "each share needs exactly one of share_pct or units",
      };
    }
    if (hasPct) {
      if (!(s.share_pct! > 0) || s.share_pct! > 100) {
        return { ok: false, error: "share_pct must be above 0 and at most 100" };
      }
      pctTotal += s.share_pct!;
    }
    if (hasUnits) {
      if (!(s.units! > 0)) {
        return { ok: false, error: "units must be above 0" };
      }
      unitTotal += s.units!;
    }
  }

  // Rounded before comparing: 33.33 x 3 is 99.99, but a percentage stored at
  // 2dp can sum to 100.00000000000001 in binary floating point and must not be
  // rejected for it.
  if (money(pctTotal) > 100) {
    return {
      ok: false,
      error: `shares add up to ${money(pctTotal)}% of the line, which is more than all of it`,
    };
  }
  if (unitTotal > 0 && units3(unitTotal) > quantity) {
    return {
      ok: false,
      error: `shares claim ${units3(unitTotal)} units of a line that has ${quantity}`,
    };
  }

  return { ok: true };
}

/**
 * The share each tagged person takes when no explicit figure is given.
 *
 * A participant with a default_share_pct keeps it. Whatever percentage is left
 * after those is divided evenly between the people tagged without one — so
 * tagging a third person re-divides the remainder rather than leaving the
 * first two over-claiming.
 *
 * Returns percentages, not amounts: this is what gets stored, and it stays
 * correct if the line total is later corrected.
 */
export function evenSplitPcts(
  tagged: { person_id: string; default_share_pct: number | null }[],
): { person_id: string; share_pct: number }[] {
  const fixed = tagged.filter((t) => t.default_share_pct !== null);
  const floating = tagged.filter((t) => t.default_share_pct === null);

  const fixedTotal = fixed.reduce((sum, t) => sum + (t.default_share_pct ?? 0), 0);
  const remaining = Math.max(0, 100 - fixedTotal);
  const each = floating.length > 0 ? remaining / floating.length : 0;

  return [
    ...fixed.map((t) => ({ person_id: t.person_id, share_pct: money(t.default_share_pct!) })),
    ...floating.map((t) => ({ person_id: t.person_id, share_pct: money(each) })),
  ];
}
