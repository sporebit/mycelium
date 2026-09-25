import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { promotePerson, resolvePersonId } from "@/lib/people/contacts";

export const runtime = "nodejs";

/** POST /api/people/[id]/promote — a contact becomes a person (people-contacts C1). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolvePersonId(supabase, rawId);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const ok = await promotePerson(supabase, ref.id);
    if (!ok) return NextResponse.json({ error: "promote failed" }, { status: 500 });
    return NextResponse.json({ ok: true, id: ref.id, tier: "person" });
  } catch (err) {
    console.error("[/api/people/:id/promote POST]", err);
    return NextResponse.json({ error: "promote failed" }, { status: 500 });
  }
}
