import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { logTaskActivity } from "@/lib/task-activity";
import { principalUid, readJson, resolveTicketRef, statusIdFor, statusIdNamed, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

/**
 * POST /api/tickets/[key]/verify  { verified?: boolean }
 * Phil's live check, now "Close" (spec §18 R2): a Done ticket moves to the
 * Closed status and takes verified_by / verified_at. `verified: false`
 * reopens it to Done and clears both. Automation's evidence-backed Done is
 * the step before; Closed is the human signal on top.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await readJson<{ verified?: boolean }>(req)) ?? {};
  const on = body.verified !== false;
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (on && ref.category !== "done") {
      return NextResponse.json({ error: "only a Done ticket can be closed" }, { status: 409 });
    }
    const statusId = on
      ? await statusIdNamed(supabase, ref.space_id, "Closed")
      : await statusIdFor(supabase, ref.space_id, "done");
    if (!statusId) return NextResponse.json({ error: on ? "no Closed status in this space" : "no Done status in this space" }, { status: 500 });

    const verifiedAt = on ? new Date().toISOString() : null;
    const { data, error } = await supabase
      .from("tickets")
      .update({
        status_id: statusId,
        verified_by: on ? uid : null,
        verified_at: verifiedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ref.id)
      .select(TASK_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("update failed");
    await logTaskActivity(
      supabase,
      ref.id,
      { verified_at: on ? null : "verified", status_id: on ? "done" : "closed" },
      { verified_at: on ? "verified" : null, status_id: on ? "closed" : "done" },
    );
    const task = serializeTask(data as Parameters<typeof serializeTask>[0]);
    return NextResponse.json({ task, ticket: task });
  } catch (err) {
    console.error("[/api/tickets/:key/verify POST]", err);
    return NextResponse.json({ error: "verify failed" }, { status: 500 });
  }
}
