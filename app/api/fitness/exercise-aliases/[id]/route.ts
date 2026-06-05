import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  const supabase = createServerClient();
  const { error } = await supabase
    .from("exercise_aliases")
    .delete()
    .eq("id", id)
    .eq("user_id", uid);

  if (error) {
    console.error("[/api/fitness/exercise-aliases/:id DELETE]", error);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
