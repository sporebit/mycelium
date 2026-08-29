import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { namesFor, ownsReceipt } from "@/lib/receipts/participants";
import { rebalanceLines } from "@/lib/receipts/tagging";
import {
  RECEIPT_PARTICIPANT_SELECT,
  type ReceiptParticipant,
  type ReceiptParticipantWithPerson,
} from "@/lib/types/receipt";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function pctOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (n <= 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}

/** GET — who is on this receipt, besides the owner. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  try {
    if (!(await ownsReceipt(id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("receipt_participants")
      .select(RECEIPT_PARTICIPANT_SELECT)
      .eq("receipt_id", id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as ReceiptParticipant[];
    const names = await namesFor(rows.map((r) => r.person_id));
    const participants: ReceiptParticipantWithPerson[] = rows.map((r) => ({
      ...r,
      display_name: names.get(r.person_id) ?? "Unknown",
    }));

    return NextResponse.json({ participants });
  } catch (err) {
    console.error("[receipts/[id]/participants GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST — put a person on this receipt.
 *
 * Idempotent: adding someone already present updates their default rather than
 * failing on the unique constraint, so the UI can offer "add" without first
 * checking whether they are there.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  let body: { person_id?: unknown; default_share_pct?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const personId = typeof body.person_id === "string" ? body.person_id : null;
  if (!personId) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  const defaultPct = pctOrNull(body.default_share_pct);
  if (defaultPct === undefined) {
    return NextResponse.json(
      { error: "default_share_pct must be above 0 and at most 100" },
      { status: 400 },
    );
  }

  try {
    if (!(await ownsReceipt(id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const supabase = createServerClient();

    // The person has to be one of this user's, or a receipt could name a row
    // belonging to someone else.
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
      .from("receipt_participants")
      .upsert(
        { receipt_id: id, person_id: personId, default_share_pct: defaultPct },
        { onConflict: "receipt_id,person_id" },
      )
      .select(RECEIPT_PARTICIPANT_SELECT)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const names = await namesFor([personId]);
    return NextResponse.json(
      {
        participant: {
          ...(data as ReceiptParticipant),
          display_name: names.get(personId) ?? "Unknown",
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[receipts/[id]/participants POST]", err);
    return NextResponse.json({ error: "add failed" }, { status: 500 });
  }
}

/**
 * DELETE — take a person off this receipt.
 *
 * Their line shares go too. A share is a claim by a participant; leaving the
 * shares behind would keep charging someone no longer on the receipt, and the
 * owner's remainder would stay reduced with nothing on screen to explain it.
 *
 * Lines they were sharing evenly are re-divided between whoever is left, for
 * the same reason tagging re-divides: two people splitting a line 50/50 must
 * become one person at 100% when the other leaves, not one at 50% with the
 * rest silently falling to the owner.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  const url = new URL(req.url);
  let personId = url.searchParams.get("person_id");
  if (!personId) {
    try {
      const body = (await req.json()) as { person_id?: unknown };
      if (typeof body.person_id === "string") personId = body.person_id;
    } catch {
      // No body is fine — the query parameter is the documented form.
    }
  }
  if (!personId) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  try {
    if (!(await ownsReceipt(id, uid))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const supabase = createServerClient();

    const { data: lineRows } = await supabase
      .from("receipt_lines")
      .select("id")
      .eq("receipt_id", id);
    const lineIds = ((lineRows ?? []) as { id: string }[]).map((l) => l.id);

    if (lineIds.length > 0) {
      await supabase
        .from("receipt_line_shares")
        .delete()
        .eq("person_id", personId)
        .in("receipt_line_id", lineIds);
    }

    const { error } = await supabase
      .from("receipt_participants")
      .delete()
      .eq("receipt_id", id)
      .eq("person_id", personId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Rebalance every line this person had been sharing evenly with others.
    await rebalanceLines(id, lineIds);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[receipts/[id]/participants DELETE]", err);
    return NextResponse.json({ error: "remove failed" }, { status: 500 });
  }
}
