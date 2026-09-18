import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { QUOTE_SELECT } from "@/lib/quotes/server";

export const runtime = "nodejs";

/** GET /api/people/:id/quotes — that person's quotes, newest first (spec §6). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50));
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.from("quotes").select(QUOTE_SELECT).eq("said_by_person_id", id).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    auditListRead(req, (data ?? []) as Array<{ space_id?: string | null }>, "organisation", "quotes");
    return NextResponse.json({ quotes: data ?? [] });
  } catch (err) {
    console.error("[/api/people/:id/quotes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
