import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { isValidCategory } from "@/lib/finance/taxonomy";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: { category?: string };
  try {
    body = (await req.json()) as { category?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const cat = typeof body.category === "string" ? body.category.trim() : "";
  if (cat !== "" && !isValidCategory(cat)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }

  const update = cat
    ? { category: cat, category_source: "manual" as const, category_locked: true, ai_confidence: null }
    : { category: null, category_source: null, category_locked: false, ai_confidence: null };

  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("transactions")
      .update(update)
      .eq("id", id)
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
