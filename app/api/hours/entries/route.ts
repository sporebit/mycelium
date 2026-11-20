import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { readEntryInput } from "@/lib/hours/entry";
import { ENTRY_SELECT } from "@/lib/hours/types";

export const runtime = "nodejs";

/**
 * POST /api/hours/entries — add one Log entry (spec §5 "fast add").
 * Body: { entry_date?, minutes?, estimate_minutes?, description?, ticket?,
 * logged? }. Time fields take minutes or typed durations ("0:45", "1.5h").
 * The ticket key is derived here, never trusted from the client. The row
 * lands in the caller's personal space (the table default) as source
 * "manual" and waits in the Log's holding section (merged_at null, 0157)
 * until MERGE. Returns { entry }.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const read = readEntryInput(body, "create");
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("hours_entries")
      .insert({ ...read.fields, source: "manual", merged_at: null })
      .select(ENTRY_SELECT)
      .single();
    if (error) throw error;
    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/hours/entries POST]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
