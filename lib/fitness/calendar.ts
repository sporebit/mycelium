import { createServerClient } from "@/lib/supabase/server";
import { isoWeekString } from "@/lib/util/week";
import type { SessionKind, Slot } from "./types";

export type CalendarPillState =
  | "completed"
  | "active"
  | "planned-future"
  | "planned-past-missed";

export type CalendarPill = {
  id: string;
  kind: SessionKind;
  name: string;
  slot: Slot;
  state: CalendarPillState;
  logged_session_id: string | null;
  programme_session_id: string | null;
  sets: number | null;
  minutes: number | null;
};

export type CalendarDay = {
  date: string;
  pills: CalendarPill[];
};

/** Inclusive YYYY-MM-DD strings for the visible grid (always 42 cells, 6 rows). */
export function monthGridRange(year: number, month: number): {
  monthStart: string;
  monthEnd: string;
  gridStart: string;
  gridEnd: string;
  cells: string[];
} {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const dow0 = first.getUTCDay(); // 0=Sun ... 6=Sat
  const mondayOffset = dow0 === 0 ? 6 : dow0 - 1;
  const gridStartDate = new Date(first);
  gridStartDate.setUTCDate(first.getUTCDate() - mondayOffset);

  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStartDate);
    d.setUTCDate(gridStartDate.getUTCDate() + i);
    cells.push(d.toISOString().slice(0, 10));
  }
  const last = new Date(Date.UTC(year, month, 0));
  return {
    monthStart: first.toISOString().slice(0, 10),
    monthEnd: last.toISOString().slice(0, 10),
    gridStart: cells[0],
    gridEnd: cells[cells.length - 1],
    cells,
  };
}

function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

function dowOfDateKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return jsDayToProgrammeDow(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

function isoWeekOfDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return isoWeekString(new Date(Date.UTC(y, m - 1, d)));
}

type LiveRow = {
  id: string;
  date: string;
  slot: Slot;
  kind: SessionKind;
  name: string | null;
  programme_session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  position: number;
};

type PhaseRow = {
  id: string;
  programme_id: string;
  start_week_iso: string;
  end_week_iso: string | null;
};

type TemplateRow = {
  id: string;
  programme_id: string;
  day_of_week: number;
  slot: Slot;
  kind: SessionKind;
  name: string;
  position: number;
};

type SetCountByLive = Map<string, { sets: number; minutes: number | null }>;

async function fetchSetCounts(
  supabase: ReturnType<typeof createServerClient>,
  liveRows: LiveRow[],
): Promise<SetCountByLive> {
  const out: SetCountByLive = new Map();
  const completedIds = liveRows
    .filter((r) => r.completed_at)
    .map((r) => r.id);
  if (completedIds.length === 0) return out;

  const { data: seRows } = await supabase
    .from("workout_session_exercises")
    .select("id, session_id")
    .in("session_id", completedIds);
  const seToSession = new Map<string, string>();
  for (const r of (seRows ?? []) as Array<{ id: string; session_id: string }>) {
    seToSession.set(r.id, r.session_id);
  }

  const setsBySession = new Map<string, number>();
  if (seToSession.size > 0) {
    const { data: setRows } = await supabase
      .from("workout_sets")
      .select("session_exercise_id, completed_at")
      .in("session_exercise_id", Array.from(seToSession.keys()))
      .not("completed_at", "is", null);
    for (const r of (setRows ?? []) as Array<{ session_exercise_id: string }>) {
      const sid = seToSession.get(r.session_exercise_id);
      if (!sid) continue;
      setsBySession.set(sid, (setsBySession.get(sid) ?? 0) + 1);
    }
  }

  for (const l of liveRows) {
    if (!l.completed_at) continue;
    let minutes: number | null = null;
    if (l.started_at) {
      const ms = new Date(l.completed_at).getTime() - new Date(l.started_at).getTime();
      minutes = Math.max(0, Math.round(ms / 60000));
    }
    out.set(l.id, { sets: setsBySession.get(l.id) ?? 0, minutes });
  }
  return out;
}

/**
 * Fetches all month grid data in a single round-trip set:
 *  - completed + active workout_sessions for the visible range
 *  - planned-future + planned-past-missed from active programme template
 */
export async function fetchMonthCalendar(
  userId: string,
  year: number,
  month: number,
  todayKey: string,
): Promise<Map<string, CalendarDay>> {
  const supabase = createServerClient();
  const { gridStart, gridEnd, cells } = monthGridRange(year, month);

  // 1. Pull every workout_session in the visible range
  const { data: liveRowsRaw } = await supabase
    .from("workout_sessions")
    .select(
      "id, date, slot, kind, name, programme_session_id, started_at, completed_at, position",
    )
    .eq("user_id", userId)
    .gte("date", gridStart)
    .lte("date", gridEnd)
    .order("position", { ascending: true });
  const liveRows = (liveRowsRaw ?? []) as LiveRow[];

  // Track which (date, programme_session_id) pairs are accounted for by a
  // live row — needed so planned-past-missed only emits genuinely-missed
  // sessions, not ones the user already completed under a different slot.
  const liveByDateTpl = new Set<string>();
  for (const l of liveRows) {
    if (l.programme_session_id) {
      liveByDateTpl.add(`${l.date}:${l.programme_session_id}`);
    }
  }

  // 2. Pull phases that touch the grid range, then their template sessions
  const gridStartWeek = isoWeekOfDateKey(gridStart);
  const gridEndWeek = isoWeekOfDateKey(gridEnd);
  const { data: phaseRowsRaw } = await supabase
    .from("workout_programme_phases")
    .select("id, programme_id, start_week_iso, end_week_iso")
    .eq("user_id", userId)
    .lte("start_week_iso", gridEndWeek)
    .or(`end_week_iso.is.null,end_week_iso.gte.${gridStartWeek}`);
  const phases = (phaseRowsRaw ?? []) as PhaseRow[];

  const programmeIds = Array.from(new Set(phases.map((p) => p.programme_id)));
  let templates: TemplateRow[] = [];
  if (programmeIds.length > 0) {
    const { data: tplRaw } = await supabase
      .from("workout_programme_sessions")
      .select("id, programme_id, day_of_week, slot, kind, name, position")
      .in("programme_id", programmeIds);
    templates = (tplRaw ?? []) as TemplateRow[];
  }
  const templatesByProgramme = new Map<string, TemplateRow[]>();
  for (const t of templates) {
    const list = templatesByProgramme.get(t.programme_id) ?? [];
    list.push(t);
    templatesByProgramme.set(t.programme_id, list);
  }

  const setCounts = await fetchSetCounts(supabase, liveRows);

  // Bucket cells
  const days = new Map<string, CalendarDay>();
  for (const c of cells) days.set(c, { date: c, pills: [] });

  // 3. Live rows → completed / active pills
  for (const l of liveRows) {
    const day = days.get(l.date);
    if (!day) continue;
    const completed = !!l.completed_at;
    const active = !completed && !!l.started_at;
    const counts = setCounts.get(l.id) ?? null;
    day.pills.push({
      id: `live:${l.id}`,
      kind: l.kind,
      name: l.name ?? "Session",
      slot: l.slot,
      state: completed ? "completed" : active ? "active" : "planned-future",
      logged_session_id: l.id,
      programme_session_id: l.programme_session_id,
      sets: counts?.sets ?? null,
      minutes: counts?.minutes ?? null,
    });
  }

  // 4. Expand programme templates across cells covered by their phase
  for (const cell of cells) {
    const cellWeek = isoWeekOfDateKey(cell);
    const phase = phases.find((p) => {
      if (p.start_week_iso > cellWeek) return false;
      if (p.end_week_iso !== null && p.end_week_iso < cellWeek) return false;
      return true;
    });
    if (!phase) continue;
    const tpls = templatesByProgramme.get(phase.programme_id) ?? [];
    const dow = dowOfDateKey(cell);
    for (const t of tpls) {
      if (t.day_of_week !== dow) continue;
      if (liveByDateTpl.has(`${cell}:${t.id}`)) continue; // already represented by a live row
      const day = days.get(cell);
      if (!day) continue;
      day.pills.push({
        id: `tpl:${cell}:${t.id}`,
        kind: t.kind,
        name: t.name,
        slot: t.slot,
        state: cell < todayKey ? "planned-past-missed" : "planned-future",
        logged_session_id: null,
        programme_session_id: t.id,
        sets: null,
        minutes: null,
      });
    }
  }

  // Sort pills within each cell: completed first, then active, then planned-future,
  // then missed. Within a state, by slot order (morning→afternoon→evening→extra)
  // then by name.
  const STATE_ORDER: Record<CalendarPillState, number> = {
    completed: 0,
    active: 1,
    "planned-future": 2,
    "planned-past-missed": 3,
  };
  const SLOT_ORDER_VAL: Record<Slot, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    extra: 3,
  };
  for (const day of days.values()) {
    day.pills.sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        SLOT_ORDER_VAL[a.slot] - SLOT_ORDER_VAL[b.slot] ||
        a.name.localeCompare(b.name),
    );
  }
  return days;
}

/** Day detail data — same shape as the month query, restricted to one day. */
export async function fetchDayCalendar(
  userId: string,
  dateKey: string,
  todayKey: string,
): Promise<CalendarDay> {
  const [y, m] = dateKey.split("-").map(Number);
  const all = await fetchMonthCalendar(userId, y, m, todayKey);
  return all.get(dateKey) ?? { date: dateKey, pills: [] };
}
