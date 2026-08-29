import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/receipts/parse";
import {
  nextSortOrder,
  storeReceiptImages,
  validateReceiptFiles,
} from "@/lib/receipts/upload";
import { RECEIPT_SELECT } from "@/lib/types/receipt";

export const runtime = "nodejs";
// Reparses inline once the new pages are stored, which is a multi-image
// vision call over the whole receipt.
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * POST — append pages to an existing receipt.
 *
 * Takes the same multipart 'images' field as the create endpoint and runs the
 * same validation, then numbers the new pages from one past the receipt's
 * current highest sort_order and reparses.
 *
 * The reparse is not optional: parseReceipt replaces the whole line set from
 * all pages at once, so a receipt whose photos changed but whose lines did not
 * would be showing a reading of a document that no longer exists.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    const { data: owned } = await supabase
      .from("receipts")
      .select("id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { count: existingCount } = await supabase
      .from("receipt_images")
      .select("id", { count: "exact", head: true })
      .eq("receipt_id", id);

    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    const rejection = validateReceiptFiles(files, existingCount ?? 0);
    if (rejection) {
      return NextResponse.json({ error: rejection.error }, { status: rejection.status });
    }

    const start = await nextSortOrder(id);
    const stored = await storeReceiptImages(id, files, start);
    if (stored === 0) {
      return NextResponse.json({ error: "no images stored" }, { status: 500 });
    }

    const outcome = await parseReceipt(id);

    const { data: fresh } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("id", id)
      .single();

    return NextResponse.json({ receipt: fresh, parse: outcome, added: stored }, { status: 201 });
  } catch (err) {
    console.error("[receipts/[id]/images POST]", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}
