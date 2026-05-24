import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isoWeekString } from "@/lib/util/week";
import { localDateKey } from "@/lib/util/date";
import type {
  TemplateExercise,
  TemplateSession,
  TodayResponse,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const SESSION_FIELDS =
  "id, programme_id, day_of_week, slot, kind, name, notes";
const EXERCISE_FIELDS =
  "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

/** Convert JS getDay() (0=Sun..6=Sat) to programme day_of_week (0=Mon..6=Sun). */
function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();
    const tz = process.env.USER_TIMEZONE ?? "Europe/London";
    const todayKey = localDateKey(tz);
    // ISO week from local now
    const nowLocal = new Date(
      new Date().toLocaleString("en-US", { timeZone: tz })
    );
    const currentWeek = isoWeekString(nowLocal);
    const dow = jsDayToProgrammeDow(nowLocal.getDay());

    // Find active phase: start_week_iso <= currentWeek AND (end_week_iso IS NULL OR >= currentWeek)
    const { data: phaseRows } = await supabase
      .from("workout_programme_phases")
      .select("id, programme_id, start_week_iso, end_week_iso")
      .eq("user_id", uid)
      .lte("start_week_iso", currentWeek)
      .or(`end_week_iso.is.null,end_week_iso.gte.${currentWeek}`)
      .order("start_week_iso", { ascending: false })
      .limit(1);
    const activePhase =
      Array.isArray(phaseRows) && phaseRows.length > 0 ? phaseRows[0] : null;

    if (!activePhase) {
      const empty: TodayResponse = {
        date: todayKey,
        programme_name: null,
        sessions: [],
      };
      return NextResponse.json(empty);
    }

    // Programme metadata
    const { data: programme } = await supabase
      .from("workout_programmes")
      .select("name")
      .eq("id", activePhase.programme_id)
      .eq("user_id", uid)
      .maybeSingle();

    // Today's sessions for this day_of_week
    const { data: sessionRows } = await supabase
      .from("workout_programme_sessions")
      .select(SESSION_FIELDS)
      .eq("programme_id", activePhase.programme_id)
      .eq("day_of_week", dow)
      .order("slot", { ascending: true });

    const sessions = (sessionRows ?? []) as TemplateSession[];
    const sessionIds = sessions.map((s) => s.id);

    let exByPS = new Map<string, TemplateExercise[]>();
    if (sessionIds.length > 0) {
      const { data: exRows } = await supabase
        .from("workout_programme_exercises")
        .select(EXERCISE_FIELDS)
        .in("programme_session_id", sessionIds)
        .order("position", { ascending: true });
      exByPS = new Map();
      for (const ex of (exRows ?? []) as TemplateExercise[]) {
        const list = exByPS.get(ex.programme_session_id) ?? [];
        list.push(ex);
        exByPS.set(ex.programme_session_id, list);
      }
    }

    // Logged-today lookup
    const { data: loggedRows } = await supabase
      .from("workout_sessions")
      .select("id, programme_session_id, slot")
      .eq("user_id", uid)
      .eq("date", todayKey);
    const loggedByPS = new Map<string, string>(); // ps_id → workout_session.id
    for (const row of (loggedRows ?? []) as Array<{
      id: string;
      programme_session_id: string | null;
      slot: string;
    }>) {
      if (row.programme_session_id) loggedByPS.set(row.programme_session_id, row.id);
    }

    const out: TodayResponse = {
      date: todayKey,
      programme_name: (programme?.name as string | null) ?? null,
      sessions: sessions.map((s) => ({
        slot: s.slot,
        kind: s.kind,
        name: s.name,
        programme_session_id: s.id,
        exercises: exByPS.get(s.id) ?? [],
        logged: loggedByPS.has(s.id),
        logged_session_id: loggedByPS.get(s.id) ?? null,
      })),
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/fitness/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
