import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { addPhone, resolvePersonId } from "@/lib/people/contacts";

export const runtime = "nodejs";

/** GET /api/people/[id]/phones · POST { number_raw, label?, is_current?, include_in_export? } (people-contacts C5). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolvePersonId(supabase, rawId);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const { data, error } = await supabase
      .from("person_phones")
      .select("id, person_id, number_raw, number_e164, label, is_current, include_in_export, sort_order, created_at, updated_at")
      .eq("person_id", ref.id)
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return NextResponse.json({ phones: data ?? [] });
  } catch (err) {
    console.error("[/api/people/:id/phones GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  let body: { number_raw?: string; label?: string | null; is_current?: boolean; include_in_export?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.number_raw?.trim()) return NextResponse.json({ error: "number_raw required" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const ref = await resolvePersonId(supabase, rawId);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const phone = await addPhone(supabase, ref.id, { number_raw: body.number_raw, label: body.label ?? null, is_current: body.is_current, include_in_export: body.include_in_export });
    if (!phone) return NextResponse.json({ error: "could not add number" }, { status: 400 });
    return NextResponse.json({ phone }, { status: 201 });
  } catch (err) {
    console.error("[/api/people/:id/phones POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
