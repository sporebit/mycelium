import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readAbsenceInput } from "@/lib/hours/settings";
import { ABSENCE_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";

/**
 * POST /api/hours/absences — annual leave, sick or other on a date (spec §2:
 * credits a standard day unless minutes are given). One row per date: a
 * second absence on the same date replaces the first. Returns { absence }.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const supabase = await createUserClient();
    const { data: s } = await supabase.from("hours_settings").select("standard_day_minutes").maybeSingle();
    const read = readAbsenceInput(body, (s?.standard_day_minutes as number | undefined) ?? 450);
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
    const { data: existing } = await supabase.from("hours_absences").select("id").eq("absence_date", read.fields.absence_date).maybeSingle();
    const q = existing
      ? supabase.from("hours_absences").update({ ...read.fields, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : supabase.from("hours_absences").insert(read.fields);
    const { data, error } = await q.select(ABSENCE_SELECT).single();
    if (error) throw error;
    return NextResponse.json({ absence: data }, { status: existing ? 200 : 201 });
  } catch (err) {
    console.error("[/api/hours/absences POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
