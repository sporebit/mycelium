import { CalendarMonth } from "@/components/fitness/CalendarMonth";
import { fetchMonthCalendar, monthGridRange } from "@/lib/fitness/calendar";
import { localDateKey } from "@/lib/util/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMonth(raw: string | string[] | undefined, fallback: string): {
  year: number;
  month: number;
} {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const candidate = typeof value === "string" ? value : fallback.slice(0, 7);
  const m = candidate.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return { year: y, month: mo };
  }
  const [fy, fm] = fallback.split("-");
  return { year: Number(fy), month: Number(fm) };
}

export default async function FitnessCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const sp = await searchParams;
  const uid = process.env.USER_ID;
  const tz = process.env.USER_TIMEZONE ?? "Europe/London";
  const todayKey = localDateKey(tz);
  const { year, month } = parseMonth(sp.month, todayKey);

  if (!uid) {
    return (
      <div className="p-6 text-danger font-[family-name:var(--font-mono)] text-sm">
        USER_ID env var is missing.
      </div>
    );
  }

  const { cells } = monthGridRange(year, month);
  const days = await fetchMonthCalendar(uid, year, month, todayKey);
  const daysRecord: Record<string, ReturnType<typeof days.get>> = {};
  for (const [k, v] of days.entries()) daysRecord[k] = v;

  return (
    <CalendarMonth
      year={year}
      month={month}
      todayKey={todayKey}
      cells={cells}
      days={daysRecord as Record<string, NonNullable<ReturnType<typeof days.get>>>}
    />
  );
}
