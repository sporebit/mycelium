import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; logId: string }> },
) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id, logId } = await ctx.params;

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("supplement_logs")
      .delete()
      .eq("id", logId)
      .eq("supplement_id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/supplements/:id/log/:logId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
