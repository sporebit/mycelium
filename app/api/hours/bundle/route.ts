import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { ABSENCE_SELECT, ENTRY_SELECT, HOLIDAY_SELECT, SETTINGS_SELECT, type HoursBundle } from "@/lib/hours/types";

export const runtime = "nodejs";

/**
 * /api/hours/bundle (0156) — everything the Four-Day Week views derive
 * from: the settings row, every live entry, absences and bank holidays.
 * Figures are computed by lib/hours/calc.ts on the client; nothing here is
 * derived. A few thousand rows a year is small enough to send whole.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const [settings, entries, absences, holidays] = await Promise.all([
      supabase.from("hours_settings").select(SETTINGS_SELECT).maybeSingle(),
      supabase.from("hours_entries").select(ENTRY_SELECT).is("deleted_at", null).order("entry_date", { ascending: true, nullsFirst: false }).order("created_at"),
      supabase.from("hours_absences").select(ABSENCE_SELECT).order("absence_date"),
      supabase.from("hours_bank_holidays").select(HOLIDAY_SELECT).order("holiday_date"),
    ]);
    for (const r of [settings, entries, absences, holidays]) if (r.error) throw r.error;
    const bundle: HoursBundle = {
      settings: (settings.data as HoursBundle["settings"]) ?? null,
      entries: (entries.data ?? []) as unknown as HoursBundle["entries"],
      absences: (absences.data ?? []) as unknown as HoursBundle["absences"],
      bankHolidays: (holidays.data ?? []) as unknown as HoursBundle["bankHolidays"],
    };
    auditListRead(req, bundle.entries as unknown as Array<{ space_id?: string | null }>, "organisation", "hours");
    return NextResponse.json(bundle);
  } catch (err) {
    console.error("[/api/hours/bundle GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
