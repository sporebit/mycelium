import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import { emptyReview, mergeReview, type WeeklyReview } from "@/lib/types/review";
import { dateKeyLocal, sundayOfWeek } from "@/lib/util/week";

export const runtime = "nodejs";

async function setSealed(sealedAt: string | null) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const dateKey = dateKeyLocal(sundayOfWeek(new Date()));
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, dateKey);
    const current = parseNotes(row.notes) as Record<string, unknown>;
    const existing = current.weekly_review as Partial<WeeklyReview> | undefined;
    const base = mergeReview(emptyReview(), existing ?? {});
    const next: WeeklyReview = { ...base, sealed_at: sealedAt };
    const nextNotes = { ...current, weekly_review: next };
    const { error } = await supabase
      .from("daily_logs")
      .update({
        notes: JSON.stringify(nextNotes),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw error;
    return NextResponse.json({ review: next });
  } catch (err) {
    console.error("[/api/review/current/seal]", err);
    return NextResponse.json({ error: "seal failed" }, { status: 500 });
  }
}

export async function POST() {
  return setSealed(new Date().toISOString());
}
