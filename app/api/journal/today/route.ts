import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { localDateKey } from "@/lib/util/date";
import { JOURNAL_SELECT, type JournalEntry } from "@/lib/journal/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    const today = localDateKey();
    const { data, error } = await supabase
      .from("journal_entries")
      .select(`${JOURNAL_SELECT}, space_id`)
      .is("deleted_at", null)
      .eq("entry_date", today)
      .order("created_at", { ascending: true });
    if (error) throw error;
    auditListRead(req, data, "journal", "journal");
    return NextResponse.json({ entries: (data ?? []) as JournalEntry[] });
  } catch (err) {
    console.error("[/api/journal/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
