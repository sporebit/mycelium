import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isReconcilable, money, reconcile } from "@/lib/receipts/reconcile";
import { RECEIPT_LINE_SELECT, type ReceiptStatus } from "@/lib/types/receipt";

export const runtime = "nodejs";

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
    // parent receipt before anything is written. The reconciliation columns are
    // selected in the same round trip because the edit below has to re-judge
    // the receipt against its printed total.
    const { data: parent } = await supabase
      .from("receipts")
      .select("id, total, status, review_reason")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle<{
        id: string;
        total: number | null;
        status: ReceiptStatus;
        review_reason: string | null;
      }>();
    if (!parent) return NextResponse.json({ error: "not found" }, { status: 404 });

    // A reparse deletes and re-inserts the whole line set, and the vision call
    // it waits on runs for tens of seconds. An edit landing inside that window
    // is written into a line set that is about to be discarded, and the sum
    // taken below would cover whatever partial set happens to exist. Refusing
    // is the honest outcome: the edit would not have survived, so say so rather
    // than accept it and lose it.
    if (parent.status === "parsing") {
      return NextResponse.json(
        { error: "receipt is being parsed, try again when it finishes" },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("receipt_lines")
      .update(patch)
      .eq("id", lineId)
      .eq("receipt_id", id)
      .select(RECEIPT_LINE_SELECT)
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

    const parsedTotal = money(
      ((allLines ?? []) as { line_total: number | null }[]).reduce(
        (sum, l) => sum + (Number(l.line_total) || 0),
        0,
      ),
    );

    // A new parsed_total means the old status is a stale judgement, so the
    // parser's own rule is re-run over the edited figures — an edit that brings
    // the lines back within tolerance clears 'total_mismatch' by itself, and one
    // that breaks them raises it. 'failed' and 'no_total' are left alone: see
    // isReconcilable().
    const update: Record<string, unknown> = {
      parsed_total: parsedTotal,
      updated_at: new Date().toISOString(),
    };
    if (isReconcilable(parent.status, parent.review_reason)) {
      const outcome = reconcile(
        parsedTotal,
        parent.total === null ? null : Number(parent.total),
      );
      update.status = outcome.status;
      update.review_reason = outcome.review_reason;
    }

    // The guard above reads the status; a reparse can still begin between that
    // read and this write, and would then have emptied the line set that fed
    // parsedTotal. Re-asserting the condition as a filter closes that window at
    // the database: if a reparse has since claimed the receipt, this write is
    // skipped and the reparse's own figures stand.
    const { data: written } = await supabase
      .from("receipts")
      .update(update)
      .eq("id", id)
      .neq("status", "parsing")
      .select("parsed_total, status, review_reason")
      .maybeSingle<{
        parsed_total: number | null;
        status: ReceiptStatus;
        review_reason: string | null;
      }>();

    // No row came back, so the filter excluded it and a reparse owns the
    // receipt. That reparse drops the line set this edit was made against, so
    // the edit has not survived either — the same answer as the guard above,
    // rather than a body reporting figures that were never stored.
    if (!written) {
      return NextResponse.json(
        { error: "receipt is being parsed, try again when it finishes" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      line: data,
      parsed_total: written.parsed_total,
      status: written.status,
      review_reason: written.review_reason,
    });
  } catch (err) {
    console.error("[receipts/[id]/lines/[lineId] PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
