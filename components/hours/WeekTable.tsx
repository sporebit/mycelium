"use client";

import { useMemo } from "react";
import { Mono } from "@/components/dashboard/Mono";
import { addDays, fiveDayPct, fmtHm, fmtPct, fourDayPct, WEEKDAY_SHORT, type DayTotals, type HoursIndex, type WeekSummary } from "@/lib/hours/calc";
import type { ColumnDef } from "@/lib/hours/table";
import { Pill, shortDate } from "./kit";
import { FilterRow, FunnelTh, Th, useTable } from "./table";

const cell = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-[family-name:var(--font-mono)]";

type DayRow = {
  d: DayTotals;
  i: number;
  label: string;
  cumulative: number | null;
  fourDay: number | null;
  fiveDay: number;
  future: boolean;
  isToday: boolean;
};

const COLUMNS: ColumnDef<DayRow>[] = [
  { key: "day", label: "Day", kind: "text", get: (r) => r.i, text: (r) => r.label, align: "left" },
  { key: "logged", label: "Logged", kind: "duration", get: (r) => r.d.logged },
  { key: "credited", label: "Credited", kind: "duration", get: (r) => r.d.credited },
  { key: "total", label: "Day total", kind: "duration", get: (r) => r.d.total },
  { key: "totalLogged", label: "Total logged", kind: "duration", get: (r) => r.d.loggedTicked + r.d.credited },
  { key: "fourDay", label: "4-day %", kind: "pct", get: (r) => r.fourDay },
  { key: "fiveDay", label: "5-day %", kind: "pct", get: (r) => r.fiveDay },
  { key: "cumulative", label: "Cumulative", kind: "duration", get: (r) => r.cumulative },
  { key: "notYetLogged", label: "Not yet logged", kind: "duration", get: (r) => r.d.notYetLogged },
];

/**
 * One week by day (spec §5 Daily): Logged, Credited, Day total, Day total
 * logged (ticked in Jira), 4-day %, 5-day %, Cumulative Mon–Thu, Not yet
 * logged. Headers sort, the funnel filters. Used by Daily and by History
 * when a week is opened. Quiet future weekend days are left out.
 */
export function WeekDaysTable({ w, index, today }: { w: WeekSummary; index: HoursIndex; today: string }) {
  const rows = useMemo<DayRow[]>(() => {
    const cumulative = w.days.map((_, i) => w.days.slice(0, Math.min(i, 3) + 1).reduce((s, d) => s + d.total, 0));
    return w.days
      .map((d, i) => ({
        d,
        i,
        label: `${WEEKDAY_SHORT[i]} ${d.date.slice(8)}`,
        cumulative: i < 4 ? cumulative[i] : null,
        fourDay: i < 4 ? fourDayPct(index, d) : null,
        fiveDay: fiveDayPct(index, d),
        future: d.date > today,
        isToday: d.date === today,
      }))
      .filter((r) => !(r.i > 4 && r.future && r.d.total === 0 && r.d.entries === 0));
  }, [w, index, today]);
  const table = useTable(rows, COLUMNS, null);

  return (
    <div className="-mx-4 sm:mx-0 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            {COLUMNS.map((c) => (
              <Th key={c.key} col={c} table={table} />
            ))}
            <FunnelTh table={table} />
          </tr>
          <FilterRow columns={COLUMNS} table={table} />
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const { d, i } = r;
            return (
              <tr key={d.date} className={`border-b border-hairline ${r.future ? "opacity-50" : ""} ${r.isToday ? "bg-glow-wash" : ""} ${i > 3 ? "text-text-mid" : ""}`}>
                <td className={`${cell} text-left font-[family-name:var(--font-inter-tight)] text-text-hi`}>
                  {WEEKDAY_SHORT[i]} <span className="text-text-lo text-xs">{d.date.slice(8)}</span>
                  {d.isBankHoliday && <span className="ml-2 text-[10px] uppercase text-text-lo">bank hol</span>}
                  {d.hasAbsence && <span className="ml-2 text-[10px] uppercase text-text-lo">absence</span>}
                </td>
                <td className={`${cell} text-text-hi`}>{fmtHm(d.logged)}</td>
                <td className={`${cell} ${d.credited > 0 ? "text-text-mid" : "text-text-lo"}`}>{fmtHm(d.credited)}</td>
                <td className={`${cell} text-text-hi font-semibold`}>{fmtHm(d.total)}</td>
                <td className={`${cell} text-text-mid`}>{fmtHm(d.loggedTicked + d.credited)}</td>
                <td className={`${cell} text-text-mid`}>{r.fourDay === null ? "—" : fmtPct(r.fourDay)}</td>
                <td className={`${cell} text-text-mid`}>{fmtPct(r.fiveDay)}</td>
                <td className={`${cell} ${r.cumulative === null ? "text-text-lo" : "text-text-hi"}`}>{r.cumulative === null ? "—" : fmtHm(r.cumulative)}</td>
                <td className={`${cell} ${d.notYetLogged > 0 ? "text-v2-warn" : "text-text-lo"}`}>{fmtHm(d.notYetLogged)}</td>
                <td />
              </tr>
            );
          })}
          {table.rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-2 py-3 text-center text-xs text-text-lo">
                No day matches the filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The week's headline figures, built to be read at a glance (Phil: the
 * top-right summary "doesn't stand out very much"): the date range quietly,
 * then banked hours as a solid chip, the weekly % and the status as pills in
 * the state colours.
 */
export function WeekSummaryStrip({ w }: { w: WeekSummary }) {
  const met = w.banked >= w.target;
  const pctTone = met ? "ok" : w.status === "In progress" || w.status === "" ? "neutral" : w.status === "Covered on Friday" ? "warn" : "error";
  const statusTone = w.status === "Met" ? "ok" : w.status === "Short" ? "error" : w.status === "Covered on Friday" ? "warn" : "neutral";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-text-lo mr-1">
        {shortDate(w.monday)} – {shortDate(addDays(w.monday, 6))}
      </span>
      <span className={`inline-flex items-baseline gap-1.5 rounded-v2-md border px-2.5 py-1 ${met ? "border-ok/60 bg-ok/10" : "border-hairline-strong bg-surface-1"}`}>
        <Mono>
          <span className={`text-sm font-semibold ${met ? "text-ok" : "text-text-hi"}`}>{fmtHm(w.banked)}</span>
        </Mono>
        <span className="text-[10px] uppercase tracking-[0.08em] text-text-lo">of {fmtHm(w.target)}</span>
      </span>
      <Pill tone={pctTone}>{fmtPct(w.weeklyPct)}</Pill>
      {w.status && <Pill tone={statusTone}>{w.status}</Pill>}
      {w.remaining > 0 && w.status === "In progress" && <span className="text-xs text-text-mid">{fmtHm(w.remaining)} to go</span>}
    </div>
  );
}
