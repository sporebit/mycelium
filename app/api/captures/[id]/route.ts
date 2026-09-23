import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * Soft-delete a capture (MYC-151). Decisions and notes are captures routed
 * to themselves, so this is how a decision is removed: `deleted_at` is set
 * (every list already filters on it — the audit row stays) and the capture's
 * memory chunk goes, so Ask stops citing it. Anything the capture was routed
 * to elsewhere (a ticket, a media item) is left alone; delete that on its
 * own surface.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("raw_captures")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { error: chunkErr } = await supabase.from("memory_chunks").delete().eq("source_type", "capture").eq("source_id", id);
    if (chunkErr) console.error("[/api/captures/:id DELETE] memory chunk delete failed:", chunkErr.message);

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[/api/captures/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
