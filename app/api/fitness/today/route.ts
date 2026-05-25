import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isoWeekString } from "@/lib/util/week";
import { localDateKey } from "@/lib/util/date";
import type {
  SessionKind,
  Slot,
  TemplateExercise,
  TemplateKind,
  TemplateSession,
  TemplateSlot,
  TodayResponse,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const SESSION_FIELDS =
  "id, programme_id, day_of_week, slot, kind, name, notes";
const EXERCISE_FIELDS =
  "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity";
const LIVE_SESSION_FIELDS =
  "id, slot, kind, name, programme_session_id, session_type, swapped_from_programme_session_id, started_at, completed_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

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
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const currentWeek = isoWeekString(nowLocal);
    const dow = jsDayToProgrammeDow(nowLocal.getDay());

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

    // Today's live workout_sessions (started, completed, or pre-start)
    const { data: liveRows } = await supabase
      .from("workout_sessions")
      .select(LIVE_SESSION_FIELDS)
      .eq("user_id", uid)
      .eq("date", todayKey);
    type LiveRow = {
      id: string;
      slot: Slot;
      kind: SessionKind;
      name: string | null;
      programme_session_id: string | null;
      session_type: string | null;
      swapped_from_programme_session_id: string | null;
      started_at: string | null;
      completed_at: string | null;
    };
    const live = (liveRows ?? []) as LiveRow[];
    const liveBySlot = new Map<string, LiveRow>();
    for (const l of live) {
      if (l.slot === "morning" || l.slot === "afternoon") liveBySlot.set(l.slot, l);
    }

    if (!activePhase) {
      // No programme. Still show extras.
      const extras = live
        .filter((l) => l.slot === "extra")
        .map((l) => toExtra(l, null));
      const empty: TodayResponse = {
        date: todayKey,
        programme_name: null,
        programme_id: null,
        programme_sessions: [],
        sessions: [],
        extras,
      };
      return NextResponse.json(empty);
    }

    const programmeId = (activePhase as { programme_id: string }).programme_id;
    const { data: programme } = await supabase
      .from("workout_programmes")
      .select("name")
      .eq("id", programmeId)
      .eq("user_id", uid)
      .maybeSingle();

    // All programme sessions (for the swap dropdown).
    const { data: allTplSessions } = await supabase
      .from("workout_programme_sessions")
      .select(SESSION_FIELDS)
      .eq("programme_id", programmeId)
      .order("day_of_week", { ascending: true })
      .order("slot", { ascending: true });
    const allSessions = (allTplSessions ?? []) as TemplateSession[];
    const sessionById = new Map(allSessions.map((s) => [s.id, s]));

    // The set of programme_session ids we need exercise lists for
    const neededIds = new Set<string>();
    for (const s of allSessions.filter((s) => s.day_of_week === dow)) {
      neededIds.add(s.id);
    }
    for (const l of liveBySlot.values()) {
      if (l.programme_session_id) neededIds.add(l.programme_session_id);
    }

    let exByPS = new Map<string, TemplateExercise[]>();
    if (neededIds.size > 0) {
      const { data: exRows } = await supabase
        .from("workout_programme_exercises")
        .select(EXERCISE_FIELDS)
        .in("programme_session_id", Array.from(neededIds))
        .order("position", { ascending: true });
      exByPS = new Map();
      for (const ex of (exRows ?? []) as TemplateExercise[]) {
        const list = exByPS.get(ex.programme_session_id) ?? [];
        list.push(ex);
        exByPS.set(ex.programme_session_id, list);
      }
    }

    // Set-count per completed session (used for summary)
    const completedIds = live.filter((r) => r.completed_at).map((r) => r.id);
    const setsBySession = new Map<string, number>();
    if (completedIds.length > 0) {
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

    // Baselines for the known-pain dot
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

    // Iterate by slot — build one card per planned/active morning + afternoon.
    const todaysOriginals = new Map<string, TemplateSession>();
    for (const s of allSessions) {
      if (s.day_of_week === dow) todaysOriginals.set(s.slot, s);
    }

    const slotsToRender: Slot[] = ["morning", "afternoon"];
    const sessions: TodayResponse["sessions"] = [];
    for (const slot of slotsToRender) {
      const liveRow = liveBySlot.get(slot) ?? null;
      const original = todaysOriginals.get(slot) ?? null;

      // Effective programme_session: swap target via live row, else original
      const effectiveId =
        liveRow?.programme_session_id ?? original?.id ?? null;
      if (!effectiveId) continue; // nothing planned for this slot

      const effective = sessionById.get(effectiveId) ?? null;
      const exs = exByPS.get(effectiveId) ?? [];
      const knownIssuesCount = exs.reduce(
        (n, ex) => n + (issueNames.has(ex.name.toLowerCase()) ? 1 : 0),
        0
      );
      const completed = !!liveRow?.completed_at;
      const inProgress = !!liveRow && !!liveRow.started_at && !completed;
      let summary: { sets: number; minutes: number | null } | null = null;
      if (completed && liveRow) {
        let minutes: number | null = null;
        if (liveRow.started_at && liveRow.completed_at) {
          const ms =
            new Date(liveRow.completed_at).getTime() -
            new Date(liveRow.started_at).getTime();
          minutes = Math.max(0, Math.round(ms / 60000));
        }
        summary = { sets: setsBySession.get(liveRow.id) ?? 0, minutes };
      }

      sessions.push({
        slot,
        kind: (liveRow?.kind ?? effective?.kind ?? "other") as SessionKind,
        name: effective?.name ?? liveRow?.name ?? "Session",
        programme_session_id: effectiveId,
        session_type: liveRow?.session_type ?? null,
        swapped_from_programme_session_id:
          liveRow?.swapped_from_programme_session_id ?? null,
        exercises: exs,
        logged_session_id: liveRow?.id ?? null,
        completed,
        in_progress: inProgress,
        summary,
        known_issues_count: knownIssuesCount,
      });
    }

    const extras = live
      .filter((l) => l.slot === "extra")
      .map((l) => toExtra(l, setsBySession.get(l.id) ?? 0));

    const out: TodayResponse = {
      date: todayKey,
      programme_name: (programme?.name as string | null) ?? null,
      programme_id: programmeId,
      programme_sessions: allSessions.map((s) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        slot: s.slot as TemplateSlot,
        kind: s.kind as TemplateKind,
        name: s.name,
      })),
      sessions,
      extras,
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/fitness/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

function toExtra(
  l: {
    id: string;
    name: string | null;
    session_type: string | null;
    kind: SessionKind;
    started_at: string | null;
    completed_at: string | null;
  },
  setCount: number | null
): TodayResponse["extras"][number] {
  const completed = !!l.completed_at;
  let summary: { sets: number; minutes: number | null } | null = null;
  if (completed) {
    let minutes: number | null = null;
    if (l.started_at && l.completed_at) {
      const ms =
        new Date(l.completed_at).getTime() - new Date(l.started_at).getTime();
      minutes = Math.max(0, Math.round(ms / 60000));
    }
    summary = { sets: setCount ?? 0, minutes };
  }
  return {
    session_id: l.id,
    name: l.name,
    session_type: l.session_type,
    kind: l.kind,
    completed,
    summary,
  };
}
