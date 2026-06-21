import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  try {
    const { stepId } = await ctx.params;
    const body = await req.json();
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("venture_steps")
      .update(body)
      .eq("id", stepId)
      .select()
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ step: data });
  } catch (err) {
    console.error("[ventures/:id/steps/:stepId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; stepId: string }> },
) {
  try {
    const { stepId } = await ctx.params;
    const supabase = createServerClient();
    const { error } = await supabase
      .from("venture_steps")
      .delete()
      .eq("id", stepId);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ventures/:id/steps/:stepId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
