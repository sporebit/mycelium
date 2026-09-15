import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { estimateBurnedKcal } from "@/lib/nutrition/calc";

export const runtime = "nodejs";

/**
 * Estimate calories burned for a given date. Uses workout_sessions
 * completed on that date: if `calories` is already set we trust it,
 * otherwise we estimate from kind + duration (started_at → completed_at).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date required" }, { status: 400 });
  }
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id, kind, name, calories, started_at, completed_at, status, space_id")
      .eq("date", date)
      .eq("status", "completed");
    if (error) throw error;
    auditListRead(req, data, "fitness", "sessions");
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
