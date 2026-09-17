import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { habitStreak } from "@/lib/habits/store";

export const runtime = "nodejs";

/** GET /api/streak — consecutive habit days, read from ticket_completions (spec §8.3). */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const days = await habitStreak(supabase);
    return NextResponse.json({ days });
  } catch (err) {
    console.error("[streak GET]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
