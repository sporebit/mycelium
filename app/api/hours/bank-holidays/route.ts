import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readHolidayInput } from "@/lib/hours/settings";
import { HOLIDAY_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";

/** POST /api/hours/bank-holidays — add one by hand (the gov.uk refresh covers the usual ones). One row per date. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const read = readHolidayInput(body);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { data: existing } = await supabase.from("hours_bank_holidays").select("id").eq("holiday_date", read.fields.holiday_date).maybeSingle();
    const q = existing ? supabase.from("hours_bank_holidays").update({ name: read.fields.name }).eq("id", existing.id) : supabase.from("hours_bank_holidays").insert(read.fields);
    const { data, error } = await q.select(HOLIDAY_SELECT).single();
    if (error) throw error;
    return NextResponse.json({ holiday: data }, { status: existing ? 200 : 201 });
  } catch (err) {
    console.error("[/api/hours/bank-holidays POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
