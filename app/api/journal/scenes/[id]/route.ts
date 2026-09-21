import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { SCENE_SELECT } from "@/lib/daylog/rows";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** PATCH whitelist (spec §5): title, place_id, place_text, time_hint, narrative, hidden_from_linked, position. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const update: Record<string, unknown> = {};
  if ("title" in body) {
    const t = text(body.title);
    if (!t) return NextResponse.json({ error: "title required" }, { status: 400 });
    update.title = t;
  }
  if ("place_id" in body) {
    if (body.place_id !== null && !(typeof body.place_id === "string" && UUID_RE.test(body.place_id))) return NextResponse.json({ error: "bad place_id" }, { status: 400 });
    update.place_id = body.place_id;
  }
  if ("place_text" in body) update.place_text = text(body.place_text);
  if ("time_hint" in body) update.time_hint = text(body.time_hint);
  if ("narrative" in body) {
    update.narrative = text(body.narrative);
    update.narrative_edited_by_user = true;
  }
  if ("hidden_from_linked" in body) {
    if (typeof body.hidden_from_linked !== "boolean") return NextResponse.json({ error: "hidden_from_linked must be boolean" }, { status: 400 });
    update.hidden_from_linked = body.hidden_from_linked;
  }
  if ("position" in body) {
    if (typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0) return NextResponse.json({ error: "bad position" }, { status: 400 });
    update.position = body.position;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  update.updated_at = new Date().toISOString();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase.from("daylog_scenes").update(update).eq("id", id).select(SCENE_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ scene: data });
  } catch (err) {
    console.error("[/api/journal/scenes/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

/** DELETE — the scene goes; its facts stay on the day (scene_id nulls), its people links cascade. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { error, count } = await supabase.from("daylog_scenes").delete({ count: "exact" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/journal/scenes/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
