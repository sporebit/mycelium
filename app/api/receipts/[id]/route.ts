import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getSignedUrl, removeReceiptImages } from "@/lib/storage/receipts";
import { namesFor } from "@/lib/receipts/participants";
import { reconcile } from "@/lib/receipts/reconcile";
import {
  RECEIPT_IMAGE_SELECT,
  RECEIPT_LINE_SELECT,
  RECEIPT_LINE_SHARE_SELECT,
  RECEIPT_PARTICIPANT_SELECT,
  RECEIPT_SELECT,
  type ReceiptImage,
  type ReceiptImageWithUrl,
  type ReceiptLineShare,
  type ReceiptParticipant,
  type ReceiptParticipantWithPerson,
  type ReceiptStatus,
} from "@/lib/types/receipt";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set(["title", "retailer", "purchased_at", "total"]);

/** A real calendar date in YYYY-MM-DD, which is all the purchased_at column holds. */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();

    const { data: receipt, error } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!receipt) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data: imageRows } = await supabase
      .from("receipt_images")
      .select(RECEIPT_IMAGE_SELECT)
      .eq("receipt_id", id)
      .order("sort_order", { ascending: true });

    const { data: lines } = await supabase
      .from("receipt_lines")
      .select(RECEIPT_LINE_SELECT)
      .eq("receipt_id", id)
      .order("sort_order", { ascending: true });

    const images: ReceiptImageWithUrl[] = await Promise.all(
      ((imageRows ?? []) as ReceiptImage[]).map(async (img) => ({
        ...img,
        signed_url: await getSignedUrl(img.storage_path),
      })),
    );

    // Participants and every line's shares travel with the detail response so
    // the split UI renders in one round trip rather than one per line.
    const { data: participantRows } = await supabase
      .from("receipt_participants")
      .select(RECEIPT_PARTICIPANT_SELECT)
      .eq("receipt_id", id)
      .order("created_at", { ascending: true });

    const participantList = (participantRows ?? []) as ReceiptParticipant[];
    const names = await namesFor(participantList.map((p) => p.person_id));
    const participants: ReceiptParticipantWithPerson[] = participantList.map((p) => ({
      ...p,
      display_name: names.get(p.person_id) ?? "Unknown",
    }));

    const lineIds = ((lines ?? []) as { id: string }[]).map((l) => l.id);
    let shares: ReceiptLineShare[] = [];
    if (lineIds.length > 0) {
      const { data: shareRows } = await supabase
        .from("receipt_line_shares")
        .select(RECEIPT_LINE_SHARE_SELECT)
        .in("receipt_line_id", lineIds);
      shares = (shareRows ?? []) as ReceiptLineShare[];
    }

    return NextResponse.json({
      receipt,
      images,
      lines: lines ?? [],
      participants,
      shares,
    });
  } catch (err) {
    console.error("[receipts/[id] GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    // Clearing the title field in the UI sends "", which has to reach the
    // column as NULL — otherwise the list would fall back on an empty string
    // instead of on the retailer.
    if (k === "title" && typeof v === "string") {
      patch[k] = v.trim() || null;
      continue;
    }
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  // A value the column cannot hold is the caller's mistake, not a server error.
  if ("purchased_at" in patch && patch.purchased_at !== null && !isIsoDate(patch.purchased_at)) {
    return NextResponse.json(
      { error: "purchased_at must be YYYY-MM-DD or null" },
      { status: 400 },
    );
  }
  if ("total" in patch && patch.total !== null) {
    const total =
      typeof patch.total === "number" || (typeof patch.total === "string" && patch.total.trim())
        ? Number(patch.total)
        : NaN;
    if (!Number.isFinite(total)) {
      return NextResponse.json({ error: "total must be a number or null" }, { status: 400 });
    }
    patch.total = total;
  }
  patch.updated_at = new Date().toISOString();

  try {
    const supabase = await createUserClient();

    // The printed total is one half of the reconciliation, so correcting it
    // re-judges the receipt by the parser's own rule. Short of a reparse it is
    // the only way out of 'no_total'. A failed or in-flight read keeps its
    // status, as it does for a line edit: its line set says nothing yet.
    if ("total" in patch) {
      const { data: current } = await supabase
        .from("receipts")
        .select("parsed_total, status")
        .eq("id", id)
        .maybeSingle<{ parsed_total: number | null; status: ReceiptStatus }>();
      if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (
        current.parsed_total !== null &&
        current.status !== "failed" &&
        current.status !== "parsing"
      ) {
        const outcome = reconcile(
          Number(current.parsed_total),
          patch.total as number | null,
        );
        patch.status = outcome.status;
        patch.review_reason = outcome.review_reason;
      }
    }

    const { data, error } = await supabase
      .from("receipts")
      .update(patch)
      .eq("id", id)
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
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();

    // RLS returns the row only to someone who can reach it, so no row is
    // "not found" rather than a success that deleted nothing.
    const { data: owned } = await supabase
      .from("receipts")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

    // The photographs go before the receipt. The bucket lets a file be removed
    // only while the receipt it is filed under still exists (0158), so deleting
    // the receipt first would leave every image in storage with nobody able to
    // remove it.
    //
    // The image rows are deleted first and read back: RLS lets them go only
    // for someone allowed to delete here, so a caller who can see the receipt
    // but may not delete it gets no paths and no photograph is touched.
    const { data: imageRows, error: imageErr } = await supabase
      .from("receipt_images")
      .delete()
      .eq("receipt_id", id)
      .select("storage_path");
    if (imageErr) return NextResponse.json({ error: imageErr.message }, { status: 500 });

    await removeReceiptImages(
      ((imageRows ?? []) as { storage_path: string }[]).map((r) => r.storage_path),
    );

    const { data: removed, error } = await supabase
      .from("receipts")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!removed) {
      return NextResponse.json({ error: "you may not delete this receipt" }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[receipts/[id] DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
