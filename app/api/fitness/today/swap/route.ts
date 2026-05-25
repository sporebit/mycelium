import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/util/date";
import { isoWeekString } from "@/lib/util/week";
import type { Slot, SessionKind } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

type Body = {
  slot?: Slot;
  target_programme_session_id?: string;
};

/**
 * Pre-start swap — creates a workout_sessions row for today/slot pointing at
 * the target template. Used when the user picks "swap" before pressing
 * START SESSION. If a row already exists, the caller should use the per-
 * session swap endpoint instead (which preserves logged data).
 */
export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const slot = body.slot;
  const targetId = body.target_programme_session_id;
  if (!slot || (slot !== "morning" && slot !== "afternoon")) {
    return NextResponse.json({ error: "invalid slot" }, { status: 400 });
  }
  if (!targetId) {
    return NextResponse.json(
      { error: "target_programme_session_id required" },
      { status: 400 }
    );
  }

  const today = localDateKey();
  try {
    const supabase = createServerClient();
    // Block if any session already exists for today/slot
    const { data: existing } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", uid)
      .eq("date", today)
      .eq("slot", slot)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json(
        { error: "session exists — use /sessions/[id]/swap" },
        { status: 409 }
      );
    }

    // Target template metadata
    const { data: tgt } = await supabase
      .from("workout_programme_sessions")
      .select("id, name, kind")
      .eq("id", targetId)
      .maybeSingle();
    if (!tgt) {
      return NextResponse.json({ error: "target not found" }, { status: 404 });
    }
    const target = tgt as { id: string; name: string; kind: SessionKind };

    // Today's original session at this slot, if any (for audit field)
    const tz = process.env.USER_TIMEZONE ?? "Europe/London";
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const currentWeek = isoWeekString(nowLocal);
    const dow = (nowLocal.getDay() + 6) % 7;
    const { data: phaseRows } = await supabase
      .from("workout_programme_phases")
      .select("programme_id, start_week_iso, end_week_iso")
      .eq("user_id", uid)
      .lte("start_week_iso", currentWeek)
      .or(`end_week_iso.is.null,end_week_iso.gte.${currentWeek}`)
      .order("start_week_iso", { ascending: false })
      .limit(1);
    let originalId: string | null = null;
    const phase = (phaseRows ?? [])[0] as { programme_id: string } | undefined;
    if (phase) {
      const { data: orig } = await supabase
        .from("workout_programme_sessions")
        .select("id")
        .eq("programme_id", phase.programme_id)
        .eq("day_of_week", dow)
        .eq("slot", slot)
        .maybeSingle();
      originalId = (orig?.id as string | null) ?? null;
    }

    const { data: created, error } = await supabase
      .from("workout_sessions")
      .insert({
        user_id: uid,
        date: today,
        slot,
        kind: target.kind,
        name: target.name,
        programme_session_id: target.id,
        swapped_from_programme_session_id: originalId,
        started_at: null,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[/api/fitness/today/swap]", error);
      return NextResponse.json({ error: "swap failed" }, { status: 500 });
    }
    return NextResponse.json({ session_id: created.id, swapped: true });
  } catch (err) {
    console.error("[/api/fitness/today/swap]", err);
    return NextResponse.json({ error: "swap failed" }, { status: 500 });
  }
}
