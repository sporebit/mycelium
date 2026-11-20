import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { GIFT_SELECT } from "@/lib/gifts/server";

export const runtime = "nodejs";

/** GET /api/people/:id/gifts?include_rejected=1 — that person's gift ideas and history, open ones first then newest (spec §9, §10). Owner-only: another member sees none. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100));
  const includeRejected = req.nextUrl.searchParams.get("include_rejected") === "1";
  try {
    const supabase = await createUserClient();
    let q = supabase.from("gifts").select(GIFT_SELECT).eq("for_person_id", id).order("created_at", { ascending: false }).limit(limit);
    if (!includeRejected) q = q.neq("status", "rejected");
    const { data, error } = await q;
    if (error) throw error;
    auditListRead(req, (data ?? []) as Array<{ space_id?: string | null }>, "organisation", "gifts");
    return NextResponse.json({ gifts: data ?? [] });
  } catch (err) {
    console.error("[/api/people/:id/gifts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
