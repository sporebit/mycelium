import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

async function ensureOwned(
  supabase: SupabaseClient,
  personId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("people")
    .select("id")
    .eq("id", personId)
    .maybeSingle();
  return !!data?.id;
}

type PatchBody = { is_primary?: boolean; alias?: string };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; aliasId: string }> }
) {
  const { id: personId, aliasId } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, personId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (body.is_primary === true) {
      // Demote any existing primary, then promote this one.
      await supabase
        .from("people_aliases")
        .update({ is_primary: false })
        .eq("person_id", personId)
        .eq("is_primary", true);
    }
    const update: Record<string, unknown> = {};
    if (body.is_primary !== undefined) update.is_primary = body.is_primary;
    if (body.alias !== undefined) update.alias = body.alias;
    const { error } = await supabase
      .from("people_aliases")
      .update(update)
      .eq("id", aliasId)
      .eq("person_id", personId);
    if (error) {
      console.error("[aliases PATCH]", error);
      return NextResponse.json({ error: "update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[aliases PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; aliasId: string }> }
) {
  const { id: personId, aliasId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    if (!(await ensureOwned(supabase, personId))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // Refuse if it's the only alias
    const { count } = await supabase
      .from("people_aliases")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "cannot delete the only alias" },
        { status: 409 }
      );
    }
    const { error } = await supabase
      .from("people_aliases")
      .delete()
      .eq("id", aliasId)
      .eq("person_id", personId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[aliases DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
