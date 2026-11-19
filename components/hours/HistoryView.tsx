"use client";

import { Label, Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { bundleTotals, fmtBoth, fmtHm, fmtPct, historyRows, reviewDate, type WeekStatus, type WeekSummary } from "@/lib/hours/calc";
import { useHoursBundle } from "./useHours";

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
const head = "px-2 py-1.5 text-right whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo";

/**
 * History (spec §5): one row per week since the tracking start, newest
 * first. Mon–Thu by day (credits included), banked, weekly %, surplus lost,
 * shortfall, Friday worked, not yet logged, status. Every figure is derived
 * from the bundle in the browser (lib/hours/calc.ts).
 */
export function HistoryView() {
  const { index, today, isLoading } = useHoursBundle();
  if (isLoading || !index) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const rows = historyRows(index, today).slice().reverse();
  const totals = bundleTotals(index);
  const completed = rows.filter((r) => r.status === "Met" || r.status === "Short" || r.status === "Covered on Friday");
  const met = completed.filter((r) => r.status === "Met").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">History</h1>
        <div className="text-xs text-text-lo">
          Since {index.settings.trackingStart} · review {reviewDate(index.settings)} · target <Mono>{fmtHm(index.settings.target)}</Mono> Mon–Thu
        </div>
      </div>

      <div className="-mx-4 sm:mx-0 overflow-x-auto">
        <table className="min-w-full text-sm font-[family-name:var(--font-mono)] tabular-nums">
          <thead>
            <tr className="border-b border-hairline">
              <th className={`${head} text-left`}>Week</th>
              <th className={head}>Mon</th>
              <th className={head}>Tue</th>
              <th className={head}>Wed</th>
              <th className={head}>Thu</th>
              <th className={head}>Mon–Thu</th>
              <th className={head}>%</th>
              <th className={head}>Surplus lost</th>
              <th className={head}>Shortfall</th>
              <th className={head}>Fri worked</th>
              <th className={head}>Not yet logged</th>
              <th className={`${head} text-left`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <HistoryRow key={w.monday} w={w} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Completed weeks" value={`${completed.length} · ${met} met`} />
        <Stat label="Entries with time" value={`${totals.withTime} · ${totals.open} open`} />
        <Stat label="Logged in total" value={fmtBoth(totals.loggedMinutes)} />
        <Stat label="Distinct tickets" value={`${totals.distinctKeys}`} />
      </div>
    </div>
  );
}

function HistoryRow({ w }: { w: WeekSummary }) {
  const dim = w.status === "" ? "opacity-50" : "";
  return (
    <tr className={`border-b border-hairline ${dim}`}>
      <td className={`${cell} text-left text-text-hi`}>{weekLabel(w.monday)}</td>
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
