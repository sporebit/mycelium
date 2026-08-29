import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/receipts/parse";
import { storeReceiptImages, validateReceiptFiles } from "@/lib/receipts/upload";
import {
  RECEIPT_SELECT,
  RECEIPT_STATUSES,
  type Receipt,
  type ReceiptListItem,
  type ReceiptStatus,
} from "@/lib/types/receipt";

export const runtime = "nodejs";
// The POST parses inline, which is a multi-image vision call.
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const url = new URL(req.url);
  const retailer = url.searchParams.get("retailer");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("user_id", uid)
      .order("purchased_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (retailer) q = q.ilike("retailer", `%${retailer}%`);
    if (from) q = q.gte("purchased_at", from);
    if (to) q = q.lte("purchased_at", to);
    if (status && RECEIPT_STATUSES.includes(status as ReceiptStatus)) {
      q = q.eq("status", status);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Page counts come back in one extra round trip and are counted here,
    // matching how /api/people attaches its alias and mention counts. The merge
    // confirmation needs them to say how many images it is about to combine.
    const receipts = (data ?? []) as Receipt[];
    const countById = new Map<string, number>();
    if (receipts.length > 0) {
      const { data: imageRows } = await supabase
        .from("receipt_images")
        .select("receipt_id")
        .in(
          "receipt_id",
          receipts.map((r) => r.id),
        );
      for (const row of (imageRows ?? []) as { receipt_id: string }[]) {
        countById.set(row.receipt_id, (countById.get(row.receipt_id) ?? 0) + 1);
      }
    }

    const withCounts: ReceiptListItem[] = receipts.map((r) => ({
      ...r,
      image_count: countById.get(r.id) ?? 0,
    }));

    return NextResponse.json({ receipts: withCounts });
  } catch (err) {
    console.error("[receipts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  const rejection = validateReceiptFiles(files);
  if (rejection) {
    return NextResponse.json({ error: rejection.error }, { status: rejection.status });
  }

  const retailer = (form.get("retailer") as string | null)?.trim() || null;

  try {
    const supabase = createServerClient();

    const { data: created, error: insertErr } = await supabase
      .from("receipts")
      .insert({ user_id: uid, retailer, status: "uploaded" })
      .select(RECEIPT_SELECT)
      .single();

    if (insertErr || !created) {
      return NextResponse.json(
        { error: insertErr?.message ?? "create failed" },
        { status: 500 },
      );
    }

    const receiptId = (created as { id: string }).id;

    // Store every page before parsing, so a parse failure still leaves the
    // images on disk for a reparse.
    await storeReceiptImages(receiptId, files);

    const outcome = await parseReceipt(receiptId);

    const { data: fresh } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("id", receiptId)
      .single();

    return NextResponse.json({ receipt: fresh ?? created, parse: outcome }, { status: 201 });
  } catch (err) {
    console.error("[receipts POST]", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}
