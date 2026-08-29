import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { lineForShares } from "@/lib/receipts/participants";
import { tagPerson, untagPerson } from "@/lib/receipts/tagging";
import { ownerRemainder, shareAmounts } from "@/lib/receipts/shares";
import {
  RECEIPT_LINE_SHARE_SELECT,
  type ReceiptLineShare,
} from "@/lib/types/receipt";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

async function currentShares(
  lineId: string,
  lineTotal: number,
  quantity: number,
) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("receipt_line_shares")
    .select(RECEIPT_LINE_SHARE_SELECT)
    .eq("receipt_line_id", lineId);

  const shares = (data ?? []) as ReceiptLineShare[];
  return {
    shares: shareAmounts(shares, lineTotal, quantity),
    owner_remainder: ownerRemainder(shares, lineTotal, quantity),
  };
}

async function personId(req: NextRequest): Promise<string | null> {
  const fromQuery = new URL(req.url).searchParams.get("person_id");
  if (fromQuery) return fromQuery;
  try {
    const body = (await req.json()) as { person_id?: unknown };
    return typeof body.person_id === "string" ? body.person_id : null;
  } catch {
    return null;
  }
}

/**
 * POST — tag a person on this line at the receipt's default share.
 *
 * The convenience form of the shares PUT: no figure is given, so the receipt's
 * own rules decide one. The whole line is re-divided, not just this person's
 * row — see lib/receipts/tagging.ts.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, lineId } = await ctx.params;

  const person = await personId(req);
  if (!person) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  try {
    const line = await lineForShares(id, lineId, uid);
    if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });

    const supabase = createServerClient();
    const { data: participant } = await supabase
      .from("receipt_participants")
      .select("person_id")
      .eq("receipt_id", id)
      .eq("person_id", person)
      .maybeSingle();
    if (!participant) {
      return NextResponse.json(
        { error: "person is not a participant on this receipt" },
        { status: 400 },
      );
    }

    await tagPerson(id, lineId, person, line.quantity);
    return NextResponse.json(
      await currentShares(lineId, line.line_total, line.quantity),
    );
  } catch (err) {
    console.error("[receipts/[id]/lines/[lineId]/tag POST]", err);
    return NextResponse.json({ error: "tag failed" }, { status: 500 });
  }
}

/** DELETE — untag a person, re-dividing the line between whoever is left. */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, lineId } = await ctx.params;

  const person = await personId(req);
  if (!person) {
    return NextResponse.json({ error: "person_id required" }, { status: 400 });
  }

  try {
    const line = await lineForShares(id, lineId, uid);
    if (!line) return NextResponse.json({ error: "not found" }, { status: 404 });

    await untagPerson(id, lineId, person, line.quantity);
    return NextResponse.json(
      await currentShares(lineId, line.line_total, line.quantity),
    );
  } catch (err) {
    console.error("[receipts/[id]/lines/[lineId]/tag DELETE]", err);
    return NextResponse.json({ error: "untag failed" }, { status: 500 });
  }
}
