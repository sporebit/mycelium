import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("workout_programmes")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/fitness/programmes/:id/archive]", err);
    return NextResponse.json({ error: "archive failed" }, { status: 500 });
  }
}
