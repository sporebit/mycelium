import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readEntryInput } from "@/lib/hours/entry";
import { ENTRY_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/hours/entries/[id] — change any of the Log fields (inline
 * edit, the Logged tick, filling in Time Spent on an open item). Only the
 * keys sent change; `ticket_key` follows `ticket_raw`. A deleted row is not
 * editable. Returns { entry }.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const read = readEntryInput(body, "patch");
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("hours_entries")
      .update({ ...read.fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select(ENTRY_SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry: data });
  } catch (err) {
    console.error("[/api/hours/entries/[id] PATCH]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}

/** DELETE — soft delete (deleted_at). An import never resurrects it (spec §6). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("hours_entries")
      .update({ deleted_at: now, updated_at: now })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/hours/entries/[id] DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
