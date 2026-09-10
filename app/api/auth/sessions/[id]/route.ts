import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/** Remote sign-out of one of the caller's own sessions (audited by 0113). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await createUserClient();
  const { error } = await db.rpc("end_session", { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, current: me.sessionId === id });
}
