import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import {
  GOALS_SENTINEL_DATE,
  isGoalItem,
  type GoalItem,
  type GoalScope,
} from "@/lib/types/goals";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type GoalsNotes = {
  goals_week_items?: unknown;
  goals_month_items?: unknown;
};

function readGoals(notes: GoalsNotes): { week: GoalItem[]; month: GoalItem[] } {
  const week = Array.isArray(notes.goals_week_items)
    ? notes.goals_week_items.filter(isGoalItem)
    : [];
  const month = Array.isArray(notes.goals_month_items)
    ? notes.goals_month_items.filter(isGoalItem)
    : [];
  return { week, month };
}

export async function GET() {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, GOALS_SENTINEL_DATE);
    return NextResponse.json(readGoals(parseNotes(row.notes) as GoalsNotes));
  } catch (err) {
    console.error("[/api/goals GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: { scope?: unknown; items?: unknown };
  try {
    body = (await req.json()) as { scope?: unknown; items?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const scope = body.scope === "week" || body.scope === "month"
    ? (body.scope as GoalScope)
    : null;
  if (!scope) {
    return NextResponse.json({ error: "scope must be week|month" }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  const items: GoalItem[] = body.items.filter(isGoalItem);

  try {
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, GOALS_SENTINEL_DATE);
    const current = parseNotes(row.notes) as Record<string, unknown>;
    const key = scope === "week" ? "goals_week_items" : "goals_month_items";
    const next = { ...current, [key]: items };
    const { error } = await supabase
      .from("daily_logs")
      .update({
        notes: JSON.stringify(next),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw error;
    return NextResponse.json(readGoals(next as GoalsNotes));
  } catch (err) {
    console.error("[/api/goals POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
