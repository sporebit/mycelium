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
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
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
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: id, user_id: uid, body: text })
      .select("id, task_id, user_id, body, created_at, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");

    await supabase.from("task_activity").insert({
      task_id: id,
      user_id: uid,
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
