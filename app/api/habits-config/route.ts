import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { type Habit } from "@/lib/config/habits";
import { defaultHabits, listHabits, saveHabits } from "@/lib/habits/store";
import { principalUid, ticketWriteGate } from "@/lib/tickets/server";

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

/**
 * Habits are series tickets now (spec §8.3): GET lists them in the shape
 * the tiles expect (id = legacy habit id), POST creates/renames/cancels
 * the tickets. The defaults show until the first save creates real rows.
 */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const habits = await listHabits(supabase);
    return NextResponse.json({ habits: habits.length > 0 ? habits : defaultHabits() });
  } catch (err) {
    console.error("[/api/habits-config GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
  const seen = new Set<string>();
  const deduped = habits
    .filter((h) => {
      if (seen.has(h.id)) return false;
      seen.add(h.id);
      return true;
    })
    .map((h) => ({ id: h.id, name: h.name.trim(), category: h.category, target: h.target, unit: h.unit }))
    .filter((h) => h.name.length > 0);

  try {
    const supabase = await createUserClient();
    const uid = await principalUid();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const saved = await saveHabits(supabase, deduped, uid);
    return NextResponse.json({ habits: saved });
  } catch (err) {
    console.error("[/api/habits-config POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
