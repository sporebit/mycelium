import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type PatchBody = {
  name?: string;
  brand?: string | null;
  dose?: string;
  form?: string;
  schedule?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) update.name = body.name.trim();
    if (body.brand !== undefined) update.brand = body.brand?.trim() || null;
    if (body.dose !== undefined) update.dose = body.dose.trim();
    if (body.form !== undefined) update.form = body.form.trim();
    if (body.schedule !== undefined)
      update.schedule = body.schedule?.trim() || null;
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null;
    if (typeof body.active === "boolean") update.active = body.active;

    const { data, error } = await supabase
      .from("supplements")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ supplement: data });
  } catch (err) {
    console.error("[/api/supplements/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const { id } = await ctx.params;

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("supplements")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/supplements/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
