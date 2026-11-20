"use client";

import { useMemo, useState } from "react";
import { Button, Skeleton, SegmentedControl } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { addDays, dayTotals, entryState, fmtHm, isOpenItem, mondayOf, type EntryState } from "@/lib/hours/calc";
import { defaultEntryDate } from "@/lib/hours/entry";
import type { HoursEntry } from "@/lib/hours/types";
import { AddEntryBar } from "./AddEntryBar";
import { EntryHeader, EntryRow } from "./EntryRow";
import { INPUT_SM, dateLabel } from "./kit";
import { useEntryMutations } from "./useEntryMutations";
import { useHoursBundle } from "./useHours";

type Range = "this" | "last" | "pick" | "all";
type StateFilter = "all" | "unlogged" | "incomplete" | "open";

const STATE_OPTIONS: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unlogged", label: "Not logged" },
  { value: "incomplete", label: "Incomplete" },
  { value: "open", label: "Open" },
];

function matchesState(e: HoursEntry, f: StateFilter): boolean {
  const s: EntryState = entryState(e);
  switch (f) {
    case "all":
      return true;
    case "unlogged":
      return s === "amber" || s === "red";
    case "incomplete":
      return s === "red";
    case "open":
      return s === "open";
  }
}

/**
 * The Log (spec §5): the only data-entry surface. Fast add at the top, then
 * entries grouped by day, newest day first, each day with its total (credits
 * included). Filters: a week (this, last, any week by date, or everything),
 * entry state, and a text search over description and ticket. Click a row
 * to edit it in place.
 */
export function LogView() {
  const { bundle, index, today, isLoading } = useHoursBundle();
  const [range, setRange] = useState<Range>("this");
  const [pick, setPick] = useState(today);
  const [state, setState] = useState<StateFilter>("all");
  const [q, setQ] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const { mergeAll } = useEntryMutations();
  const [merging, setMerging] = useState(false);

  const monday = range === "this" ? mondayOf(today) : range === "last" ? addDays(mondayOf(today), -7) : range === "pick" ? mondayOf(pick) : null;
  const sunday = monday ? addDays(monday, 6) : null;

  const groups = useMemo(() => {
    if (!index) return [];
    const needle = q.trim().toLowerCase();
    const byDate = new Map<string, HoursEntry[]>();
    for (const e of index.live) {
      if (monday && sunday && (!e.entry_date || e.entry_date < monday || e.entry_date > sunday)) continue;
      if (!matchesState(e, state)) continue;
      if (needle && !e.description.toLowerCase().includes(needle) && !e.ticket_raw.toLowerCase().includes(needle)) continue;
      if (!e.entry_date) continue; // dateless entries live in the Backlog
      const list = byDate.get(e.entry_date) ?? [];
      list.push(e);
      byDate.set(e.entry_date, list);
    }
    const days = Array.from(byDate.keys()).sort();
    if (!sortAsc) days.reverse();
    return days.map((d) => ({ date: d, entries: byDate.get(d)!.slice().sort((a, b) => (sortAsc ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))) }));
  }, [index, monday, sunday, state, q, sortAsc]);

  if (isLoading || !index || !bundle) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const baseUrl = index.settings.ticketBaseUrl;
  const catchAll = (bundle.settings?.catch_all_tickets ?? []).map((t) => t.key);
  const shown = groups.reduce((n, g) => n + g.entries.length, 0);
  const shownMinutes = groups.reduce((n, g) => n + g.entries.reduce((s, e) => s + (e.minutes ?? 0), 0), 0);
  const openCount = index.live.filter(isOpenItem).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">Log</h1>
        <div className="text-xs text-text-lo">
          {shown} {shown === 1 ? "entry" : "entries"} · <Mono>{fmtHm(shownMinutes)}</Mono>
          {openCount > 0 && <> · {openCount} open</>}
        </div>
      </div>

      <AddEntryBar defaultDate={defaultEntryDate(bundle.entries, today)} catchAll={catchAll} />

      {index.staged.length > 0 && (
        <section className="rounded-v2-lg border border-dashed border-glow-dim p-2" data-hours-grid>
          <div className="flex items-center gap-3 px-2 pb-1 border-b border-hairline mb-1">
            <span className="text-sm font-semibold text-text-hi">New entries</span>
            <span className="text-xs text-text-lo">
              {index.staged.length} waiting · <Mono>{fmtHm(index.staged.reduce((s, e) => s + (e.minutes ?? 0), 0))}</Mono> · not counted until merged
            </span>
            <Button
              size="sm"
              variant="primary"
              className="ml-auto"
              loading={merging}
              onClick={async () => {
                setMerging(true);
                await mergeAll();
                setMerging(false);
              }}
            >
              MERGE
            </Button>
          </div>
          <EntryHeader />
          {index.staged
            .slice()
            .sort((a, b) => (a.entry_date ?? "9999").localeCompare(b.entry_date ?? "9999") || a.created_at.localeCompare(b.created_at))
            .map((e) => (
              <EntryRow key={e.id} entry={e} baseUrl={baseUrl} showEstimate />
            ))}
          <div className="px-2 pt-1 text-[11px] text-text-lo">Merge adds dated entries to their day below and dateless ones to the Backlog.</div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          options={[
            { value: "this", label: "This week" },
            { value: "last", label: "Last week" },
            { value: "pick", label: "Week of…" },
            { value: "all", label: "All" },
          ]}
          value={range}
          onChange={(v) => setRange(v as Range)}
        />
        {range === "pick" && <input aria-label="Any date in the week" type="date" value={pick} onChange={(e) => e.target.value && setPick(e.target.value)} className={`${INPUT_SM} w-40`} />}
        <SegmentedControl options={STATE_OPTIONS} value={state} onChange={(v) => setState(v as StateFilter)} />
        <input aria-label="Search" placeholder="Search description or ticket" value={q} onChange={(e) => setQ(e.target.value)} className={`${INPUT_SM} w-full sm:w-64 sm:ml-auto`} />
        <button type="button" onClick={() => setSortAsc((v) => !v)} className="text-xs text-text-mid hover:text-text-hi whitespace-nowrap">
          {sortAsc ? "Oldest first ↑" : "Newest first ↓"}
        </button>
      </div>

      <div className="text-xs text-text-lo">
        {monday && sunday ? <>Week of {dateLabel(monday, true)} to {dateLabel(sunday)} · </> : null}
        Click any cell to edit. Enter saves and moves down, Tab moves across, Esc puts it back.
      </div>

      {groups.length === 0 ? (
        <div className="rounded-v2-md border border-hairline p-6 text-center text-sm text-text-lo">Nothing here for this filter.</div>
      ) : (
        <div className="flex flex-col gap-4" data-hours-grid>
          <EntryHeader />
          {groups.map((g) => (
            <DayGroup key={g.date} date={g.date} entries={g.entries} baseUrl={baseUrl} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayGroup({ date, entries, baseUrl, index }: { date: string; entries: HoursEntry[]; baseUrl: string; index: NonNullable<ReturnType<typeof useHoursBundle>["index"]> }) {
  const d = dayTotals(index, date);
  return (
    <section>
      <div className="flex items-baseline gap-2 px-2 pb-1 border-b border-hairline mb-1">
        <span className="text-sm font-semibold text-text-hi">{dateLabel(date)}</span>
        <span className="text-xs text-text-lo ml-auto">
          {d.credited > 0 && (
            <>
              <span title={d.isBankHoliday ? "bank holiday" : "absence"}>credited {fmtHm(d.credited)}</span> ·{" "}
            </>
          )}
          {d.notYetLogged > 0 && <span className="text-v2-warn">{fmtHm(d.notYetLogged)} not logged · </span>}
          <Mono>{fmtHm(d.total)}</Mono>
        </span>
      </div>
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} baseUrl={baseUrl} />
      ))}
    </section>
  );
}
