import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { isUuid } from "@/lib/gifts/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const SELECT = "id, gift_id, body, body_doc, created_at, updated_at, created_by";

/** GET — the notes thread, oldest first (spec decision 10: ideas evolve over months). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data: gift } = await supabase.from("gifts").select("id").eq("id", id).maybeSingle();
    if (!gift) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase.from("gift_comments").select(SELECT).eq("gift_id", id).order("created_at", { ascending: true }).limit(500);
    if (error) throw error;
    return NextResponse.json({ comments: data ?? [] });
  } catch (err) {
    console.error("[/api/gifts/:id/comments GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST { body } — add a note. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readJson<{ body?: string }>(req);
  const text = body?.body?.trim();
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data: gift } = await supabase.from("gifts").select("id").eq("id", id).maybeSingle();
    if (!gift) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase.from("gift_comments").insert({ gift_id: id, body: text.slice(0, 20000) }).select(SELECT).single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    await supabase.from("gifts").update({ updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/gifts/:id/comments POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}

/** DELETE ?comment=<id> — remove one note. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const commentId = req.nextUrl.searchParams.get("comment");
  if (!isUuid(commentId)) return NextResponse.json({ error: "comment id required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { error, count } = await supabase.from("gift_comments").delete({ count: "exact" }).eq("id", commentId).eq("gift_id", id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/gifts/:id/comments DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
