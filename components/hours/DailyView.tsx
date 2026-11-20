"use client";

import { Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { addDays, fiveDayPct, fmtHm, fmtPct, fourDayPct, mondayOf, weekSummary, WEEKDAY_SHORT, type HoursIndex, type WeekSummary } from "@/lib/hours/calc";
import { Card, dateLabel } from "./kit";
import { useHoursBundle } from "./useHours";

type HoursIndexOf = HoursIndex;

const cell = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-[family-name:var(--font-mono)]";
const head = "px-2 py-1.5 text-right whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo";

/**
 * Daily (spec §5): this week and last week by day — Logged, Credited, Day
 * total, Day total logged (ticked in Jira), 4-day %, 5-day %, Cumulative
 * Mon–Thu, Not yet logged. The workbook's Jira-reported and Variance
 * columns are not ported (D2).
 */
export function DailyView() {
  const { index, today, isLoading } = useHoursBundle();
  if (isLoading || !index) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const thisMonday = mondayOf(today);
  const weeks = [weekSummary(index, thisMonday, today), weekSummary(index, addDays(thisMonday, -7), today)];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-hi">Daily</h1>
      {weeks.map((w, i) => (
        <WeekTable key={w.monday} w={w} index={index} today={today} title={i === 0 ? "This week" : "Last week"} />
      ))}
    </div>
  );
}

function WeekTable({ w, index, today, title }: { w: WeekSummary; index: HoursIndexOf; today: string; title: string }) {
  // running Mon–Thu total per row, worked out before rendering
  const cumulative = w.days.map((_, i) => w.days.slice(0, Math.min(i, 3) + 1).reduce((s, d) => s + d.total, 0));
  return (
    <Card
      title={title}
      aside={
        <>
          {dateLabel(w.monday)} – {dateLabel(addDays(w.monday, 6))} · banked <Mono>{fmtHm(w.banked)}</Mono> · {fmtPct(w.weeklyPct)}
          {w.status && <> · {w.status}</>}
        </>
      }
    >
      <div className="-mx-4 sm:mx-0 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${head} text-left`}>Day</th>
              <th className={head}>Logged</th>
              <th className={head}>Credited</th>
              <th className={head}>Day total</th>
              <th className={head}>Total logged</th>
              <th className={head}>4-day %</th>
              <th className={head}>5-day %</th>
              <th className={head}>Cumulative</th>
              <th className={head}>Not yet logged</th>
            </tr>
          </thead>
          <tbody>
            {w.days.map((d, i) => {
              const future = d.date > today;
              const isToday = d.date === today;
              const quiet = i > 4 && d.total === 0 && d.entries === 0;
              if (quiet && future) return null;
              return (
                <tr key={d.date} className={`border-b border-hairline ${future ? "opacity-50" : ""} ${isToday ? "bg-glow-wash" : ""} ${i > 3 ? "text-text-mid" : ""}`}>
                  <td className={`${cell} text-left font-[family-name:var(--font-inter-tight)] text-text-hi`}>
                    {WEEKDAY_SHORT[i]} <span className="text-text-lo text-xs">{d.date.slice(8)}</span>
                    {d.isBankHoliday && <span className="ml-2 text-[10px] uppercase text-text-lo">bank hol</span>}
                    {d.hasAbsence && <span className="ml-2 text-[10px] uppercase text-text-lo">absence</span>}
                  </td>
                  <td className={`${cell} text-text-hi`}>{fmtHm(d.logged)}</td>
                  <td className={`${cell} ${d.credited > 0 ? "text-text-mid" : "text-text-lo"}`}>{fmtHm(d.credited)}</td>
                  <td className={`${cell} text-text-hi font-semibold`}>{fmtHm(d.total)}</td>
                  <td className={`${cell} text-text-mid`}>{fmtHm(d.loggedTicked + d.credited)}</td>
                  <td className={`${cell} text-text-mid`}>{i < 4 ? fmtPct(fourDayPct(index, d)) : "—"}</td>
                  <td className={`${cell} text-text-mid`}>{fmtPct(fiveDayPct(index, d))}</td>
                  <td className={`${cell} ${i < 4 ? "text-text-hi" : "text-text-lo"}`}>{i < 4 ? fmtHm(cumulative[i]) : "—"}</td>
                  <td className={`${cell} ${d.notYetLogged > 0 ? "text-v2-warn" : "text-text-lo"}`}>{fmtHm(d.notYetLogged)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
