import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("raw_captures")
      .select("id, source, raw_text, classification, created_at, routed_to, routed_id")
      .eq("classification->>resolved_entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ captures: data ?? [] });
  } catch (err) {
    console.error("[/api/people/:id/captures GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
