import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readIdList } from "@/lib/hours/entry";

export const runtime = "nodejs";

/**
 * POST /api/hours/entries/merge (0157) — MERGE: every entry waiting in the
 * Log's holding section joins the record. Dated ones appear under their day,
 * dateless ones in the Backlog; both start counting in every figure. With a
 * body `{ ids }` (Phil, 2026-11-23: tick what to merge) only those held rows
 * merge and the rest keep waiting; a row that is not held is not counted.
 * Returns { merged }. Nothing else about a row changes.
 */
export async function POST(req: NextRequest) {
  const body = await req.text().catch(() => "");
  let ids: string[] | null = null;
  if (body.trim() !== "") {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Send JSON." }, { status: 400 });
    }
    const read = readIdList(parsed);
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
    ids = read.ids;
  }
  try {
    const supabase = await createUserClient();
    const now = new Date().toISOString();
    let q = supabase.from("hours_entries").update({ merged_at: now, updated_at: now }).is("merged_at", null).is("deleted_at", null);
    if (ids) q = q.in("id", ids);
    const { data, error } = await q.select("id");
    if (error) throw error;
    return NextResponse.json({ merged: data?.length ?? 0 });
  } catch (err) {
    console.error("[/api/hours/entries/merge POST]", err);
    return NextResponse.json({ error: "merge failed" }, { status: 500 });
  }
}
