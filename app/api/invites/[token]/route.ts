import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { rpcMessage } from "@/lib/access/teams";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/** Public: what the invite is, and whether it is still valid. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(token)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const db = await createUserClient();
  const { data, error } = await db.rpc("invite_preview", { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const me = await getSessionUser();
  return NextResponse.json({
    invite: {
      email: row.email,
      team_id: row.team_id,
      team_name: row.team_name,
      role: row.role,
      invited_by_name: row.invited_by_name,
      status: row.status,
    },
    signed_in_as: me?.email ?? null,
  });
}

/** Signed in as the invitee: accept. Joins the team, seeds first-screen settings. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { token } = await ctx.params;
  const db = await createUserClient();
  const { data, error } = await db.rpc("accept_invite", { p_token: token });
  if (error) return NextResponse.json({ error: rpcMessage(error) }, { status: 409 });
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, ...row });
}
