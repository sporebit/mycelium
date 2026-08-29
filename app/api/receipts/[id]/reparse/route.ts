import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/receipts/parse";

export const runtime = "nodejs";
// Re-runs the multi-image vision call against the stored images.
export const maxDuration = 60;

const RECEIPT_SELECT =
  "id, user_id, retailer, purchased_at, currency, subtotal, vat_total, total, parsed_total, status, review_reason, raw_parse, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const supabase = createServerClient();

    const { data: owned } = await supabase
      .from("receipts")
      .select("id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

    const outcome = await parseReceipt(id);

    const { data: fresh } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("id", id)
      .single();

    return NextResponse.json({ receipt: fresh, parse: outcome });
  } catch (err) {
    console.error("[receipts/[id]/reparse POST]", err);
    return NextResponse.json({ error: "reparse failed" }, { status: 500 });
  }
}
