import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type PatchBody = {
  category?: string;
  name?: string;
  brand?: string | null;
  specs?: string | null;
  purchase_date?: string | null;
  price_paid?: number | null;
  currency?: string;
  date_removed?: string | null;
  removal_reason?: string | null;
  notes?: string | null;
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
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.category !== undefined) update.category = body.category.trim();
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.brand !== undefined) update.brand = body.brand?.trim() || null;
    if (body.specs !== undefined) update.specs = body.specs?.trim() || null;
    if (body.purchase_date !== undefined)
      update.purchase_date = body.purchase_date || null;
    if (body.price_paid !== undefined)
      update.price_paid = body.price_paid ?? null;
    if (body.currency !== undefined)
      update.currency = body.currency.trim() || "GBP";
    if (body.date_removed !== undefined)
      update.date_removed = body.date_removed || null;
    if (body.removal_reason !== undefined)
      update.removal_reason = body.removal_reason?.trim() || null;
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null;

    const { data, error } = await supabase
      .from("pc_components")
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
    return NextResponse.json({ component: data });
  } catch (err) {
    console.error("[/api/pc-build/:id PATCH]", err);
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
      .from("pc_components")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/pc-build/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
