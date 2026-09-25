import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { decideCandidate, type Decision } from "@/lib/people/import";

export const runtime = "nodejs";

/** POST /api/people/import/candidates/[candidateId] { decision: merge|separate|skip, into? } — Merge into X / Keep separate / Skip (C2). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await ctx.params;
  let body: { decision?: string; into?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const decision = body.decision;
  if (decision !== "merge" && decision !== "separate" && decision !== "skip") {
    return NextResponse.json({ error: "decision must be merge, separate or skip" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const result = await decideCandidate(supabase, candidateId, decision as Decision, body.into ?? null);
    return NextResponse.json({ ok: true, decision, ...result });
  } catch (err) {
    console.error("[/api/people/import/candidates/:id POST]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "decision failed" }, { status: 400 });
  }
}
