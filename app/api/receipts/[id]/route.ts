import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSignedUrl, removeReceiptImages } from "@/lib/storage/receipts";
import type { ReceiptImage, ReceiptImageWithUrl } from "@/lib/types/receipt";

export const runtime = "nodejs";

const RECEIPT_SELECT =
  "id, user_id, retailer, purchased_at, currency, subtotal, vat_total, total, parsed_total, status, review_reason, raw_parse, created_at, updated_at";

const LINE_SELECT =
  "id, receipt_id, sort_order, item_code, description, quantity, unit_price, vat, line_total, vat_code, raw_text, created_at";

const ALLOWED_FIELDS = new Set(["retailer", "purchased_at", "total"]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const supabase = createServerClient();

    const { data: receipt, error } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!receipt) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: imageRows } = await supabase
      .from("receipt_images")
      .select("id, receipt_id, storage_path, sort_order, media_type, created_at")
      .eq("receipt_id", id)
      .order("sort_order", { ascending: true });

    const { data: lines } = await supabase
      .from("receipt_lines")
      .select(LINE_SELECT)
      .eq("receipt_id", id)
      .order("sort_order", { ascending: true });

    const images: ReceiptImageWithUrl[] = await Promise.all(
      ((imageRows ?? []) as ReceiptImage[]).map(async (img) => ({
        ...img,
        signed_url: await getSignedUrl(img.storage_path),
      })),
    );

    return NextResponse.json({ receipt, images, lines: lines ?? [] });
  } catch (err) {
    console.error("[receipts/[id] GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

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
  patch.updated_at = new Date().toISOString();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("receipts")
      .update(patch)
      .eq("id", id)
      .eq("user_id", uid)
      .select(RECEIPT_SELECT)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ receipt: data });
  } catch (err) {
    console.error("[receipts/[id] PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const supabase = createServerClient();

    // Collect storage paths before the cascade removes the rows that name them.
    const { data: imageRows } = await supabase
      .from("receipt_images")
      .select("storage_path")
      .eq("receipt_id", id);

    const { error } = await supabase
      .from("receipts")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await removeReceiptImages(
      ((imageRows ?? []) as { storage_path: string }[]).map((r) => r.storage_path),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[receipts/[id] DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
