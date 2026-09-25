import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { linkedCounts, resolvePersonId } from "@/lib/people/contacts";

export const runtime = "nodejs";

/** GET /api/people/[id]/links — how many rows point at this person, per linking table (the delete dialog, C4). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const ref = await resolvePersonId(supabase, rawId);
    if (!ref) return NextResponse.json({ error: "not found" }, { status: 404 });
    const links = await linkedCounts(supabase, ref.id);
    return NextResponse.json({ links, total: links.reduce((s, l) => s + l.count, 0) });
  } catch (err) {
    console.error("[/api/people/:id/links GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
