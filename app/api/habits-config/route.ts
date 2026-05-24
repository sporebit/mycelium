import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import { GOALS_SENTINEL_DATE } from "@/lib/types/goals";
import { HABITS as DEFAULT_HABITS, type Habit } from "@/lib/config/habits";

export const runtime = "nodejs";

function isHabit(x: unknown): x is Habit {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.category !== "string"
  ) {
    return false;
  }
  if (o.target !== undefined && typeof o.target !== "number") return false;
  if (o.unit !== undefined && typeof o.unit !== "string") return false;
  return true;
}

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, GOALS_SENTINEL_DATE);
    const notes = parseNotes(row.notes) as { habits_config?: unknown };
    const arr = Array.isArray(notes.habits_config)
      ? notes.habits_config.filter(isHabit)
      : null;
    return NextResponse.json({
      habits: arr && arr.length > 0 ? arr : DEFAULT_HABITS,
    });
  } catch (err) {
    console.error("[/api/habits-config GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: { habits?: unknown };
  try {
    body = (await req.json()) as { habits?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(body.habits)) {
    return NextResponse.json({ error: "habits required" }, { status: 400 });
  }
  const habits: Habit[] = body.habits.filter(isHabit);

  // Dedup ids — first occurrence wins
  const seen = new Set<string>();
  const deduped = habits.filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });

  try {
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, GOALS_SENTINEL_DATE);
    const current = parseNotes(row.notes) as Record<string, unknown>;
    const next = { ...current, habits_config: deduped };
    const { error } = await supabase
      .from("daily_logs")
      .update({
        notes: JSON.stringify(next),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw error;
    return NextResponse.json({ habits: deduped });
  } catch (err) {
    console.error("[/api/habits-config POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
