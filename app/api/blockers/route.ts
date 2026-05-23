import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { localDateKey } from "@/lib/util/date";
import { isBlocker, sortBlockers, toBlockerRow } from "@/lib/blockers";

export const runtime = "nodejs";

const TOP_N = 5;

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  try {
    const tz = process.env.USER_TIMEZONE ?? "Europe/London";
    const todayKey = localDateKey(tz);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", uid)
      .is("completed_at", null);

    if (error) throw error;

    const tasks = (data ?? []).map((row) =>
      serializeTask(row as Parameters<typeof serializeTask>[0])
    );
    const matching = tasks.filter((t) => isBlocker(t, todayKey));
    const rows = sortBlockers(
      matching.map((t) => toBlockerRow(t, todayKey, tz))
    );

    return NextResponse.json({
      blockers: rows.slice(0, TOP_N),
      total: rows.length,
    });
  } catch (err) {
    console.error("[/api/blockers GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
