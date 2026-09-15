import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

type PatchBody = {
  name?: string;
  description?: string | null;
  category?: string;
  status?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  google_maps_url?: string | null;
  rating?: number | null;
  visit_date?: string | null;
  notes?: string | null;
  tags?: string[];
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) update.name = body.name.trim();
    if (body.description !== undefined)
      update.description = body.description?.trim() || null;
    if (body.category !== undefined) update.category = body.category.trim();
    if (body.status !== undefined) update.status = body.status.trim();
    if (body.lat !== undefined) update.lat = body.lat;
    if (body.lng !== undefined) update.lng = body.lng;
    if (body.address !== undefined)
      update.address = body.address?.trim() || null;
    if (body.google_maps_url !== undefined)
      update.google_maps_url = body.google_maps_url?.trim() || null;
    if (body.rating !== undefined) update.rating = body.rating;
    if (body.visit_date !== undefined)
      update.visit_date = body.visit_date || null;
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null;
    if (body.tags !== undefined) update.tags = body.tags;

    const { data, error } = await supabase
      .from("places")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ place: data });
  } catch (err) {
    console.error("[/api/places/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("places")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/places/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
