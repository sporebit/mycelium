import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import { localDateKey } from "@/lib/util/date";
import { isBlocker, sortBlockers, toBlockerRow } from "@/lib/blockers";

export const runtime = "nodejs";

const TOP_N = 5;

export async function GET(req: NextRequest) {
  try {
    const tz = process.env.USER_TIMEZONE ?? "Europe/London";
    const todayKey = localDateKey(tz);

    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("tickets")
      .select(`${TASK_SELECT}, space_id`)
      .is("deleted_at", null)
      .is("completed_at", null);

    if (error) throw error;
    auditListRead(req, data, "organisation", "tickets");

    const tasks = (data ?? []).map((row) =>
      serializeTask(row as Parameters<typeof serializeTask>[0])
    );
    // Title lookup so sub-task blockers can render "↑ Parent · Sub-task".
    const titleById = new Map<string, string>();
    for (const t of tasks) titleById.set(t.id, t.title);

    const matching = tasks.filter((t) => isBlocker(t, todayKey));
    const rows = sortBlockers(
      matching.map((t) => toBlockerRow(t, todayKey, tz, titleById))
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
