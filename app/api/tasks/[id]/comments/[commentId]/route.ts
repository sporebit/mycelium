import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("task_comments")
      .delete()
      .eq("id", commentId)
      .eq("task_id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tasks/:id/comments/:commentId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
