"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { fmtHm, isBacklogItem, isOpenItem } from "@/lib/hours/calc";
import { EntryHeader, EntryRow } from "./EntryRow";
import { useHoursBundle } from "./useHours";

/**
 * Backlog (spec §5, §3 "Backlog (open work)"): a filter of the Log — every
 * entry with a description or ticket and no Time Spent, with its Estimate.
 * Not a separate list (§7). Filling in Time Spent on a row turns it into a
 * normal entry and it leaves this view.
 */
export function BacklogView() {
  const { bundle, index, isLoading } = useHoursBundle();
  const open = useMemo(() => (index ? index.live.filter(isBacklogItem).slice().sort((a, b) => (a.entry_date ?? "9999").localeCompare(b.entry_date ?? "9999") || a.created_at.localeCompare(b.created_at)) : []), [index]);

  if (isLoading || !index || !bundle) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const estimated = open.reduce((s, e) => s + (e.estimate_minutes ?? 0), 0);
  const withoutEstimate = open.filter((e) => isOpenItem(e) && e.estimate_minutes === null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">Backlog</h1>
        <div className="text-xs text-text-lo">
          {open.length} open · estimated <Mono>{fmtHm(estimated)}</Mono>
          {withoutEstimate > 0 && <> · {withoutEstimate} without an estimate</>}
        </div>
      </div>
      <p className="text-xs text-text-lo">Open work: anything with no Time Spent, and anything merged without a date. New work is typed into the blank row on the Log. Type into Time and Date here when it is done; it then moves to the Log. Enter saves and moves down, Tab across, Esc puts a cell back.</p>
      {open.length === 0 ? (
        <div className="rounded-v2-md border border-hairline p-6 text-center text-sm text-text-lo">No open items.</div>
      ) : (
        <div data-hours-grid>
          <EntryHeader showEstimate />
          {open.map((e) => (
            <EntryRow key={e.id} entry={e} baseUrl={index.settings.ticketBaseUrl} showEstimate />
          ))}
        </div>
      )}
    </div>
  );
}
