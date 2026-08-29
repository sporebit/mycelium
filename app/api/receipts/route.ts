import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/storage/receipts";
import { parseReceipt } from "@/lib/receipts/parse";
import {
  ACCEPTED_MEDIA_TYPES,
  MAX_RECEIPT_IMAGES,
  RECEIPT_SELECT,
  RECEIPT_STATUSES,
  type ReceiptStatus,
} from "@/lib/types/receipt";

export const runtime = "nodejs";
// The POST parses inline, which is a multi-image vision call.
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/** HEIC is what an iPhone hands over by default and the vision API will not take it. */
function isHeic(type: string, name: string): boolean {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  return (
    t.includes("heic") ||
    t.includes("heif") ||
    n.endsWith(".heic") ||
    n.endsWith(".heif")
  );
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
    return NextResponse.json({ receipts: data ?? [] });
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
  if (files.length === 0) {
    return NextResponse.json(
      { error: "at least one image required in the 'images' field" },
      { status: 400 },
    );
  }
  if (files.length > MAX_RECEIPT_IMAGES) {
    return NextResponse.json(
      { error: `too many images: ${files.length} (max ${MAX_RECEIPT_IMAGES})` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (isHeic(file.type, file.name)) {
      return NextResponse.json(
        {
          error:
            "HEIC/HEIF images are not supported yet. On iPhone set Settings > Camera > Formats to 'Most Compatible', or export the photo as JPEG before uploading.",
        },
        { status: 415 },
      );
    }
    if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `unsupported image type '${file.type || "unknown"}' — use JPEG or PNG` },
        { status: 415 },
      );
    }
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
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaType = file.type === "image/jpg" ? "image/jpeg" : file.type;
      const path = await uploadReceiptImage(receiptId, buffer, mediaType, i);
      const { error: imgErr } = await supabase.from("receipt_images").insert({
        receipt_id: receiptId,
        storage_path: path,
        sort_order: i,
        media_type: mediaType,
      });
      if (imgErr) {
        console.error("[receipts POST] image row insert failed:", imgErr.message);
      }
    }

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
