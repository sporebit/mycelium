import { NextResponse } from "next/server";
import { BREAK_GLASS_COOKIE } from "@/lib/auth/cookie";
import { createUserClient } from "@/lib/supabase/user";

/**
 * Ends the current session: revokes it with Supabase Auth (which clears the
 * session cookies through the client's cookie adapter) and drops any
 * break-glass cookie too, so "sign out" means the same thing on every path.
 */
export async function POST() {
  const supabase = await createUserClient();
  await supabase.auth.signOut({ scope: "local" });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(BREAK_GLASS_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
