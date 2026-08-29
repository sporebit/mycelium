import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseReceipt } from "@/lib/receipts/parse";
import { RECEIPT_SELECT } from "@/lib/types/receipt";

export const runtime = "nodejs";
// Reparses the combined receipt inline, which is a multi-image vision call.
export const maxDuration = 60;

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type ImageRow = {
  id: string;
  receipt_id: string;
  sort_order: number;
};

/**
 * POST — fold several receipts into one.
 *
 * The same till receipt photographed twice, or page by page across separate
 * uploads, arrives as separate rows. Merging keeps the earliest-created
 * receipt (its id is the one already linked to from elsewhere) and moves every
 * other receipt's images onto it.
 *
 * Order is by source receipt created_at, then by each image's own sort_order:
 * that reproduces the order the pages were photographed in, which is the order
 * the parse prompt assumes when it de-duplicates overlapping pages.
 *
 * The moved rows are renumbered into one sequence rather than keeping their
 * old sort_order. Every receipt numbers its own pages from zero, so carrying
 * them across unchanged would leave several rows claiming to be page one.
 */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === "string"))]
    : [];
  if (ids.length < 2) {
    return NextResponse.json(
      { error: "at least two receipt ids required" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();

    // Ownership is checked by filtering on user_id and requiring every id back:
    // a merge that silently skipped a receipt belonging to someone else would
    // delete the wrong set.
    const { data: owned, error: ownErr } = await supabase
      .from("receipts")
      .select("id, created_at")
      .eq("user_id", uid)
      .in("id", ids)
      .order("created_at", { ascending: true });

    if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 });

    const rows = (owned ?? []) as { id: string; created_at: string }[];
    if (rows.length !== ids.length) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const keepId = rows[0].id;
    const dropIds = rows.slice(1).map((r) => r.id);
    // created_at ascending, so a source's position here is its photograph order.
    const rank = new Map(rows.map((r, i) => [r.id, i]));

    const { data: imageRows, error: imgErr } = await supabase
      .from("receipt_images")
      .select("id, receipt_id, sort_order")
      .in("receipt_id", ids);

    if (imgErr) return NextResponse.json({ error: imgErr.message }, { status: 500 });

    const images = ((imageRows ?? []) as ImageRow[]).slice().sort((a, b) => {
      const ra = rank.get(a.receipt_id) ?? 0;
      const rb = rank.get(b.receipt_id) ?? 0;
      if (ra !== rb) return ra - rb;
      return a.sort_order - b.sort_order;
    });

    // Renumber onto a scratch range first. sort_order has no unique constraint
    // today, but writing 0..n-1 directly over rows that already hold 0..n-1
    // would make the intermediate state ambiguous if one ever gained a
    // constraint, and the two-pass write costs nothing at these row counts.
    const offset = images.length;
    for (let i = 0; i < images.length; i++) {
      await supabase
        .from("receipt_images")
        .update({ receipt_id: keepId, sort_order: offset + i })
        .eq("id", images[i].id);
    }
    for (let i = 0; i < images.length; i++) {
      await supabase
        .from("receipt_images")
        .update({ sort_order: i })
        .eq("id", images[i].id);
    }

    // Only now are the losing receipts safe to remove: receipt_images cascades
    // on delete, so deleting first would take the images with it. Their storage
    // objects are deliberately not removed — the rows that name them now belong
    // to the surviving receipt.
    const { error: delErr } = await supabase
      .from("receipts")
      .delete()
      .eq("user_id", uid)
      .in("id", dropIds);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const outcome = await parseReceipt(keepId);

    const { data: fresh } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("id", keepId)
      .single();

    return NextResponse.json({
      receipt: fresh,
      parse: outcome,
      merged: dropIds.length,
      images: images.length,
    });
  } catch (err) {
    console.error("[receipts/merge POST]", err);
    return NextResponse.json({ error: "merge failed" }, { status: 500 });
  }
}
