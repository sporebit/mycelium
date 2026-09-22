import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { teammates } from "@/lib/daylog/linked";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_SELECT = "id, linked_user_id, linked_at";

/** GET — who this person is linked to, and who they could be (the caller's teammates). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const [{ data: person }, candidates] = await Promise.all([supabase.from("people").select(LINK_SELECT).eq("id", id).maybeSingle(), uid ? teammates(supabase, uid) : Promise.resolve([])]);
    if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
    const p = person as { linked_user_id: string | null; linked_at: string | null };
    const linked = p.linked_user_id ? (candidates.find((c) => c.user_id === p.linked_user_id) ?? { user_id: p.linked_user_id, display_name: null, teams: [] }) : null;
    return NextResponse.json({ linked, linked_at: p.linked_at, candidates });
  } catch (err) {
    console.error("[/api/people/:id/link GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/**
 * POST {user_id} — link this person to a Mycelium user who shares a team
 * with the caller (daylog spec §5, flag 3). The route checks; the database
 * checks again (0133 trigger), so a route bug cannot link a stranger.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  const body = await readJson<{ user_id?: unknown }>(req);
  const userId = typeof body?.user_id === "string" && UUID_RE.test(body.user_id) ? body.user_id : null;
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  if (userId === uid) return NextResponse.json({ error: "that is you" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    if (!uid || !(await teammates(supabase, uid)).some((t) => t.user_id === userId)) {
      return NextResponse.json({ error: "only someone who shares a team with you can be linked" }, { status: 403 });
    }
    const { data, error } = await supabase.from("people").update({ linked_user_id: userId, updated_at: new Date().toISOString() }).eq("id", id).select(LINK_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.code === "42501" ? "only someone who shares a team with you can be linked" : error.message }, { status: error.code === "42501" ? 403 : 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ person: data });
  } catch (err) {
    console.error("[/api/people/:id/link POST]", err);
    return NextResponse.json({ error: "link failed" }, { status: 500 });
  }
}

/** DELETE — unlink. The other user's "with you" cards disappear at once; nothing else changes. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase.from("people").update({ linked_user_id: null, updated_at: new Date().toISOString() }).eq("id", id).select(LINK_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ person: data });
  } catch (err) {
    console.error("[/api/people/:id/link DELETE]", err);
    return NextResponse.json({ error: "unlink failed" }, { status: 500 });
  }
}
