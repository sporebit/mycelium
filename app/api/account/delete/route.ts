import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";
import { BREAK_GLASS_COOKIE } from "@/lib/auth/cookie";
import { REAUTH_COOKIE } from "@/lib/auth/reauth";

export const runtime = "nodejs";

/**
 * Delete my account. Under /api/account, so the middleware already required
 * aal2 and a fresh re-auth; the body must repeat the account's email as the
 * typed confirmation. The database function removes memberships, grants,
 * invites, the personal space (which cascades to every row in it) and the
 * auth user; rows the person created in team spaces stay, with created_by
 * set to null. The instance owner cannot delete themselves this way.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { confirm?: unknown };
  const confirm = typeof body.confirm === "string" ? body.confirm.trim().toLowerCase() : "";
  if (!me.email || confirm !== me.email.toLowerCase()) {
    return NextResponse.json({ error: "Type your email address exactly to confirm" }, { status: 400 });
  }

  const db = await createUserClient();
  const { error } = await db.rpc("delete_my_account");
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  const res = NextResponse.json({ ok: true });
  for (const name of [REAUTH_COOKIE, BREAK_GLASS_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  }
  // The Supabase session cookies belong to a user that no longer exists;
  // clear them by name pattern so the browser does not keep sending them.
  for (const c of req.cookies.getAll()) {
    if (/^sb-.*-auth-token/.test(c.name)) res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
