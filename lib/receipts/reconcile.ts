import { TOTAL_TOLERANCE, type ReceiptStatus } from "@/lib/types/receipt";

/** Reasons reconciliation holds a receipt back from 'parsed'. */
export type ReviewReason = "no_total" | "total_mismatch";

export type Reconciliation = {
  status: Extract<ReceiptStatus, "parsed" | "needs_review">;
  review_reason: ReviewReason | null;
};

/** Rounds to 2dp without floating-point tails (0.1 + 0.2 style). */
export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The one reconciliation rule, shared by the parser and the line editor.
 *
 * A receipt whose lines do not add up to its printed total is not trustworthy
 * enough to file silently. Both call sites must agree not only on the
 * tolerance but on the rounding that feeds it, which is why `money()` lives
 * here too — the same sum rounded two different ways can land on opposite
 * sides of a 0.05 boundary.
 */
export function reconcile(
  parsedTotal: number,
  total: number | null | undefined,
): Reconciliation {
  if (total === null || total === undefined) {
    return { status: "needs_review", review_reason: "no_total" };
  }
  if (Math.abs(parsedTotal - total) > TOTAL_TOLERANCE) {
    return { status: "needs_review", review_reason: "total_mismatch" };
  }
  return { status: "parsed", review_reason: null };
}

/**
 * Whether a receipt's status may be recomputed from its lines.
 *
 * Two states are terminal as far as a line edit is concerned:
 *
 * - 'failed' — the parse never produced a trustworthy line set, so the sum of
 *   whatever lines exist says nothing about the receipt. Re-running the rule
 *   on a failed receipt with a null total would silently relabel it
 *   'needs_review' and lose the recorded failure reason.
 * - 'no_total' — there is no printed total to reconcile against, so no edit to
 *   the lines can resolve it. Only a reparse (or an edit to the receipt's own
 *   total) can.
 *
 * The parser does not use this: it computes a status from scratch and is the
 * thing that sets 'failed' in the first place.
 */
export function isReconcilable(
  status: ReceiptStatus,
  reviewReason: string | null,
): boolean {
  return status !== "failed" && reviewReason !== "no_total";
}
