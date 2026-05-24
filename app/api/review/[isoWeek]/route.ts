import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseNotes } from "@/lib/dailyLog";
import {
  REVIEW_FIELDS,
  emptyReview,
  mergeReview,
  type WeeklyReview,
} from "@/lib/types/review";
import {
  mondayKeyOfIsoWeek,
  parseIsoWeek,
  sundayKeyOfIsoWeek,
} from "@/lib/util/week";

export const runtime = "nodejs";

function readReview(notesStr: string | null | undefined): WeeklyReview {
  const notes = parseNotes(notesStr) as { weekly_review?: unknown };
  const r = notes.weekly_review;
  if (!r || typeof r !== "object") return emptyReview();
  const partial: Partial<WeeklyReview> = {};
  const o = r as Record<string, unknown>;
  for (const f of REVIEW_FIELDS) {
    if (typeof o[f] === "string") partial[f] = o[f] as string;
  }
  if (typeof o.sealed_at === "string" || o.sealed_at === null) {
    partial.sealed_at = o.sealed_at as string | null;
  }
  return mergeReview(emptyReview(), partial);
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ isoWeek: string }> }
) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { isoWeek } = await ctx.params;
  const parsed = parseIsoWeek(isoWeek);
  if (!parsed) {
    return NextResponse.json(
      { error: "Bad week format; expected YYYY-Www" },
      { status: 400 }
    );
  }
  try {
    const sundayKey = sundayKeyOfIsoWeek(parsed.year, parsed.week);
    const mondayKey = mondayKeyOfIsoWeek(parsed.year, parsed.week);
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("daily_logs")
      .select("notes")
      .eq("user_id", uid)
      .eq("log_date", sundayKey)
      .maybeSingle();
    if (error) throw error;
    const review = data ? readReview(data.notes) : emptyReview();
    return NextResponse.json({
      review,
      iso_year: parsed.year,
      iso_week: parsed.week,
      week_start: mondayKey,
      week_end: sundayKey,
    });
  } catch (err) {
    console.error("[/api/review/:isoWeek GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
