import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { FACT_KINDS } from "@/lib/daylog/extraction";
import { FACT_SELECT } from "@/lib/daylog/rows";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nullableUuid = (v: unknown): v is string | null => v === null || (typeof v === "string" && UUID_RE.test(v));

/** PATCH whitelist (spec §5): kind, subject_person_id, text, data, scene_id. Marks the row edited so a re-extract leaves it alone. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const uid = await principalUid();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const update: Record<string, unknown> = {};
  if ("text" in body) {
    if (typeof body.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
    update.text = body.text.trim();
  }
  if ("kind" in body) {
    if (typeof body.kind !== "string" || !(FACT_KINDS as readonly string[]).includes(body.kind)) return NextResponse.json({ error: "bad kind" }, { status: 400 });
    update.kind = body.kind;
  }
  if ("subject_person_id" in body) {
    if (!nullableUuid(body.subject_person_id)) return NextResponse.json({ error: "bad subject_person_id" }, { status: 400 });
    update.subject_person_id = body.subject_person_id;
  }
  if ("scene_id" in body) {
    if (!nullableUuid(body.scene_id)) return NextResponse.json({ error: "bad scene_id" }, { status: 400 });
    update.scene_id = body.scene_id;
  }
  if ("data" in body) {
    if (body.data !== null && (typeof body.data !== "object" || Array.isArray(body.data))) return NextResponse.json({ error: "data must be an object" }, { status: 400 });
    update.data = body.data;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  update.edited_by_user = true;
  update.updated_at = new Date().toISOString();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase.from("daylog_facts").update(update).eq("id", id).select(FACT_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ fact: data });
  } catch (err) {
    console.error("[/api/journal/facts/:id PATCH]", err);
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
    const { error, count } = await supabase.from("daylog_facts").delete({ count: "exact" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/journal/facts/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
