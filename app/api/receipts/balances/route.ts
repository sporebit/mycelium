import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/receipts/reconcile";
import { shareAmount } from "@/lib/receipts/shares";
import { namesFor } from "@/lib/receipts/participants";
import type {
  BalanceReceiptBreakdown,
  PersonBalance,
  Receipt,
  ReceiptLineShare,
} from "@/lib/types/receipt";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type LineRow = {
  id: string;
  receipt_id: string;
  line_total: number;
  quantity: number;
};

/**
 * GET — what each person owes, what they have paid, and what is left.
 *
 * Owed is computed from the shares rather than stored. A share is a percentage
 * or a unit count, so its cash value follows the line it sits on: correcting a
 * misread line total corrects every balance that depends on it, with nothing
 * to recompute and no stored figure to go stale.
 *
 * Settlements are not tied to a receipt, so `paid` is a single per-person
 * figure and `outstanding` is the difference. A person who has overpaid shows
 * a negative outstanding rather than being clamped — that is money owed back
 * to them, and hiding it would lose it.
 */
export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();

    const { data: receiptRows, error: rErr } = await supabase
      .from("receipts")
      .select("id, title, retailer, purchased_at, currency")
      .eq("user_id", uid);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    const receipts = (receiptRows ?? []) as Pick<
      Receipt,
      "id" | "title" | "retailer" | "purchased_at" | "currency"
    >[];
    const receiptById = new Map(receipts.map((r) => [r.id, r]));

    // Balances only ever cover this user's receipts, so the line set is
    // restricted to them before any share is priced.
    const receiptIds = receipts.map((r) => r.id);
    const lineById = new Map<string, LineRow>();
    if (receiptIds.length > 0) {
      const { data: lineRows } = await supabase
        .from("receipt_lines")
        .select("id, receipt_id, line_total, quantity")
        .in("receipt_id", receiptIds);
      for (const l of (lineRows ?? []) as LineRow[]) {
        lineById.set(l.id, {
          ...l,
          line_total: Number(l.line_total) || 0,
          quantity: Number(l.quantity) || 0,
        });
      }
    }

    const shares: ReceiptLineShare[] = [];
    const lineIds = [...lineById.keys()];
    if (lineIds.length > 0) {
      const { data: shareRows } = await supabase
        .from("receipt_line_shares")
        .select("id, receipt_line_id, person_id, share_pct, units, created_at")
        .in("receipt_line_id", lineIds);
      shares.push(...((shareRows ?? []) as ReceiptLineShare[]));
    }

    const { data: settlementRows } = await supabase
      .from("receipt_settlements")
      .select("person_id, amount")
      .eq("user_id", uid);

    // person -> receipt -> owed
    const owedByPerson = new Map<string, Map<string, number>>();
    for (const s of shares) {
      const line = lineById.get(s.receipt_line_id);
      if (!line) continue;
      const amount = shareAmount(
        {
          person_id: s.person_id,
          share_pct: s.share_pct === null ? null : Number(s.share_pct),
          units: s.units === null ? null : Number(s.units),
        },
        line.line_total,
        line.quantity,
      );
      if (amount === 0) continue;

      const byReceipt = owedByPerson.get(s.person_id) ?? new Map<string, number>();
      byReceipt.set(line.receipt_id, (byReceipt.get(line.receipt_id) ?? 0) + amount);
      owedByPerson.set(s.person_id, byReceipt);
    }

    const paidByPerson = new Map<string, number>();
    for (const s of (settlementRows ?? []) as {
      person_id: string;
      amount: number;
    }[]) {
      paidByPerson.set(
        s.person_id,
        (paidByPerson.get(s.person_id) ?? 0) + (Number(s.amount) || 0),
      );
    }

    // Someone who has paid but currently owes nothing still belongs in the
    // list — their balance is what the payment left behind.
    const personIds = new Set([...owedByPerson.keys(), ...paidByPerson.keys()]);
    const names = await namesFor([...personIds]);

    const balances: PersonBalance[] = [...personIds].map((personId) => {
      const byReceipt = owedByPerson.get(personId) ?? new Map<string, number>();

      const breakdown: BalanceReceiptBreakdown[] = [...byReceipt.entries()]
        .map(([receiptId, owed]) => {
          const r = receiptById.get(receiptId);
          return {
            receipt_id: receiptId,
            title: r?.title ?? null,
            retailer: r?.retailer ?? null,
            purchased_at: r?.purchased_at ?? null,
            currency: r?.currency ?? "GBP",
            owed: money(owed),
          };
        })
        .sort((a, b) => (b.purchased_at ?? "").localeCompare(a.purchased_at ?? ""));

      const owed = money(breakdown.reduce((sum, b) => sum + b.owed, 0));
      const paid = money(paidByPerson.get(personId) ?? 0);

      return {
        person_id: personId,
        display_name: names.get(personId) ?? "Unknown",
        owed,
        paid,
        outstanding: money(owed - paid),
        receipts: breakdown,
      };
    });

    balances.sort(
      (a, b) =>
        b.outstanding - a.outstanding || a.display_name.localeCompare(b.display_name),
    );

    return NextResponse.json({ balances });
  } catch (err) {
    console.error("[receipts/balances GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
