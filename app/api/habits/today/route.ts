import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { doneOn, listHabits } from "@/lib/habits/store";
import { localDateKey } from "@/lib/util/date";

export const runtime = "nodejs";

/** GET /api/habits/today?date=YYYY-MM-DD — the habit tiles and which are done. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDateKey();
  try {
    const supabase = await createUserClient();
    const [habits, done] = await Promise.all([listHabits(supabase), doneOn(supabase, date)]);
    return NextResponse.json({ date, habits, done });
  } catch (err) {
    console.error("[/api/habits/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
