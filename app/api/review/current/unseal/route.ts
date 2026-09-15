import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import { emptyReview, mergeReview, type WeeklyReview } from "@/lib/types/review";
import { dateKeyLocal, sundayOfWeek } from "@/lib/util/week";

export const runtime = "nodejs";

export async function POST() {
  try {
    const dateKey = dateKeyLocal(sundayOfWeek(new Date()));
    const supabase = await createUserClient();
    const row = await getOrCreateDailyLog(supabase, dateKey);
    const current = parseNotes(row.notes) as Record<string, unknown>;
    const existing = current.weekly_review as Partial<WeeklyReview> | undefined;
    const base = mergeReview(emptyReview(), existing ?? {});
    const next: WeeklyReview = { ...base, sealed_at: null };
    const { error } = await supabase
      .from("daily_logs")
      .update({
        notes: JSON.stringify({ ...current, weekly_review: next }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw error;
    return NextResponse.json({ review: next });
  } catch (err) {
    console.error("[/api/review/current/unseal]", err);
    return NextResponse.json({ error: "unseal failed" }, { status: 500 });
  }
}
