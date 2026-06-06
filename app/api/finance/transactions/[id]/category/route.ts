import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isValidCategory } from "@/lib/finance/categorise";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = process.env.USER_ID;
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  let body: { category?: string };
  try {
    body = (await req.json()) as { category?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const cat = typeof body.category === "string" ? body.category.trim() : "";
  if (!isValidCategory(cat)) {
    return NextResponse.json(
      { error: "invalid category", valid: [...new Set([])] },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .update({
        category: cat,
        category_source: "manual",
        category_locked: true,
        ai_confidence: null,
      })
      .eq("id", id)
      .eq("user_id", uid)
      .select("id, category, category_source, category_locked")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ transaction: data });
  } catch (err) {
    console.error("[/api/finance/transactions/:id/category POST]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
