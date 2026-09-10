import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { body?: string };
  try {
    body = (await req.json()) as { body?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const text = body.body?.trim();
  if (!text) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: id, body: text })
      .select("id, task_id, body, created_at, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");

    await supabase.from("task_activity").insert({
      task_id: id,
      action: "comment",
      field: null,
      from_value: null,
      to_value: text.slice(0, 200),
    });

    return NextResponse.json({ comment: data });
  } catch (err) {
    console.error("[/api/tasks/:id/comments POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
