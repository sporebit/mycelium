"use client";

import { Fragment, useMemo, useState } from "react";
import { Label, Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { bundleTotals, fmtBoth, fmtHm, fmtPct, historyRows, reviewDate, type WeekStatus, type WeekSummary } from "@/lib/hours/calc";
import type { ColumnDef } from "@/lib/hours/table";
import { FilterNote, FilterRow, FunnelTh, Th, useTable } from "./table";
import { useHoursBundle } from "./useHours";
import { WeekDaysTable, WeekSummaryStrip } from "./WeekTable";

const STATUS_CLASS: Record<WeekStatus, string> = {
  "": "text-text-lo",
  "In progress": "text-text-lo",
  Met: "text-ok",
  Short: "text-v2-error",
  "Covered on Friday": "text-text-hi",
};

function weekLabel(monday: string): string {
  const [y, m, d] = monday.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const cell = "px-2 py-1.5 text-right whitespace-nowrap";

const COLUMNS: ColumnDef<WeekSummary>[] = [
  { key: "week", label: "Week", kind: "date", get: (w) => w.monday, text: (w) => `${weekLabel(w.monday)} ${w.monday}`, align: "left" },
  { key: "mon", label: "Mon", kind: "duration", get: (w) => w.days[0].total },
  { key: "tue", label: "Tue", kind: "duration", get: (w) => w.days[1].total },
  { key: "wed", label: "Wed", kind: "duration", get: (w) => w.days[2].total },
  { key: "thu", label: "Thu", kind: "duration", get: (w) => w.days[3].total },
  { key: "banked", label: "Mon–Thu", kind: "duration", get: (w) => w.banked },
  { key: "pct", label: "%", kind: "pct", get: (w) => w.weeklyPct },
  { key: "surplus", label: "Surplus lost", kind: "duration", get: (w) => w.surplusLost },
  { key: "shortfall", label: "Shortfall", kind: "duration", get: (w) => w.remaining },
  { key: "fri", label: "Fri worked", kind: "duration", get: (w) => w.friWorked },
  { key: "unlogged", label: "Not yet logged", kind: "duration", get: (w) => w.notYetLogged },
  { key: "status", label: "Status", kind: "text", get: (w) => w.status || null, align: "left" },
];

/**
 * History (spec §5): one row per week since the tracking start, newest
 * first. Mon–Thu by day (credits included), banked, weekly %, surplus lost,
 * shortfall, Friday worked, not yet logged, status. Headers sort, the funnel
 * filters, and clicking a week opens that week's daily table beneath it
 * (Phil, 2026-11-20). Every figure is derived in the browser (lib/hours/calc.ts).
 */
export function HistoryView() {
  const { index, today, isLoading } = useHoursBundle();
  const rows = useMemo(() => (index ? historyRows(index, today).slice().reverse() : []), [index, today]);
  const table = useTable(rows, COLUMNS, null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  if (isLoading || !index) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const totals = bundleTotals(index);
  const completed = rows.filter((r) => r.status === "Met" || r.status === "Short" || r.status === "Covered on Friday");
  const met = completed.filter((r) => r.status === "Met").length;
  const toggle = (monday: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(monday)) n.delete(monday);
      else n.add(monday);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">History</h1>
        <div className="text-xs text-text-lo">
          Since {index.settings.trackingStart} · review {reviewDate(index.settings)} · target <Mono>{fmtHm(index.settings.target)}</Mono> Mon–Thu
        </div>
      </div>
      <div className="text-xs text-text-lo">Click a week to see its days. Click a header to sort; the funnel filters each column.</div>

      <div className="-mx-4 sm:mx-0 overflow-x-auto">
        <table className="min-w-full text-sm font-[family-name:var(--font-mono)] tabular-nums">
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
            {table.rows.map((w) => (
              <Fragment key={w.monday}>
                <HistoryRow w={w} open={open.has(w.monday)} onToggle={() => toggle(w.monday)} />
                {open.has(w.monday) && (
                  <tr className="border-b border-hairline bg-surface-1/40">
                    <td colSpan={COLUMNS.length + 1} className="px-3 py-3 font-[family-name:var(--font-inter-tight)]">
                      <div className="flex flex-col gap-2">
                        <WeekSummaryStrip w={w} />
                        <WeekDaysTable w={w} index={index} today={today} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-2 py-4 text-center text-xs text-text-lo font-[family-name:var(--font-inter-tight)]">
                  No week matches the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <FilterNote table={table} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Completed weeks" value={`${completed.length} · ${met} met`} />
        <Stat label="Entries with time" value={`${totals.withTime} · ${totals.open} open`} />
        <Stat label="Logged in total" value={fmtBoth(totals.loggedMinutes)} />
        <Stat label="Distinct tickets" value={`${totals.distinctKeys}`} />
      </div>
    </div>
  );
}

function HistoryRow({ w, open, onToggle }: { w: WeekSummary; open: boolean; onToggle: () => void }) {
  const dim = w.status === "" ? "opacity-50" : "";
  return (
    <tr
      className={`border-b border-hairline cursor-pointer hover:bg-surface-1 ${open ? "bg-surface-1" : ""} ${dim}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      tabIndex={0}
      aria-expanded={open}
      title={open ? "Hide this week's days" : "Show this week's days"}
    >
      <td className={`${cell} text-left text-text-hi`}>
        <span className={`inline-block w-3 text-[10px] text-text-lo transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {weekLabel(w.monday)}
      </td>
      {w.days.slice(0, 4).map((d) => (
        <td key={d.date} className={`${cell} ${d.credited > 0 ? "text-text-mid" : "text-text-hi"}`} title={d.credited > 0 ? `credited ${fmtHm(d.credited)}` : undefined}>
          {fmtHm(d.total)}
        </td>
      ))}
      <td className={`${cell} text-text-hi font-semibold`}>{fmtHm(w.banked)}</td>
      <td className={`${cell} text-text-mid`}>{fmtPct(w.weeklyPct)}</td>
      <td className={`${cell} ${w.surplusLost > 0 ? "text-text-mid" : "text-text-lo"}`}>{fmtHm(w.surplusLost)}</td>
      <td className={`${cell} ${w.remaining > 0 && w.status !== "In progress" ? "text-v2-error" : "text-text-lo"}`}>{fmtHm(w.remaining)}</td>
      <td className={`${cell} ${w.friWorked > 0 ? "text-text-hi" : "text-text-lo"}`}>{fmtHm(w.friWorked)}</td>
      <td className={`${cell} ${w.notYetLogged > 0 ? "text-text-mid" : "text-text-lo"}`}>{fmtHm(w.notYetLogged)}</td>
      <td className={`${cell} text-left font-[family-name:var(--font-inter-tight)] ${STATUS_CLASS[w.status]}`}>{w.status}</td>
      <td />
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-v2-md border border-hairline px-3 py-2">
      <Label>{label}</Label>
      <div className="mt-1 text-sm text-text-hi">
        <Mono>{value}</Mono>
      </div>
    </div>
  );
}
