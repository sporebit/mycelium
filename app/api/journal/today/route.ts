import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/util/date";
import { JOURNAL_SELECT, type JournalEntry } from "@/lib/journal/types";

export const runtime = "nodejs";

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const today = localDateKey();
    const { data, error } = await supabase
      .from("journal_entries")
      .select(JOURNAL_SELECT)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .eq("entry_date", today)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ entries: (data ?? []) as JournalEntry[] });
  } catch (err) {
    console.error("[/api/journal/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
