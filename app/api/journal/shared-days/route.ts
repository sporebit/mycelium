import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/journal/shared-days?from=&to= — Day log entries other people have
 * marked shared with the caller (0169): the day, whose it is, their summary
 * and their scenes. Read through one database function; the Day log's own
 * tables never show another person's days, so this list and the caller's
 * own journal cannot mix.
 */
export async function GET(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return NextResponse.json({ error: "bad date" }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase.rpc("daylog_shared_with_me", { p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return NextResponse.json({ days: data ?? [] });
  } catch (err) {
    console.error("[/api/journal/shared-days GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
