import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateDailyLog, parseNotes } from "@/lib/dailyLog";
import {
  REVIEW_FIELDS,
  emptyReview,
  mergeReview,
  type WeeklyReview,
} from "@/lib/types/review";
import {
  dateKeyLocal,
  isoWeekOf,
  mondayOfWeek,
  sundayOfWeek,
} from "@/lib/util/week";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

function thisWeekContext() {
  const now = new Date();
  const sunday = sundayOfWeek(now);
  const monday = mondayOfWeek(now);
  const iso = isoWeekOf(now);
  return {
    dateKey: dateKeyLocal(sunday),
    mondayKey: dateKeyLocal(monday),
    sundayKey: dateKeyLocal(sunday),
    isoYear: iso.year,
    isoWeek: iso.week,
  };
}

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

export async function GET() {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const ctx = thisWeekContext();
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, ctx.dateKey);
    const review = readReview(row.notes);
    return NextResponse.json({
      review,
      iso_year: ctx.isoYear,
      iso_week: ctx.isoWeek,
      week_start: ctx.mondayKey,
      week_end: ctx.sundayKey,
    });
  } catch (err) {
    console.error("[/api/review/current GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  let body: Partial<WeeklyReview>;
  try {
    body = (await req.json()) as Partial<WeeklyReview>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  // Only accept the canonical fields; ignore sealed_at on PATCH (use the
  // seal/unseal routes for that).
  const patch: Partial<WeeklyReview> = {};
  for (const f of REVIEW_FIELDS) {
    const v = (body as Record<string, unknown>)[f];
    if (typeof v === "string") patch[f] = v;
  }

  try {
    const ctx = thisWeekContext();
    const supabase = createServerClient();
    const row = await getOrCreateDailyLog(supabase, uid, ctx.dateKey);
    const current = parseNotes(row.notes) as Record<string, unknown>;
    const existingReview = readReview(row.notes);

    if (existingReview.sealed_at) {
      return NextResponse.json(
        { error: "Week is sealed — unseal to edit." },
        { status: 409 }
      );
    }

    const nextReview = mergeReview(existingReview, patch);
    const nextNotes = { ...current, weekly_review: nextReview };
    const { error } = await supabase
      .from("daily_logs")
      .update({
        notes: JSON.stringify(nextNotes),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw error;

    return NextResponse.json({ review: nextReview });
  } catch (err) {
    console.error("[/api/review/current PATCH]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
