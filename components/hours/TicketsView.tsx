"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { addDays, byTicket, fmtHm, fmtPct, mondayOf, type TicketTable } from "@/lib/hours/calc";
import { joinBase } from "@/lib/hours/ticket";
import { Card, INPUT_SM, dateLabel } from "./kit";
import { useHoursBundle } from "./useHours";

const cell = "px-2 py-1.5 text-right whitespace-nowrap tabular-nums font-[family-name:var(--font-mono)]";
const head = "px-2 py-1.5 text-right whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo";

/**
 * Tickets (spec §5, §3 "By ticket"): time by ticket key for the current
 * week (% of the weekly target, ending with a No ticket total), and for any
 * From/To range (blank = all time; % of the range total). Keys link to the
 * ticket (D3). Entries whose ticket is a non-ticket URL count under No ticket.
 */
export function TicketsView() {
  const { index, today, isLoading } = useHoursBundle();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (isLoading || !index) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const monday = mondayOf(today);
  const week = byTicket(index, monday, addDays(monday, 6), index.settings.target);
  const range = byTicket(index, from || null, to || null, null);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-text-hi">Tickets</h1>
      <Card title="This week" aside={<>{dateLabel(monday)} – {dateLabel(addDays(monday, 6))} · % of target <Mono>{fmtHm(index.settings.target)}</Mono></>}>
        <TicketRows table={week} baseUrl={index.settings.ticketBaseUrl} />
      </Card>
      <Card
        title="Any range"
        aside={
          <span className="inline-flex items-center gap-2">
            <input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${INPUT_SM} w-36`} />
            <span>to</span>
            <input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${INPUT_SM} w-36`} />
          </span>
        }
      >
        <div className="text-xs text-text-lo">
          {from || to ? `${from || "start"} to ${to || "today"}` : "All time"} · total <Mono>{fmtHm(range.total)}</Mono> · % of the range
        </div>
        <TicketRows table={range} baseUrl={index.settings.ticketBaseUrl} />
      </Card>
    </div>
  );
}

function TicketRows({ table, baseUrl }: { table: TicketTable; baseUrl: string }) {
  if (table.rows.length === 0 && table.noTicket === 0) return <div className="text-sm text-text-lo py-2">No time in this range.</div>;
  return (
    <div className="-mx-4 sm:mx-0 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th className={`${head} text-left`}>Ticket</th>
            <th className={`${head} text-left`}>Description</th>
            <th className={head}>Entries</th>
            <th className={head}>Time</th>
            <th className={head}>%</th>
            <th className={head}>Not yet logged</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => {
            const url = joinBase(baseUrl, r.key);
            return (
              <tr key={r.key} className="border-b border-hairline">
                <td className={`${cell} text-left`}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer noopener" className="text-glow hover:underline">
                      {r.key}
                    </a>
                  ) : (
                    r.key
                  )}
                </td>
                <td className="px-2 py-1.5 text-left text-text-mid max-w-[28rem] truncate font-[family-name:var(--font-inter-tight)]">{r.description}</td>
                <td className={`${cell} text-text-lo`}>{r.entries}</td>
                <td className={`${cell} text-text-hi font-semibold`}>{fmtHm(r.minutes)}</td>
                <td className={`${cell} text-text-mid`}>{fmtPct(r.pct)}</td>
                <td className={`${cell} ${r.notYetLogged > 0 ? "text-v2-warn" : "text-text-lo"}`}>{fmtHm(r.notYetLogged)}</td>
              </tr>
            );
          })}
          {table.noTicket > 0 && (
            <tr className="border-b border-hairline text-v2-error">
              <td className={`${cell} text-left font-[family-name:var(--font-inter-tight)]`}>No ticket</td>
              <td className="px-2 py-1.5 text-left text-xs">entries with time and no key</td>
              <td className={cell} />
              <td className={`${cell} font-semibold`}>{fmtHm(table.noTicket)}</td>
              <td className={cell}>{table.denominator > 0 ? fmtPct(table.noTicket / table.denominator) : "—"}</td>
              <td className={cell} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
