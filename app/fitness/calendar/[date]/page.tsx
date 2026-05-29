import { notFound } from "next/navigation";
import { CalendarDayView } from "@/components/fitness/CalendarDayView";
import { fetchDayCalendar } from "@/lib/fitness/calendar";
import { createServerClient } from "@/lib/supabase/server";
import { isoWeekString } from "@/lib/util/week";
import { localDateKey } from "@/lib/util/date";
import type { TemplateKind, TemplateSlot, TodayResponse } from "@/lib/fitness/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProgrammeSessions(
  userId: string,
  dateKey: string,
): Promise<TodayResponse["programme_sessions"]> {
  const supabase = createServerClient();
  const [y, m, d] = dateKey.split("-").map(Number);
  const cellWeek = isoWeekString(new Date(Date.UTC(y, m - 1, d)));

  const { data: phaseRows } = await supabase
    .from("workout_programme_phases")
    .select("id, programme_id, start_week_iso, end_week_iso")
    .eq("user_id", userId)
    .lte("start_week_iso", cellWeek)
    .or(`end_week_iso.is.null,end_week_iso.gte.${cellWeek}`)
    .order("start_week_iso", { ascending: false })
    .limit(1);
  const phase = (phaseRows ?? [])[0] as
    | { programme_id: string }
    | undefined;
  if (!phase) return [];

  const { data: sessions } = await supabase
    .from("workout_programme_sessions")
    .select("id, day_of_week, slot, kind, name, position")
    .eq("programme_id", phase.programme_id);
  return ((sessions ?? []) as Array<{
    id: string;
    day_of_week: number;
    slot: TemplateSlot;
    kind: TemplateKind;
    name: string;
    position: number;
  }>).map((s) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    slot: s.slot,
    kind: s.kind,
    name: s.name,
    position: s.position ?? 0,
  }));
}

export default async function FitnessCalendarDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const uid = process.env.USER_ID;
  if (!uid) {
    return (
      <div className="p-6 text-danger font-[family-name:var(--font-mono)] text-sm">
        USER_ID env var is missing.
      </div>
    );
  }

  const tz = process.env.USER_TIMEZONE ?? "Europe/London";
  const todayKey = localDateKey(tz);
  const day = await fetchDayCalendar(uid, date, todayKey);
  const programmeSessions = await loadProgrammeSessions(uid, date);

  return (
    <CalendarDayView
      date={date}
      pills={day.pills}
      todayKey={todayKey}
      programmeSessions={programmeSessions}
    />
  );
}
