import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { sharedScenes } from "@/lib/daylog/linked";
import { DATE_RE, daylogDay, shiftDate } from "@/lib/daylog/day";

export const runtime = "nodejs";

/**
 * GET /api/journal/shared?from=&to= — as the viewer (daylog spec §5,
 * decision 30): the scenes another user's day log placed them in, through
 * their linked People row. Powers the "with …" cards on the viewer's own day
 * pages. Scene basics only; the SQL function (0133) is the wall.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const today = daylogDay();
  const to = DATE_RE.test(sp.get("to") ?? "") ? sp.get("to")! : today;
  const from = DATE_RE.test(sp.get("from") ?? "") ? sp.get("from")! : shiftDate(to, -30);
  try {
    const supabase = await createUserClient();
    const scenes = await sharedScenes(supabase, from, to);
    return NextResponse.json({ scenes, window: { from, to } });
  } catch (err) {
    console.error("[/api/journal/shared GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
