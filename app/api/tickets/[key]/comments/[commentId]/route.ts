import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, resolveTicketRef, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

/** DELETE /api/tickets/[key]/comments/[commentId] — remove one comment (was /api/tasks/[id]/comments/[commentId]). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string; commentId: string }> },
) {
  const { key, commentId } = await ctx.params;
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { error } = await supabase
      .from("ticket_comments")
      .delete()
      .eq("id", commentId)
      .eq("ticket_id", ref.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tickets/:key/comments/:commentId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
