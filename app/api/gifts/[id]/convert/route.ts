import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { convertGift, GIFT_SELECT } from "@/lib/gifts/server";
import type { GiftRow } from "@/lib/gifts/types";

export const runtime = "nodejs";

/**
 * POST /api/gifts/:id/convert — "Buy this" (spec §8). A shortlisted gift
 * becomes a shopping-list purchase; the gift moves to bought and keeps the
 * purchase's id. One-way. 409 when the gift is not shortlisted or already
 * has a purchase.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase.from("gifts").select(GIFT_SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const result = await convertGift(supabase, data as unknown as GiftRow);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ gift: result.gift, purchase_id: result.purchase_id });
  } catch (err) {
    console.error("[/api/gifts/:id/convert POST]", err);
    return NextResponse.json({ error: "convert failed" }, { status: 500 });
  }
}
