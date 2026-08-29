import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const LINE_SELECT =
  "id, receipt_id, sort_order, item_code, description, quantity, unit_price, vat, line_total, vat_code, raw_text, created_at";

const ALLOWED_FIELDS = new Set([
  "description",
  "quantity",
  "unit_price",
  "vat",
  "line_total",
  "item_code",
]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lineId: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, lineId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // receipt_lines has no user_id of its own, so ownership is checked on the
    // parent receipt before anything is written.
    const { data: parent } = await supabase
      .from("receipts")
      .select("id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("receipt_lines")
      .update(patch)
      .eq("id", lineId)
      .eq("receipt_id", id)
      .select(LINE_SELECT)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Editing a line changes what the lines add up to, so the stored
    // reconciliation figure is recomputed here rather than drifting until the
    // next reparse.
    const { data: allLines } = await supabase
      .from("receipt_lines")
      .select("line_total")
      .eq("receipt_id", id);

    const parsedTotal =
      Math.round(
        ((allLines ?? []) as { line_total: number | null }[]).reduce(
          (sum, l) => sum + (Number(l.line_total) || 0),
          0,
        ) * 100,
      ) / 100;

    await supabase
      .from("receipts")
      .update({ parsed_total: parsedTotal, updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ line: data, parsed_total: parsedTotal });
  } catch (err) {
    console.error("[receipts/[id]/lines/[lineId] PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
