import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { auditListRead } from "@/lib/system/readAudit";
import { DAY_SELECT, type DayRow } from "@/lib/daylog/engine";
import { DATE_RE, shiftDate, daylogDay } from "@/lib/daylog/day";

export const runtime = "nodejs";

/** GET /api/journal/days?from=&to=&status= — newest first (spec §5). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const today = daylogDay();
  const to = DATE_RE.test(sp.get("to") ?? "") ? sp.get("to")! : today;
  const from = DATE_RE.test(sp.get("from") ?? "") ? sp.get("from")! : shiftDate(to, -90);
  const status = sp.get("status");
  try {
    const supabase = await createUserClient();
    let q = supabase.from("daylog_days").select(`${DAY_SELECT}, space_id`).gte("day", from).lte("day", to).order("day", { ascending: false }).limit(400);
    if (status) q = q.in("status", status.split(","));
    const { data, error } = await q;
    if (error) throw error;
    auditListRead(req, data as Array<{ space_id?: string | null }>, "journal", "daylog");
    const rows = (data ?? []) as Array<DayRow & { space_id?: string }>;
    // Part B: scene titles and the unreviewed count per day, two queries for the whole window
    const ids = rows.map((d) => d.id);
    const [{ data: sceneRows }, { data: pendingRows }] = ids.length
      ? await Promise.all([
          supabase.from("daylog_scenes").select("day_id, title, position").in("day_id", ids).order("position"),
          supabase.from("pending_entities").select("additional_data").is("resolved_at", null).like("entity_type", "daylog_%").limit(2000),
        ])
      : [{ data: [] }, { data: [] }];
    const titles = new Map<string, string[]>();
    for (const r of (sceneRows ?? []) as Array<{ day_id: string; title: string }>) titles.set(r.day_id, [...(titles.get(r.day_id) ?? []), r.title]);
    const toReview = new Map<string, number>();
    for (const r of (pendingRows ?? []) as Array<{ additional_data: { day_id?: string } | null }>) {
      const k = r.additional_data?.day_id;
      if (k) toReview.set(k, (toReview.get(k) ?? 0) + 1);
    }
    const days = rows.map((d) => {
      const userTurns = (d.transcript ?? []).filter((e) => e.role === "user").length;
      return {
        id: d.id,
        day: d.day,
        status: d.status,
        mode: d.mode,
        summary: d.summary,
        scores: d.scores,
        turn_count: d.turn_count,
        user_turns: userTurns,
        cost_pence: d.cost_pence,
        closed_at: d.closed_at,
        legacy: !!d.legacy_journal_id,
        scene_titles: titles.get(d.id) ?? [],
        to_review: toReview.get(d.id) ?? 0,
      };
    });
    return NextResponse.json({ days, window: { from, to }, today });
  } catch (err) {
    console.error("[/api/journal/days GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
