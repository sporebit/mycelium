import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { getTeamDetail, rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await createUserClient();
  const team = await getTeamDetail(db, me.id, id);
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ team });
}

/**
 * PATCH { name } renames (owner/admin); { successor_user_id } names the
 * successor (owner; null clears); { transfer_to } transfers ownership
 * (owner, or instance owner when the owner is gone — see 0112).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = await createUserClient();

  if (typeof body.name === "string") {
    const { error } = await db.rpc("rename_team", { p_team: id, p_name: body.name });
    if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  }
  if ("successor_user_id" in body) {
    const { error } = await db.rpc("set_team_successor", {
      p_team: id,
      p_user: typeof body.successor_user_id === "string" ? body.successor_user_id : null,
    });
    if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  }
  if (typeof body.transfer_to === "string") {
    const { error } = await db.rpc("transfer_team_ownership", { p_team: id, p_new_owner: body.transfer_to });
    if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  }
  if (typeof body.appoint_successor === "string") {
    const { error } = await db.rpc("appoint_team_successor", { p_team: id, p_user: body.appoint_successor });
    if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  }

  const team = await getTeamDetail(db, me.id, id);
  return NextResponse.json({ team });
}
