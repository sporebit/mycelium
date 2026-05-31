import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { estimateBurnedKcal } from "@/lib/nutrition/calc";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/**
 * Estimate calories burned for a given date. Uses workout_sessions
 * completed on that date: if `calories` is already set we trust it,
 * otherwise we estimate from kind + duration (started_at → completed_at).
 */
export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id, kind, name, calories, started_at, completed_at, status")
      .eq("user_id", uid)
      .eq("date", date)
      .eq("status", "completed");
    if (error) throw error;
    const sessions = (data ?? []) as Array<{
      id: string;
      kind: string;
      name: string | null;
      calories: number | null;
      started_at: string | null;
      completed_at: string | null;
    }>;
    let total = 0;
    const breakdown: { id: string; kind: string; name: string | null; kcal: number }[] = [];
    for (const s of sessions) {
      let kcal = s.calories ?? 0;
      if (!kcal && s.started_at && s.completed_at) {
        const ms =
          new Date(s.completed_at).getTime() - new Date(s.started_at).getTime();
        const mins = Math.max(0, Math.round(ms / 60000));
        kcal = estimateBurnedKcal(s.kind, mins);
      }
      total += kcal;
      breakdown.push({ id: s.id, kind: s.kind, name: s.name, kcal });
    }
    return NextResponse.json({ burned: total, sessions: breakdown });
  } catch (err) {
    console.error("[/api/nutrition/burned GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
