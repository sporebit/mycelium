import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

/** Leave a team. An owner must have named a successor first (0112). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await createUserClient();
  const { error } = await db.rpc("leave_team", { p_team: id });
  if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 409 });
  return NextResponse.json({ ok: true });
}
