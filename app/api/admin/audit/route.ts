import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * Instance owner: the audit log, filterable by actor, subject, team,
 * section, action and date range (query string). Capped at 1000 rows.
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const str = (k: string) => q.get(k)?.trim() || null;
  const db = await createUserClient();
  const { data, error } = await db.rpc("admin_audit", {
    p_actor: str("actor"),
    p_subject: str("subject"),
    p_team: str("team"),
    p_section: str("section"),
    p_action: str("action"),
    p_from: str("from"),
    p_to: str("to"),
    p_limit: Math.min(Number(q.get("limit") ?? 200) || 200, 1000),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ events: data ?? [] });
}
