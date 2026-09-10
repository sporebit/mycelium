import { NextRequest, NextResponse } from "next/server";
import { getOwnProfile, getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { rpcMessage } from "@/lib/access/teams";
import { sendInviteEmail } from "@/lib/system/email";

export const runtime = "nodejs";

/**
 * Create an invite and email its link. The token is returned by the SQL
 * function exactly once; only its hash is stored. When Resend is not
 * configured (local runs) the link comes back in the response so the flow
 * can still be exercised; in production `link` is never returned.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; team_id?: unknown; role?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const teamId = typeof body.team_id === "string" && body.team_id ? body.team_id : null;
  const role = typeof body.role === "string" ? body.role : "member";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "role must be admin, member or viewer" }, { status: 400 });
  }

  const db = await createUserClient();
  const { data: token, error } = await db.rpc("create_invite", { p_email: email, p_team: teamId, p_role: role });
  if (error || typeof token !== "string") {
    return NextResponse.json({ error: rpcMessage(error) }, { status: 403 });
  }

  // PUBLIC_BASE_URL is the production origin; a dev server must hand out
  // links to itself or a local invite lands on the live site.
  const origin =
    process.env.NODE_ENV === "production" && process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL
      : req.nextUrl.origin;
  const link = `${origin}/invite/${token}`;
  const [profile, team] = await Promise.all([
    getOwnProfile(),
    teamId ? db.from("teams").select("name").eq("id", teamId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sent = await sendInviteEmail({
    to: email,
    link,
    teamName: (team?.data?.name as string | undefined) ?? null,
    role,
    inviterName: profile?.display_name ?? null,
  });

  return NextResponse.json(
    {
      ok: true,
      delivered: sent.delivered,
      ...(sent.delivered ? {} : { link, note: sent.error }),
    },
    { status: 201 },
  );
}
