import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readSettingsInput } from "@/lib/hours/settings";
import { SETTINGS_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";

/**
 * PATCH /api/hours/settings — change the tracker's settings (spec §5
 * Settings). One row per space: created with the table defaults the first
 * time anything is saved, then patched. Only the keys sent change. Minutes
 * fields accept minutes or durations ("37:30"). Returns { settings }.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const read = readSettingsInput(body);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { data: existing, error: e1 } = await supabase.from("hours_settings").select("id").maybeSingle();
    if (e1) throw e1;
    const now = new Date().toISOString();
    const q = existing
      ? supabase.from("hours_settings").update({ ...read.fields, updated_at: now }).eq("id", existing.id)
      : supabase.from("hours_settings").insert({ ...read.fields });
    const { data, error } = await q.select(SETTINGS_SELECT).single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error("[/api/hours/settings PATCH]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
