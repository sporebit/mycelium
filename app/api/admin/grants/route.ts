import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/** Instance owner: every direct grant (who, what section, which verbs; never the content). */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await createUserClient();
  const { data, error } = await db.rpc("admin_grants");
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ grants: data ?? [] });
}
