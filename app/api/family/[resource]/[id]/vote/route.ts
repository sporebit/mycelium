import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { voteOnName } from "@/lib/family/resources";
import { familyCtx } from "@/lib/family/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string; id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** POST /api/family/names/<id>/vote { vote: 2 | 1 | -1 | null } — the caller's own vote on a name; null takes it back. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { resource, id } = await ctx.params;
  if (resource !== "names") return bad("not found", 404);
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body || !("vote" in body)) return bad("vote is 2, 1, -1 or null.");
  try {
    const supabase = await createUserClient();
    const family = await familyCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
    if (!family) return bad("No family space.", 404);
    const out = await voteOnName(id, body.vote, family);
    return out.ok ? NextResponse.json(out.value) : bad(out.error, out.status);
  } catch (err) {
    console.error("[/api/family/names/:id/vote POST]", err);
    return bad("failed", 500);
  }
}
