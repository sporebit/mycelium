import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supabase = await createUserClient();
  const { error } = await supabase
    .from("exercise_aliases")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[/api/fitness/exercise-aliases/:id DELETE]", error);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
