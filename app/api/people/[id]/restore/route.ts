import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { restorePerson } from "@/lib/people/contacts";

export const runtime = "nodejs";

/** POST /api/people/[id]/restore — out of the bin (people-contacts C4). A merged loser cannot be restored; its links belong to the survivor. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data } = await supabase.from("people").select("id, deleted_at, merged_into_id").eq("id", id).maybeSingle();
    const row = data as { id: string; deleted_at: string | null; merged_into_id: string | null } | null;
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!row.deleted_at) return NextResponse.json({ ok: true, id, already: true });
    if (row.merged_into_id) return NextResponse.json({ error: "merged into another person; open the survivor instead", survivor: row.merged_into_id }, { status: 409 });
    const ok = await restorePerson(supabase, id);
    if (!ok) return NextResponse.json({ error: "restore failed" }, { status: 500 });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[/api/people/:id/restore POST]", err);
    return NextResponse.json({ error: "restore failed" }, { status: 500 });
  }
}
