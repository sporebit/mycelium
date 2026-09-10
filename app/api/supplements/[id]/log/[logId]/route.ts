import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; logId: string }> },
) {
  const { id, logId } = await ctx.params;

  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("supplement_logs")
      .delete()
      .eq("id", logId)
      .eq("supplement_id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/supplements/:id/log/:logId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
