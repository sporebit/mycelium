import { createServerClient } from "@/lib/supabase/server";
import { evenSplitPcts } from "@/lib/receipts/shares";
import { money } from "@/lib/receipts/reconcile";
import type { ReceiptLineShare } from "@/lib/types/receipt";

/**
 * Tagging: the one-click way to put a person on a line.
 *
 * Who is "tagged" on a line is not stored separately — it is exactly who holds
 * a receipt_line_shares row for it. Tagging adds a row, untagging removes one,
 * and both then recompute the line so the even split stays even.
 *
 * The recompute is the point. Two people sharing a line hold 50% each; tagging
 * a third has to move all three to 33.33%, not add a third 50%. Doing that as
 * "insert one row" would leave the line claiming 150% of itself.
 */

type ShareRow = {
  person_id: string;
  share_pct: number | null;
  units: number | null;
};

async function loadShares(lineId: string): Promise<ShareRow[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("receipt_line_shares")
    .select("person_id, share_pct, units")
    .eq("receipt_line_id", lineId);

  return ((data ?? []) as ReceiptLineShare[]).map((s) => ({
    person_id: s.person_id,
    share_pct: s.share_pct === null ? null : Number(s.share_pct),
    units: s.units === null ? null : Number(s.units),
  }));
}

async function defaultsFor(receiptId: string): Promise<Map<string, number | null>> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("receipt_participants")
    .select("person_id, default_share_pct")
    .eq("receipt_id", receiptId);

  const map = new Map<string, number | null>();
  for (const p of (data ?? []) as {
    person_id: string;
    default_share_pct: number | null;
  }[]) {
    map.set(
      p.person_id,
      p.default_share_pct === null ? null : Number(p.default_share_pct),
    );
  }
  return map;
}

/**
 * Rewrites one line's shares so the percentage-based ones are the receipt's
 * defaults again.
 *
 * Three groups, in order of precedence:
 *
 * 1. Unit shares are left exactly as they are. "Two of the three bottles" is an
 *    explicit statement about the goods, not a share of the money, and nothing
 *    about who else is on the line changes it. Their equivalent percentage is
 *    reserved out of the pool so the rest cannot claim it twice.
 * 2. Participants carrying a default_share_pct take it.
 * 3. Everyone else divides what is left, evenly.
 *
 * Written as an upsert plus a targeted delete rather than a wipe and reinsert:
 * there is no transaction available here, and a failure midway through a wipe
 * would leave the line with no shares at all.
 */
async function writeRecomputed(
  receiptId: string,
  lineId: string,
  next: ShareRow[],
  quantity: number,
): Promise<void> {
  const supabase = createServerClient();
  const defaults = await defaultsFor(receiptId);

  const unitRows = next.filter((s) => s.units !== null && s.units !== undefined);
  const pctPeople = next.filter((s) => s.units === null || s.units === undefined);

  // A unit share only has a percentage equivalent if the line has a quantity to
  // divide by. Without one it reserves nothing, and shareAmount() prices it at
  // zero for the same reason.
  const reservedPct =
    quantity > 0
      ? unitRows.reduce((sum, s) => sum + ((s.units ?? 0) / quantity) * 100, 0)
      : 0;

  const computed = evenSplitPcts(
    pctPeople.map((s) => ({
      person_id: s.person_id,
      default_share_pct: defaults.get(s.person_id) ?? null,
    })),
    money(reservedPct),
  );

  const rows = [
    ...unitRows.map((s) => ({
      receipt_line_id: lineId,
      person_id: s.person_id,
      share_pct: null as number | null,
      units: s.units,
    })),
    ...computed
      // A computed 0% would violate the share_pct > 0 check. It means the pool
      // was already fully claimed, so the right answer is no row at all.
      .filter((c) => c.share_pct > 0)
      .map((c) => ({
        receipt_line_id: lineId,
        person_id: c.person_id,
        share_pct: c.share_pct,
        units: null as number | null,
      })),
  ];

  if (rows.length > 0) {
    const { error } = await supabase
      .from("receipt_line_shares")
      .upsert(rows, { onConflict: "receipt_line_id,person_id" });
    if (error) {
      console.error("[receipts/tagging] upsert failed:", error.message);
      return;
    }
  }

  const keep = new Set(rows.map((r) => r.person_id));
  const drop = next.map((s) => s.person_id).filter((p) => !keep.has(p));
  const current = await loadShares(lineId);
  for (const s of current) {
    if (!keep.has(s.person_id)) drop.push(s.person_id);
  }

  if (drop.length > 0) {
    await supabase
      .from("receipt_line_shares")
      .delete()
      .eq("receipt_line_id", lineId)
      .in("person_id", [...new Set(drop)]);
  }
}

/** Adds a person to a line at the receipt's default, re-dividing the rest. */
export async function tagPerson(
  receiptId: string,
  lineId: string,
  personId: string,
  quantity: number,
): Promise<void> {
  const current = await loadShares(lineId);
  if (current.some((s) => s.person_id === personId)) return;
  await writeRecomputed(
    receiptId,
    lineId,
    [...current, { person_id: personId, share_pct: null, units: null }],
    quantity,
  );
}

/** Removes a person from a line, re-dividing what they held. */
export async function untagPerson(
  receiptId: string,
  lineId: string,
  personId: string,
  quantity: number,
): Promise<void> {
  const current = await loadShares(lineId);
  if (!current.some((s) => s.person_id === personId)) return;
  await writeRecomputed(
    receiptId,
    lineId,
    current.filter((s) => s.person_id !== personId),
    quantity,
  );
}

/**
 * Re-divides the given lines after a participant was removed from the receipt
 * entirely. Their share rows are already gone; this is what stops the people
 * left behind holding the stale fractions they were given when there were more
 * of them.
 */
export async function rebalanceLines(
  receiptId: string,
  lineIds: string[],
): Promise<void> {
  if (lineIds.length === 0) return;
  const supabase = createServerClient();

  const { data } = await supabase
    .from("receipt_lines")
    .select("id, quantity")
    .in("id", lineIds);

  for (const line of (data ?? []) as { id: string; quantity: number }[]) {
    const current = await loadShares(line.id);
    if (current.length === 0) continue;
    await writeRecomputed(
      receiptId,
      line.id,
      current,
      Number(line.quantity) || 0,
    );
  }
}
