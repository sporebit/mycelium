import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isoWeekString } from "@/lib/util/week";
import { localDateKey } from "@/lib/util/date";
import { SLOT_ORDER } from "@/lib/fitness/kind";
import type {
  SessionKind,
  Slot,
  TemplateExercise,
  TemplateKind,
  TemplateSession,
  TemplateSlot,
  TodayResponse,
  TodaySlotEntry,
} from "@/lib/fitness/types";

export const runtime = "nodejs";

const TEMPLATE_SESSION_FIELDS =
  "id, programme_id, day_of_week, slot, kind, name, notes, position";
const EXERCISE_FIELDS =
  "id, programme_session_id, position, name, notes, default_sets, default_reps, default_weight, default_weight_unit, rest_seconds, default_duration_min, default_distance_km, default_intensity, data_shape, with_weight";
const LIVE_SESSION_FIELDS =
  "id, slot, kind, name, programme_session_id, session_type, swapped_from_programme_session_id, started_at, completed_at, position";

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

    // All of today's live workout_sessions across every slot
    const { data: liveRows } = await supabase
      .from("workout_sessions")
      .select(LIVE_SESSION_FIELDS)
      .eq("user_id", uid)
      .eq("date", todayKey)
      .order("position", { ascending: true });
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
      position: number;
    };
    const live = (liveRows ?? []) as LiveRow[];

    if (!activePhase) {
      const out: TodayResponse = {
        date: todayKey,
        programme_name: null,
        programme_id: null,
        programme_sessions: [],
        slots: cloneEmptySlots(),
      };
      // Live sessions (extras typically) still render even without a programme
      await populateLiveOnly(supabase, live, out.slots);
      return NextResponse.json(out);
    }

    const programmeId = (activePhase as { programme_id: string }).programme_id;
    const { data: programme } = await supabase
      .from("workout_programmes")
      .select("name")
      .eq("id", programmeId)
      .eq("user_id", uid)
      .maybeSingle();

    // All programme template sessions (for swap dropdowns + today rendering)
    const { data: allTplSessions } = await supabase
      .from("workout_programme_sessions")
      .select(TEMPLATE_SESSION_FIELDS)
      .eq("programme_id", programmeId)
      .order("day_of_week", { ascending: true })
      .order("slot", { ascending: true })
      .order("position", { ascending: true });
    const allSessions = (allTplSessions ?? []) as TemplateSession[];
    const sessionById = new Map(allSessions.map((s) => [s.id, s]));

    // Exercise lookup for templates we'll actually render today + any
    // template a live row points at (swap target).
    const neededTplIds = new Set<string>();
    for (const s of allSessions) {
      if (s.day_of_week === dow) neededTplIds.add(s.id);
    }
    for (const l of live) {
      if (l.programme_session_id) neededTplIds.add(l.programme_session_id);
    }
    const exByPS = new Map<string, TemplateExercise[]>();
    if (neededTplIds.size > 0) {
      const { data: exRows } = await supabase
        .from("workout_programme_exercises")
        .select(EXERCISE_FIELDS)
        .in("programme_session_id", Array.from(neededTplIds))
        .order("position", { ascending: true });
      for (const ex of (exRows ?? []) as TemplateExercise[]) {
        const list = exByPS.get(ex.programme_session_id) ?? [];
        list.push(ex);
        exByPS.set(ex.programme_session_id, list);
      }
    }

    // Set count per completed session for the summary block
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
        }>) {
          const sid = seToSession.get(r.session_exercise_id);
          if (!sid) continue;
          setsBySession.set(sid, (setsBySession.get(sid) ?? 0) + 1);
        }
      }
    }

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

    const slots = cloneEmptySlots();

    // 1. Emit one entry per live session, in position order
    const liveTplIds = new Set<string>();
    for (const l of live) {
      const tplId = l.programme_session_id;
      const tpl = tplId ? sessionById.get(tplId) ?? null : null;
      if (tplId) liveTplIds.add(tplId);
      const exs = tplId ? exByPS.get(tplId) ?? [] : [];
      const knownIssuesCount = exs.reduce(
        (n, ex) => n + (issueNames.has(ex.name.toLowerCase()) ? 1 : 0),
        0
      );
      const completed = !!l.completed_at;
      const inProgress = !!l.started_at && !completed;
      let summary: { sets: number; minutes: number | null } | null = null;
      if (completed) {
        let minutes: number | null = null;
        if (l.started_at && l.completed_at) {
          const ms =
            new Date(l.completed_at).getTime() -
            new Date(l.started_at).getTime();
          minutes = Math.max(0, Math.round(ms / 60000));
        }
        summary = { sets: setsBySession.get(l.id) ?? 0, minutes };
      }
      slots[l.slot].push({
        slot: l.slot,
        position: l.position,
        kind: l.kind,
        name: l.name ?? tpl?.name ?? "Session",
        programme_session_id: tplId,
        logged_session_id: l.id,
        session_type: l.session_type,
        swapped_from_programme_session_id: l.swapped_from_programme_session_id,
        exercises: exs,
        completed,
        in_progress: inProgress,
        summary,
        known_issues_count: knownIssuesCount,
      });
    }

    // 2. Add planned-only template sessions for today (no live row)
    for (const s of allSessions) {
      if (s.day_of_week !== dow) continue;
      if (liveTplIds.has(s.id)) continue;
      const exs = exByPS.get(s.id) ?? [];
      const knownIssuesCount = exs.reduce(
        (n, ex) => n + (issueNames.has(ex.name.toLowerCase()) ? 1 : 0),
        0
      );
      slots[s.slot as Slot].push({
        slot: s.slot as Slot,
        position: s.position ?? 0,
        kind: s.kind as SessionKind,
        name: s.name,
        programme_session_id: s.id,
        logged_session_id: null,
        session_type: null,
        swapped_from_programme_session_id: null,
        exercises: exs,
        completed: false,
        in_progress: false,
        summary: null,
        known_issues_count: knownIssuesCount,
      });
    }

    // Sort each slot by position
    for (const k of SLOT_ORDER) {
      slots[k].sort((a, b) => a.position - b.position);
    }

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
        position: s.position ?? 0,
      })),
      slots,
    };
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/fitness/today GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

function cloneEmptySlots(): Record<Slot, TodaySlotEntry[]> {
  return {
    morning: [],
    afternoon: [],
    evening: [],
    extra: [],
  };
}

async function populateLiveOnly(
  _supabase: ReturnType<typeof createServerClient>,
  live: Array<{
    id: string;
    slot: Slot;
    kind: SessionKind;
    name: string | null;
    programme_session_id: string | null;
    session_type: string | null;
    swapped_from_programme_session_id: string | null;
    started_at: string | null;
    completed_at: string | null;
    position: number;
  }>,
  slots: Record<Slot, TodaySlotEntry[]>
): Promise<void> {
  for (const l of live) {
    const completed = !!l.completed_at;
    const inProgress = !!l.started_at && !completed;
    slots[l.slot].push({
      slot: l.slot,
      position: l.position,
      kind: l.kind,
      name: l.name ?? "Session",
      programme_session_id: l.programme_session_id,
      logged_session_id: l.id,
      session_type: l.session_type,
      swapped_from_programme_session_id: l.swapped_from_programme_session_id,
      exercises: [],
      completed,
      in_progress: inProgress,
      summary: null,
      known_issues_count: 0,
    });
  }
  for (const k of SLOT_ORDER) slots[k].sort((a, b) => a.position - b.position);
}

