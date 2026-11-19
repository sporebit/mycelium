"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { fmtHm, isOpenItem } from "@/lib/hours/calc";
import { defaultEntryDate } from "@/lib/hours/entry";
import { AddEntryBar } from "./AddEntryBar";
import { EntryRow } from "./EntryRow";
import { useHoursBundle } from "./useHours";

/**
 * Backlog (spec §5, §3 "Backlog (open work)"): a filter of the Log — every
 * entry with a description or ticket and no Time Spent, with its Estimate.
 * Not a separate list (§7). Filling in Time Spent on a row turns it into a
 * normal entry and it leaves this view.
 */
export function BacklogView() {
  const { bundle, index, today, isLoading } = useHoursBundle();
  const open = useMemo(() => (index ? index.live.filter(isOpenItem).slice().sort((a, b) => (a.entry_date ?? "9999").localeCompare(b.entry_date ?? "9999") || a.created_at.localeCompare(b.created_at)) : []), [index]);

  if (isLoading || !index || !bundle) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const estimated = open.reduce((s, e) => s + (e.estimate_minutes ?? 0), 0);
  const withoutEstimate = open.filter((e) => e.estimate_minutes === null).length;
  const catchAll = (bundle.settings?.catch_all_tickets ?? []).map((t) => t.key);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">Backlog</h1>
        <div className="text-xs text-text-lo">
          {open.length} open · estimated <Mono>{fmtHm(estimated)}</Mono>
          {withoutEstimate > 0 && <> · {withoutEstimate} without an estimate</>}
        </div>
      </div>
      <AddEntryBar defaultDate={defaultEntryDate(bundle.entries, today)} catchAll={catchAll} />
      <p className="text-xs text-text-lo">Open work: anything with a description or ticket and no Time Spent. Click a row and fill in Time Spent when it is done; it then moves to the Log.</p>
      {open.length === 0 ? (
        <div className="rounded-v2-md border border-hairline p-6 text-center text-sm text-text-lo">No open items.</div>
      ) : (
        <div>
          {open.map((e) => (
            <EntryRow key={e.id} entry={e} baseUrl={index.settings.ticketBaseUrl} showDate />
          ))}
        </div>
      )}
    </div>
  );
}
