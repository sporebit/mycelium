"use client";

import Link from "next/link";
import { Button, Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import {
  addDays,
  bannerText,
  bundleTotals,
  checkpoint,
  fiveDayPct,
  fmtBoth,
  fmtHm,
  fmtPct,
  fourDayPct,
  fridayText,
  isOpenItem,
  mondayOf,
  pace,
  todayPanel,
  weekSummary,
  weekdayIndex,
  WEEKDAY_SHORT,
} from "@/lib/hours/calc";
import { buildBlockOut, buildBlockOutIcs } from "@/lib/hours/blockout";
import { Card, Pill, dateLabel } from "./kit";
import { HOURS_BASE } from "./HoursTabs";
import { useHoursBundle } from "./useHours";

const cell = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-[family-name:var(--font-mono)]";
const head = "px-2 py-1.5 text-right whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo";

/**
 * Dashboard (spec §5): banner, This week, Today, the Wednesday checkpoint
 * (with the Friday block-out as a mailto and an .ics — O3), Friday, By day,
 * Pace, Open backlog. Everything is derived in the browser from the bundle.
 */
export function DashboardView() {
  const { bundle, index, today, isLoading } = useHoursBundle();
  if (isLoading || !index || !bundle) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const monday = mondayOf(today);
  const ws = weekSummary(index, monday, today);
  const tp = todayPanel(index, ws, today);
  const cp = checkpoint(ws, index.settings.threshold);
  const pc = pace(ws, today);
  const totals = bundleTotals(index);
  const met = ws.banked >= ws.target;
  const wd = weekdayIndex(today);
  const openItems = index.live.filter(isOpenItem);

  const blockOut = bundle.settings ? buildBlockOut(bundle.settings, today) : null;
  const downloadIcs = () => {
    if (!blockOut) return;
    const blob = new Blob([buildBlockOutIcs(blockOut)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `friday-off-${blockOut.friday}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      {index.staged.length > 0 && (
        <Link href={`${HOURS_BASE}/log`} className="text-xs text-v2-warn hover:underline">
          {index.staged.length} new {index.staged.length === 1 ? "entry is" : "entries are"} waiting in the Log and not counted yet — open the Log to merge.
        </Link>
      )}
      <div
        className={`rounded-v2-lg border px-4 py-3 text-center font-[family-name:var(--font-mono)] text-sm sm:text-base font-semibold tracking-[0.06em] ${
          met ? "border-ok text-ok bg-ok/10" : ws.remaining <= 60 ? "border-v2-warn text-v2-warn" : "border-hairline-strong text-text-hi"
        }`}
      >
        {bannerText(ws)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="This week" aside={`${dateLabel(monday)} – ${dateLabel(addDays(monday, 3))}`}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Banked Mon–Thu" value={fmtBoth(ws.banked)} strong />
            <Stat label="Target" value={fmtBoth(ws.target)} />
            <Stat label="Remaining" value={fmtHm(ws.remaining)} tone={ws.remaining === 0 ? "ok" : undefined} />
            <Stat label="Weekly" value={fmtPct(ws.weeklyPct)} />
            {ws.surplusLost > 0 && <Stat label="Surplus lost" value={fmtHm(ws.surplusLost)} />}
            {ws.notYetLogged > 0 && <Stat label="Not yet logged in Jira" value={fmtHm(ws.notYetLogged)} tone="warn" />}
          </div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div className={`h-full ${met ? "bg-ok" : "bg-glow"}`} style={{ width: `${Math.min(100, Math.round(ws.weeklyPct * 100))}%` }} />
          </div>
        </Card>

        <Card title="Today" aside={dateLabel(today)}>
          <Pill tone={met ? "ok" : wd > 3 ? "neutral" : tp.leftToday === 0 ? "ok" : "warn"}>{tp.pill}</Pill>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Today so far" value={fmtHm(tp.todayTotal)} strong />
            <Stat label="Left today (even pace)" value={wd > 3 ? "—" : fmtHm(tp.leftToday)} />
            <Stat label="Even pace today" value={wd > 3 ? "—" : fmtHm(tp.evenPaceToday)} />
            <Stat label="Flat daily target" value={fmtHm(tp.flatDailyTarget)} />
          </div>
          <Link href={`${HOURS_BASE}/log`} className="text-xs text-glow hover:underline">
            Add to the Log →
          </Link>
        </Card>

        <Card title={`${index.settings.checkpointLabel} checkpoint`} aside={`threshold ${fmtHm(index.settings.threshold)}`}>
          <Pill tone={cp.send ? "ok" : "warn"}>{cp.pill}</Pill>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Banked" value={fmtHm(ws.banked)} />
            <Stat label="Short of threshold" value={fmtHm(cp.shortfall)} tone={cp.shortfall > 0 ? "warn" : "ok"} />
          </div>
          {blockOut && (
            <div className="flex flex-wrap items-center gap-2">
              <a href={blockOut.mailto} className="inline-flex">
                <Button size="sm" variant={cp.send ? "primary" : "ghost"} type="button">
                  OPEN BLOCK-OUT EMAIL
                </Button>
              </a>
              <Button size="sm" onClick={downloadIcs} type="button">
                CALENDAR .ICS
              </Button>
              <span className="text-[11px] text-text-lo">
                Friday {dateLabel(blockOut.friday)} · {blockOut.to.length} recipient{blockOut.to.length === 1 ? "" : "s"} · nothing is sent by Mycelium
              </span>
            </div>
          )}
        </Card>

        <Card title="Friday" aside={dateLabel(addDays(monday, 4))}>
          <Pill tone={ws.fridayOwed === 0 || ws.stillOutstanding === 0 ? "ok" : "error"}>{fridayText(ws)}</Pill>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Owed on Friday" value={fmtHm(ws.fridayOwed)} />
            <Stat label="Worked Friday" value={fmtHm(ws.friWorked)} />
          </div>
        </Card>
      </div>

      <Card title="By day" aside="this week · credits included">
        <div className="-mx-4 sm:mx-0 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-hairline">
                <th className={`${head} text-left`}>Day</th>
                <th className={head}>Logged</th>
                <th className={head}>Credited</th>
                <th className={head}>Total</th>
                <th className={head}>4-day %</th>
                <th className={head}>5-day %</th>
                <th className={head}>Not yet logged</th>
              </tr>
            </thead>
            <tbody>
              {ws.days.slice(0, 5).map((d, i) => {
                const isToday = d.date === today;
                const future = d.date > today;
                return (
                  <tr key={d.date} className={`border-b border-hairline ${future ? "opacity-50" : ""} ${isToday ? "bg-glow-wash" : ""}`}>
                    <td className={`${cell} text-left font-[family-name:var(--font-inter-tight)] text-text-hi`}>
                      {WEEKDAY_SHORT[i]} <span className="text-text-lo text-xs">{d.date.slice(8)}</span>
                    </td>
                    <td className={`${cell} text-text-hi`}>{fmtHm(d.logged)}</td>
                    <td className={`${cell} ${d.credited > 0 ? "text-text-mid" : "text-text-lo"}`} title={d.isBankHoliday ? "bank holiday" : d.hasAbsence ? "absence" : undefined}>
                      {fmtHm(d.credited)}
                    </td>
                    <td className={`${cell} text-text-hi font-semibold`}>{fmtHm(d.total)}</td>
                    <td className={`${cell} text-text-mid`}>{i < 4 ? fmtPct(fourDayPct(index, d)) : "—"}</td>
                    <td className={`${cell} text-text-mid`}>{fmtPct(fiveDayPct(index, d))}</td>
                    <td className={`${cell} ${d.notYetLogged > 0 ? "text-v2-warn" : "text-text-lo"}`}>{fmtHm(d.notYetLogged)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Pace" aside="per remaining day, from tomorrow">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="To Thursday" value={pc.toThursday === null ? "—" : fmtHm(pc.toThursday)} />
            <Stat label="Including Friday" value={pc.inclFriday === null ? "—" : fmtHm(pc.inclFriday)} />
          </div>
        </Card>
        <Card
          title="Open backlog"
          aside={
            <Link href={`${HOURS_BASE}/backlog`} className="text-glow hover:underline">
              open →
            </Link>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Items" value={`${openItems.length}`} />
            <Stat label="Estimated" value={fmtHm(totals.openEstimate)} />
            <Stat label="No estimate" value={`${totals.openWithoutEstimate}`} tone={totals.openWithoutEstimate > 0 ? "warn" : undefined} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "warn" }) {
  const colour = tone === "ok" ? "text-ok" : tone === "warn" ? "text-v2-warn" : "text-text-hi";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-text-lo">{label}</div>
      <div className={`mt-0.5 ${strong ? "text-lg" : "text-sm"} ${colour}`}>
        <Mono>{value}</Mono>
      </div>
    </div>
  );
}
