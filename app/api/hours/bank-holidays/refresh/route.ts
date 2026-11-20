import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readGovUkHolidays } from "@/lib/hours/settings";

export const runtime = "nodejs";
export const maxDuration = 30;

const GOV_UK = "https://www.gov.uk/bank-holidays.json";

/**
 * POST /api/hours/bank-holidays/refresh — pull England and Wales bank
 * holidays from gov.uk (spec §4) from the tracking start's year onwards and
 * add the dates not already held. Existing rows are left alone. Returns
 * { added, total }.
 */
export async function POST() {
  try {
    const supabase = await createUserClient();
    const [{ data: s }, { data: have, error: e1 }] = await Promise.all([
      supabase.from("hours_settings").select("tracking_start").maybeSingle(),
      supabase.from("hours_bank_holidays").select("holiday_date"),
    ]);
    if (e1) throw e1;
    const start = (s?.tracking_start as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const from = `${start.slice(0, 4)}-01-01`;
    const res = await fetch(GOV_UK, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `gov.uk answered ${res.status}` }, { status: 502 });
    const feed: unknown = await res.json();
    const known = new Set((have ?? []).map((h) => h.holiday_date as string));
    const rows = readGovUkHolidays(feed, from).filter((h) => !known.has(h.holiday_date));
    if (rows.length) {
      const { error } = await supabase.from("hours_bank_holidays").insert(rows);
      if (error) throw error;
    }
    return NextResponse.json({ added: rows.length, total: known.size + rows.length });
  } catch (err) {
    console.error("[/api/hours/bank-holidays/refresh POST]", err);
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}
