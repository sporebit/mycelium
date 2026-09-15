import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { localDateKey } from "@/lib/util/date";
import {
  getOrCreateDailyLog,
  parseNotes,
  type DailyNotes,
} from "@/lib/dailyLog";

export const runtime = "nodejs";

export async function GET() {
  const dateKey = localDateKey();
  try {
    const supabase = await createUserClient();
    const row = await getOrCreateDailyLog(supabase, dateKey);
    return NextResponse.json({
      date: row.log_date,
      mood: row.mood,
      notes: parseNotes(row.notes),
    });
  } catch (err) {
    console.error("[daily-log/today GET]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Partial<DailyNotes>;
  try {
    const parsed = (await req.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }
    body = parsed as Partial<DailyNotes>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const dateKey = localDateKey();
  try {
    const supabase = await createUserClient();
    const row = await getOrCreateDailyLog(supabase, dateKey);
    const current = parseNotes(row.notes);
    const merged: DailyNotes = { ...current, ...body };

    const { error } = await supabase
      .from("daily_logs")
      .update({
        notes: JSON.stringify(merged),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) throw error;

    return NextResponse.json({ date: dateKey, notes: merged });
  } catch (err) {
    console.error("[daily-log/today PATCH]", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
