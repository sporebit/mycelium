import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * Exact-email lookup so a grant can name its grantee. Returns only an id and
 * display name, and only for an exact match: no listing, no prefix search.
 */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = req.nextUrl.searchParams.get("email")?.trim() ?? "";
  if (!email.includes("@")) return NextResponse.json({ error: "email required" }, { status: 400 });
  const db = await createUserClient();
  const { data } = await db.rpc("find_user_by_email", { p_email: email });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ user: null }, { status: 404 });
  return NextResponse.json({ user: { id: row.id, display_name: row.display_name } });
}
