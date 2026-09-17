import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, resolveTicketRef, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

const COMMENT_SELECT = "id, task_id:ticket_id, body, created_at, updated_at";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase
      .from("ticket_comments")
      .select(COMMENT_SELECT)
      .eq("ticket_id", ref.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ comments: data ?? [] });
  } catch (err) {
    console.error("[/api/tickets/:key/comments GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST { body } — a markdown comment; Claude session reports land here. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<{ body?: string }>(req);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const ref = await resolveTicketRef(supabase, key);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("ticket_comments")
      .insert({ ticket_id: ref.id, body: text })
      .select(COMMENT_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    await supabase.from("ticket_activity").insert({
      ticket_id: ref.id,
      action: "comment",
      field: null,
      from_value: null,
      to_value: text.slice(0, 200),
    });
    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets/:key/comments POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
