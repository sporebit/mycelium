import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * Instance owner appoints a successor for a team whose owner is gone or
 * disabled; ownership moves at once (audited). Refused while the owner is
 * present — only they can name a successor.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { user_id?: unknown };
  if (typeof body.user_id !== "string") return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  const db = await createUserClient();
  const { error } = await db.rpc("appoint_team_successor", { p_team: id, p_user: body.user_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
