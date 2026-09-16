import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";

/**
 * Look a ticket up by its stable key (e.g. "MYC-33") rather than its uuid.
 * Part B: powers the /organisation/tickets/[key] page and shareable URLs.
 * Mutations still go through /api/tasks/[id] (the compatibility surface) by
 * the id this returns, so there is one write path during the transition.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data: row, error } = await supabase
      .from("tickets")
      .select(TASK_SELECT)
      .eq("ticket_key", key)
      .maybeSingle();
    if (error || !row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const task = serializeTask(row as Parameters<typeof serializeTask>[0]);

    const [comments, activity] = await Promise.all([
      supabase
        .from("ticket_comments")
        .select("id, task_id:ticket_id, body, created_at, updated_at")
        .eq("ticket_id", task.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("ticket_activity")
        .select("id, task_id:ticket_id, action, field, from_value, to_value, created_at")
        .eq("ticket_id", task.id)
        .order("created_at", { ascending: true }),
    ]);

    return NextResponse.json({
      task,
      comments: comments.data ?? [],
      activity: activity.data ?? [],
    });
  } catch (err) {
    console.error("[/api/tickets/:key GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
