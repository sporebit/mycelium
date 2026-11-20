import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { openNudges, setAsideNudge } from "@/lib/system/nudges";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ ok: false, status: "error", error }, { status });

/**
 * POST /api/nudges/[id] { action: "not_today" } — the one-tap answer
 * (research rule 30): set aside, no reason asked, and nobody is told.
 * Only the person the nudge was sent to can answer it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("not found", 404);
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "not_today") return fail("action must be not_today", 400);
  try {
    const db = await createUserClient();
    if (!(await setAsideNudge(db, id))) return fail("not found", 404);
    return NextResponse.json({ ok: true, status: "ok", open: await openNudges(db) });
  } catch (err) {
    console.error("[nudges/:id POST]", err);
    return fail("That did not save.", 500);
  }
}
