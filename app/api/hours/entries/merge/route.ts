import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * POST /api/hours/entries/merge (0157) — MERGE: every entry waiting in the
 * Log's holding section joins the record. Dated ones appear under their day,
 * dateless ones in the Backlog; both start counting in every figure. Returns
 * { merged }. Nothing else about a row changes.
 */
export async function POST() {
  try {
    const supabase = await createUserClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("hours_entries").update({ merged_at: now, updated_at: now }).is("merged_at", null).is("deleted_at", null).select("id");
    if (error) throw error;
    return NextResponse.json({ merged: data?.length ?? 0 });
  } catch (err) {
    console.error("[/api/hours/entries/merge POST]", err);
    return NextResponse.json({ error: "merge failed" }, { status: 500 });
  }
}
