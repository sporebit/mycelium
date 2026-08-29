import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { money } from "@/lib/receipts/reconcile";
import {
  RECEIPT_SETTLEMENT_SELECT,
  type ReceiptSettlement,
} from "@/lib/types/receipt";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET — payments received, newest first, optionally for one person. */
export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const personId = new URL(req.url).searchParams.get("person_id");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("receipt_settlements")
      .select(RECEIPT_SETTLEMENT_SELECT)
      .eq("user_id", uid)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (personId) q = q.eq("person_id", personId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settlements: (data ?? []) as ReceiptSettlement[] });
  } catch (err) {
    console.error("[receipts/settlements GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST — record money handed back.
 *
 * A settlement is against a person, not a receipt: repayment in practice is one
 * transfer covering whatever had accumulated, and splitting it across receipts
 * would be an invention. The balance endpoint nets it off the total owed.
 *
 * transaction_id is accepted but not required. It is where the finance matcher
 * will link the bank line that carried the payment; until then it stays null,
 * as it does forever for cash.
 */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: {
    person_id?: unknown;
    amount?: unknown;
    paid_at?: unknown;
    note?: unknown;
    transaction_id?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const personId = typeof body.person_id === "string" ? body.person_id : null;
  if (!personId) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json(
      { error: "amount must be a non-zero number" },
      { status: 400 },
    );
  }

  // Defaulting to today keeps the common case a single field in the form.
  const paidAt =
    typeof body.paid_at === "string" && body.paid_at
      ? body.paid_at
      : new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(paidAt)) {
    return NextResponse.json({ error: "paid_at must be YYYY-MM-DD" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() || null : null;
  const transactionId =
    typeof body.transaction_id === "string" && body.transaction_id
      ? body.transaction_id
      : null;

  try {
    const supabase = createServerClient();

    const { data: person } = await supabase
      .from("people")
      .select("id")
      .eq("id", personId)
      .eq("user_id", uid)
      .maybeSingle();
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("receipt_settlements")
      .insert({
        user_id: uid,
        person_id: personId,
        amount: money(amount),
        paid_at: paidAt,
        transaction_id: transactionId,
        note,
      })
      .select(RECEIPT_SETTLEMENT_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ settlement: data as ReceiptSettlement }, { status: 201 });
  } catch (err) {
    console.error("[receipts/settlements POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

/** DELETE — undo a recorded payment. */
export async function DELETE(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const url = new URL(req.url);
  let id = url.searchParams.get("id");
  if (!id) {
    try {
      const body = (await req.json()) as { id?: unknown };
      if (typeof body.id === "string") id = body.id;
    } catch {
      // No body is fine — the query parameter is the documented form.
    }
  }
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("receipt_settlements")
      .delete()
      .eq("id", id)
      .eq("user_id", uid)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[receipts/settlements DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
