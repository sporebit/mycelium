import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

const SELECT = "id, person_id, email, label, is_current, include_in_export, sort_order, created_at, updated_at";

/** PATCH /api/people/[id]/emails/[emailId] { label?, is_current?, include_in_export?, sort_order?, email? } — marking old turns export off (C5). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; emailId: string }> }) {
  const { id, emailId } = await ctx.params;
  let body: { label?: string | null; is_current?: boolean; include_in_export?: boolean; sort_order?: number; email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) update.label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  if (typeof body.is_current === "boolean") {
    update.is_current = body.is_current;
    if (!body.is_current && body.include_in_export === undefined) update.include_in_export = false;
  }
  if (typeof body.include_in_export === "boolean") update.include_in_export = body.include_in_export;
  if (typeof body.sort_order === "number") update.sort_order = body.sort_order;
  if (typeof body.email === "string" && body.email.trim().includes("@")) update.email = body.email.trim();
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("person_emails").update(update).eq("id", emailId).eq("person_id", id).select(SELECT).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ email: data });
  } catch (err) {
    console.error("[/api/people/:id/emails/:emailId PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; emailId: string }> }) {
  const { id, emailId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { error } = await supabase.from("person_emails").delete().eq("id", emailId).eq("person_id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/people/:id/emails/:emailId DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
