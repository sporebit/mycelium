import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { defaultHabits, habitHistory } from "@/lib/habits/store";

export const runtime = "nodejs";

/** GET /api/habits-history?days=N — heatmap data from ticket_completions (spec §8.3). */
export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam ?? "90") || 90, 1), 365);
  try {
    const supabase = await createUserClient();
    const { history, habits } = await habitHistory(supabase, days);
    return NextResponse.json({
      history,
      habits: habits.length > 0 ? habits : defaultHabits(),
    });
  } catch (err) {
    console.error("[/api/habits-history]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
