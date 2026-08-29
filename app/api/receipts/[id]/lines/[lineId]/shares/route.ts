import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { lineForShares } from "@/lib/receipts/participants";
import { ownerRemainder, shareAmounts, validateShares } from "@/lib/receipts/shares";
import {
  RECEIPT_LINE_SHARE_SELECT,
  type ReceiptLineShare,
} from "@/lib/types/receipt";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** GET — the shares on one line, priced, with the owner's remainder. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, lineId } = await ctx.params;

  try {
    const line = await lineForShares(id, lineId, uid);
    if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });

    const supabase = createServerClient();
    const { data } = await supabase
      .from("receipt_line_shares")
      .select(RECEIPT_LINE_SHARE_SELECT)
      .eq("receipt_line_id", lineId);

    const shares = (data ?? []) as ReceiptLineShare[];
    return NextResponse.json({
      shares: shareAmounts(shares, line.line_total, line.quantity),
      owner_remainder: ownerRemainder(shares, line.line_total, line.quantity),
    });
  } catch (err) {
    console.error("[receipts/[id]/lines/[lineId]/shares GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * PUT — replace the whole set of shares on a line.
 *
 * Replacing rather than merging is what makes the request self-describing: the
 * body is the line's shares afterwards, so removing someone is expressed by
 * leaving them out rather than by a second call. An empty array clears the
 * line, which returns all of it to the owner.
 *
 * Validation happens against the set as a whole, because the rule being
 * enforced is a property of the set — no line may be claimed for more than it
 * is worth — and that cannot be checked one row at a time.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, lineId } = await ctx.params;

  let body: { shares?: unknown };
  try {
    body = (await req.json()) as { shares?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!Array.isArray(body.shares)) {
    return NextResponse.json({ error: "shares array required" }, { status: 400 });
  }

  const incoming = body.shares.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    return {
      person_id: typeof s.person_id === "string" ? s.person_id : "",
      share_pct: numOrNull(s.share_pct),
      units: numOrNull(s.units),
    };
  });

  if (incoming.some((s) => !s.person_id)) {
    return NextResponse.json(
      { error: "every share needs a person_id" },
      { status: 400 },
    );
  }

  try {
    const line = await lineForShares(id, lineId, uid);
    if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });

    const verdict = validateShares(incoming, line.quantity);
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error }, { status: 400 });
    }

    const supabase = createServerClient();

    // Everyone named has to be a participant on this receipt. Without the
    // check, a share could be written for someone the receipt does not list,
    // and the participants strip would have no chip to show it against.
    const { data: participantRows } = await supabase
      .from("receipt_participants")
      .select("person_id")
      .eq("receipt_id", id);
    const participants = new Set(
      ((participantRows ?? []) as { person_id: string }[]).map((p) => p.person_id),
    );
    const stranger = incoming.find((s) => !participants.has(s.person_id));
    if (stranger) {
      return NextResponse.json(
        { error: "every share must name a participant on this receipt" },
        { status: 400 },
      );
    }

    if (incoming.length > 0) {
      const { error } = await supabase.from("receipt_line_shares").upsert(
        incoming.map((s) => ({
          receipt_line_id: lineId,
          person_id: s.person_id,
          share_pct: s.share_pct,
          units: s.units,
        })),
        { onConflict: "receipt_line_id,person_id" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Anyone not in the new set is no longer on the line. Deleting after the
    // upsert means the line is never momentarily unshared.
    const keep = incoming.map((s) => s.person_id);
    let del = supabase
      .from("receipt_line_shares")
      .delete()
      .eq("receipt_line_id", lineId);
    if (keep.length > 0) del = del.not("person_id", "in", `(${keep.join(",")})`);
    await del;

    const { data: fresh } = await supabase
      .from("receipt_line_shares")
      .select(RECEIPT_LINE_SHARE_SELECT)
      .eq("receipt_line_id", lineId);

    const shares = (fresh ?? []) as ReceiptLineShare[];
    return NextResponse.json({
      shares: shareAmounts(shares, line.line_total, line.quantity),
      owner_remainder: ownerRemainder(shares, line.line_total, line.quantity),
    });
  } catch (err) {
    console.error("[receipts/[id]/lines/[lineId]/shares PUT]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
