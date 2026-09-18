import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { QUOTE_SELECT } from "@/lib/quotes/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("quotes").select(QUOTE_SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ quote: data });
  } catch (err) {
    console.error("[/api/quotes/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** PATCH whitelist (spec §6): text, context, source, said_at, said_by_person_id, is_own, merch, attributed_to. */
const WHITELIST = ["text", "context", "source", "said_at", "said_by_person_id", "is_own", "merch", "attributed_to"] as const;

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const uid = await principalUid();
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const update: Record<string, unknown> = {};
  for (const k of WHITELIST) {
    if (!(k in body)) continue;
    const v = body[k];
    switch (k) {
      case "text":
        if (typeof v !== "string" || !v.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
        update.text = v.trim();
        break;
      case "context":
      case "source":
      case "attributed_to":
      case "said_by_person_id":
        update[k] = typeof v === "string" && v.trim() ? v.trim() : null;
        break;
      case "said_at":
        if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return NextResponse.json({ error: "said_at must be a datetime" }, { status: 400 });
        update.said_at = new Date(v).toISOString();
        break;
      case "is_own":
      case "merch":
        if (typeof v !== "boolean") return NextResponse.json({ error: `${k} must be boolean` }, { status: 400 });
        update[k] = v;
        break;
    }
  }
  // is_own ⇒ no person (check constraint); naming a person ⇒ not own.
  if (update.is_own === true) update.said_by_person_id = null;
  else if (typeof update.said_by_person_id === "string") update.is_own = false;
  // an explicit speaker (a person, or Me) is by definition certain
  if (update.is_own === true || typeof update.said_by_person_id === "string") update.speaker_confidence = "certain";
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  update.updated_at = new Date().toISOString();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase.from("quotes").update(update).eq("id", id).select(QUOTE_SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ quote: data });
  } catch (err) {
    console.error("[/api/quotes/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error, count } = await supabase.from("quotes").delete({ count: "exact" }).eq("id", id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/quotes/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
