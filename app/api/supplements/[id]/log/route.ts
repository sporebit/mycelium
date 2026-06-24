import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  let body: { date?: string; timing_slot?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    /* empty body from legacy callers is fine */
  }

  try {
    const supabase = createServerClient();

    const { data: supp } = await supabase
      .from("supplements")
      .select("id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    if (!supp) {
      return NextResponse.json(
        { error: "supplement not found" },
        { status: 404 },
      );
    }

    const insert: Record<string, unknown> = {
      user_id: uid,
      supplement_id: id,
    };
    if (body.date) insert.date = body.date;
    if (body.timing_slot) insert.timing_slot = body.timing_slot;

    const { data, error } = await supabase
      .from("supplement_logs")
      .insert(insert)
      .select("id, supplement_id, taken_at, date, timing_slot")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ log: data });
  } catch (err) {
    console.error("[/api/supplements/:id/log POST]", err);
    return NextResponse.json({ error: "log failed" }, { status: 500 });
  }
}
