import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE — cancel an invite that has not been accepted (0170). Whoever may
 * create it may cancel it; the rule is in the database function. The link
 * stops working at once.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, inviteId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(inviteId)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = await createUserClient();
  // the invite must be this team's: the address says which team the caller is looking at
  const { data: invite } = await db.from("invites").select("id").eq("id", inviteId).eq("team_id", id).maybeSingle();
  if (!invite) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { error } = await db.rpc("cancel_invite", { p_invite: inviteId });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "23514" ? 409 : 403;
    return NextResponse.json({ error: rpcMessage(error) }, { status });
  }
  return NextResponse.json({ ok: true });
}
