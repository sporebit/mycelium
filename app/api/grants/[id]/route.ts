import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

/** Revoke (as grantor) or decline (as grantee). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await createUserClient();
  const { error } = await db.rpc("revoke_user_grant", { p_id: id });
  if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 404 });
  return NextResponse.json({ ok: true });
}
