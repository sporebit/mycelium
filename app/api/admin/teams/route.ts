import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/** Instance owner: every team and every membership. */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  const [{ data: teams, error: e1 }, { data: memberships, error: e2 }] = await Promise.all([
    db.rpc("admin_teams"),
    db.rpc("admin_memberships"),
  ]);
  if (e1 || e2) return NextResponse.json({ error: (e1 ?? e2)!.message }, { status: 403 });
  return NextResponse.json({ teams: teams ?? [], memberships: memberships ?? [] });
}
