import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { MEDIA_SELECT, removeDaylogMedia, signDaylogMedia, type MediaRow } from "@/lib/daylog/media";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH whitelist (spec §5): caption, scene_id, shareable. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const update: Record<string, unknown> = {};
  if ("caption" in body) update.caption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;
  if ("scene_id" in body) {
    if (body.scene_id !== null && !(typeof body.scene_id === "string" && UUID_RE.test(body.scene_id))) return NextResponse.json({ error: "bad scene_id" }, { status: 400 });
    update.scene_id = body.scene_id;
  }
  if ("shareable" in body) {
    if (typeof body.shareable !== "boolean") return NextResponse.json({ error: "shareable must be boolean" }, { status: 400 });
    update.shareable = body.shareable;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase.from("daylog_media").update(update).eq("id", id).select(MEDIA_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const [signed] = await signDaylogMedia(supabase, [data as MediaRow]);
    return NextResponse.json({ media: signed });
  } catch (err) {
    console.error("[/api/journal/media/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data } = await supabase.from("daylog_media").select(MEDIA_SELECT).eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    const ok = await removeDaylogMedia(supabase, data as MediaRow);
    if (!ok) return NextResponse.json({ error: "delete failed" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/journal/media/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
