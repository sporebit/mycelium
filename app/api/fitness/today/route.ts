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

    // Today's workout_sessions (started or completed)
    const { data: loggedRows } = await supabase
      .from("workout_sessions")
      .select("id, programme_session_id, slot, started_at, completed_at")
      .eq("user_id", uid)
      .eq("date", todayKey);
    type LoggedRow = {
      id: string;
      programme_session_id: string | null;
      slot: string;
      started_at: string | null;
      completed_at: string | null;
    };
    const loggedByPS = new Map<string, LoggedRow>();
    for (const row of (loggedRows ?? []) as LoggedRow[]) {
      if (row.programme_session_id) loggedByPS.set(row.programme_session_id, row);
    }

    // Summary stats: count sets per completed session
    const completedIds = (loggedRows ?? [])
      .filter((r) => r.completed_at)
      .map((r) => r.id);
    const setsBySession = new Map<string, number>();
    if (completedIds.length > 0) {
      // Two-hop: session → session_exercises → sets
      const { data: seRows } = await supabase
        .from("workout_session_exercises")
        .select("id, session_id")
        .in("session_id", completedIds);
      const seToSession = new Map<string, string>();
      for (const r of (seRows ?? []) as Array<{ id: string; session_id: string }>) {
        seToSession.set(r.id, r.session_id);
      }
      if (seToSession.size > 0) {
        const { data: setRows } = await supabase
          .from("workout_sets")
          .select("session_exercise_id, completed_at")
          .in("session_exercise_id", Array.from(seToSession.keys()))
          .not("completed_at", "is", null);
        for (const r of (setRows ?? []) as Array<{
          session_exercise_id: string;
          completed_at: string | null;
        }>) {
          const sid = seToSession.get(r.session_exercise_id);
          if (!sid) continue;
          setsBySession.set(sid, (setsBySession.get(sid) ?? 0) + 1);
        }
      }
    }

    // Pull baselines once, then count known-issue exercises per session.
    const { data: baselineRows } = await supabase
      .from("exercise_baselines")
      .select("exercise_name, has_known_issues")
      .eq("user_id", uid)
      .eq("has_known_issues", true);
    const issueNames = new Set<string>();
    for (const b of (baselineRows ?? []) as Array<{
      exercise_name: string;
      has_known_issues: boolean;
    }>) {
      issueNames.add(b.exercise_name.toLowerCase());
    }

    const out: TodayResponse = {
      date: todayKey,
      programme_name: (programme?.name as string | null) ?? null,
      sessions: sessions.map((s) => {
        const live = loggedByPS.get(s.id) ?? null;
        const completed = !!live?.completed_at;
        const inProgress = !!live && !completed;
        let summary: { sets: number; minutes: number | null } | null = null;
        if (completed && live) {
          let minutes: number | null = null;
          if (live.started_at && live.completed_at) {
            const ms =
              new Date(live.completed_at).getTime() -
              new Date(live.started_at).getTime();
            minutes = Math.max(0, Math.round(ms / 60000));
          }
          summary = { sets: setsBySession.get(live.id) ?? 0, minutes };
        }
        const exs = exByPS.get(s.id) ?? [];
        const knownIssuesCount = exs.reduce(
          (n, ex) => n + (issueNames.has(ex.name.toLowerCase()) ? 1 : 0),
          0
        );
        return {
          slot: s.slot,
          kind: s.kind,
          name: s.name,
          programme_session_id: s.id,
          exercises: exs,
          logged_session_id: live?.id ?? null,
          completed,
          in_progress: inProgress,
          summary,
          known_issues_count: knownIssuesCount,
        };
      }),
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/fitness/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
