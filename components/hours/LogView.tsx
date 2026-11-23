"use client";

import { useMemo, useState } from "react";
import { Button, Skeleton, SegmentedControl } from "@/components/ui";
import { Mono } from "@/components/dashboard/Mono";
import { addDays, dayTotals, entryState, fmtHm, isBacklogItem, isOpenItem, mondayOf, type EntryState } from "@/lib/hours/calc";
import { defaultEntryDate } from "@/lib/hours/entry";
import type { HoursEntry } from "@/lib/hours/types";
import { EntryHeader, EntryRow } from "./EntryRow";
import { BacklogTag, INPUT_SM, dateLabel } from "./kit";
import { NewEntryRow } from "./NewEntryRow";
import { SelectionBar } from "./SelectionBar";
import { ENTRY_COLUMNS, FilterNote, useTable } from "./table";
import { useEntryMutations } from "./useEntryMutations";
import { useHoursBundle } from "./useHours";
import { useSelection, type Selection } from "./useSelection";

type Range = "this" | "last" | "pick" | "all";
type StateFilter = "all" | "unlogged" | "incomplete" | "open";

const STATE_OPTIONS: Array<{ value: StateFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unlogged", label: "Not logged" },
  { value: "incomplete", label: "Incomplete" },
  { value: "open", label: "Backlog" },
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

const ids = (rows: HoursEntry[]) => rows.map((e) => e.id);

/**
 * The Log (spec §5): the only data-entry surface. At the top, the holding
 * section (0157): a blank spreadsheet row to type new entries into, the
 * entries typed so far waiting beneath it, and MERGE. Below, the record:
 * entries grouped by day, newest day first, each day with its total (credits
 * included). Filters: a week (this, last, any week by date, or everything),
 * entry state, and a text search over description and ticket. Every cell
 * edits in place.
 *
 * Ticks (Phil, 2026-11-23): every row has a tick box and every header a
 * select-all. In the holding section MERGE takes the ticked rows when there
 * are any, else everything; ticked rows can also be deleted together. In
 * the record the ticked rows can be deleted together. Open work with a date
 * (a backlog item, also listed on the Backlog page) sits under its day in
 * blue, so the Log shows the whole plan for a day, not only the time spent.
 */
export function LogView() {
  const { bundle, index, today, isLoading } = useHoursBundle();
  const [range, setRange] = useState<Range>("this");
  const [pick, setPick] = useState(today);
  const [state, setState] = useState<StateFilter>("all");
  const [q, setQ] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const { merge, removeMany } = useEntryMutations();
  const [merging, setMerging] = useState(false);

  const monday = range === "this" ? mondayOf(today) : range === "last" ? addDays(mondayOf(today), -7) : range === "pick" ? mondayOf(pick) : null;
  const sunday = monday ? addDays(monday, 6) : null;

  // Week, state and search narrow the record first; the column filters and sort (table) apply next.
  const inRange = useMemo(() => {
    if (!index) return [];
    const needle = q.trim().toLowerCase();
    const out: HoursEntry[] = [];
    for (const e of index.live) {
      if (monday && sunday && (!e.entry_date || e.entry_date < monday || e.entry_date > sunday)) continue;
      if (!matchesState(e, state)) continue;
      if (needle && !e.description.toLowerCase().includes(needle) && !e.ticket_raw.toLowerCase().includes(needle)) continue;
      if (!e.entry_date) continue; // dateless entries live on the Backlog page alone
      out.push(e);
    }
    return out;
  }, [index, monday, sunday, state, q]);
  const table = useTable(inRange, ENTRY_COLUMNS, null);

  // Grouped by day (newest day first unless flipped); inside a day the column sort wins, else newest entry first.
  const groups = useMemo(() => {
    const byDate = new Map<string, HoursEntry[]>();
    for (const e of table.rows) {
      const list = byDate.get(e.entry_date!) ?? [];
      list.push(e);
      byDate.set(e.entry_date!, list);
    }
    const days = Array.from(byDate.keys()).sort();
    if (!sortAsc) days.reverse();
    return days.map((d) => {
      const entries = byDate.get(d)!;
      return { date: d, entries: table.sort ? entries : entries.slice().sort((a, b) => (sortAsc ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))) };
    });
  }, [table.rows, table.sort, sortAsc]);

  const staged = useMemo(() => (index ? index.staged.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)) : []), [index]);
  const stagedIds = useMemo(() => ids(staged), [staged]);
  const recordIds = useMemo(() => ids(table.rows), [table.rows]);
  const heldSel = useSelection(stagedIds);
  const recordSel = useSelection(recordIds);

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
  const shownOpen = groups.reduce((n, g) => n + g.entries.filter(isOpenItem).length, 0);
  const openCount = index.live.filter(isOpenItem).length;

  const doMerge = async (only?: string[]) => {
    setMerging(true);
    await merge(only);
    setMerging(false);
    heldSel.clear();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold text-text-hi">Log</h1>
        <div className="text-xs text-text-lo">
          {shown} {shown === 1 ? "entry" : "entries"} · <Mono>{fmtHm(shownMinutes)}</Mono>
          {openCount > 0 && <> · {openCount} open</>}
        </div>
      </div>

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
      </div>

      <section data-hours-grid data-hours-holding>
        <div className="flex items-center gap-3 px-2 pb-1 border-b border-hairline mb-1">
          <span className="text-sm font-semibold text-text-hi">New entries</span>
          <span className="text-xs text-text-lo">
            {staged.length === 0 ? (
              "type into the blank row"
            ) : (
              <>
                {staged.length} waiting · <Mono>{fmtHm(staged.reduce((s, e) => s + (e.minutes ?? 0), 0))}</Mono> · not counted until merged
                {heldSel.count > 0 && <> · {heldSel.count} ticked</>}
              </>
            )}
          </span>
          {heldSel.count > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto" disabled={merging} onClick={heldSel.clear}>
              Clear
            </Button>
          )}
          {heldSel.count > 0 && (
            <Button
              size="sm"
              variant="danger"
              disabled={merging}
              onClick={async () => {
                if (!window.confirm(`Delete ${heldSel.count} selected ${heldSel.count === 1 ? "entry" : "entries"}?`)) return;
                setMerging(true);
                await removeMany(heldSel.ids);
                setMerging(false);
                heldSel.clear();
              }}
            >
              Delete selected
            </Button>
          )}
          <Button size="sm" variant="primary" className={heldSel.count > 0 ? "" : "ml-auto"} disabled={staged.length === 0} loading={merging} onClick={() => void doMerge(heldSel.count > 0 ? heldSel.ids : undefined)}>
            {heldSel.count > 0 ? `MERGE ${heldSel.count} selected` : "MERGE"}
          </Button>
        </div>
        <EntryHeader showEstimate select={staged.length > 0 ? headerSelect(heldSel) : undefined} />
        <NewEntryRow defaultDate={defaultEntryDate(bundle.entries, today)} catchAll={catchAll} showEstimate selectable={staged.length > 0} />
        {staged.map((e) => (
          <EntryRow key={e.id} entry={e} baseUrl={baseUrl} showEstimate select={rowSelect(heldSel, e.id)} />
        ))}
        <div className="px-2 pt-1 text-[11px] text-text-lo">
          Enter or leaving the row saves it here. Merge adds dated entries to their day below and dateless ones to the Backlog. Tick rows to merge or delete only those.
        </div>
      </section>

      <div className="flex items-baseline justify-between gap-3 text-xs text-text-lo">
        <span>
          {monday && sunday ? <>Week of {dateLabel(monday, true)} to {dateLabel(sunday)} · </> : null}
          Click any cell to edit. Enter saves and moves down, Tab moves across, Esc puts it back. Headers sort; the funnel filters. Tick rows to delete several at once.
          {shownOpen > 0 && (
            <>
              {" "}
              Rows marked <BacklogTag /> are open work with a date: also on the Backlog page.
            </>
          )}
        </span>
        <button type="button" onClick={() => setSortAsc((v) => !v)} className="text-xs text-text-mid hover:text-text-hi whitespace-nowrap">
          {sortAsc ? "Oldest first ↑" : "Newest first ↓"}
        </button>
      </div>

      <div className="flex flex-col gap-4" data-hours-grid data-hours-record>
        <SelectionBar selection={recordSel} onDelete={removeMany} />
        <EntryHeader table={table} select={headerSelect(recordSel)} />
        {groups.length === 0 ? (
          <div className="rounded-v2-md border border-hairline p-6 text-center text-sm text-text-lo">Nothing here for this filter.</div>
        ) : (
          groups.map((g) => <DayGroup key={g.date} date={g.date} entries={g.entries} baseUrl={baseUrl} index={index} selection={recordSel} />)
        )}
        <FilterNote table={table} />
      </div>
    </div>
  );
}

const headerSelect = (sel: Selection) => ({ all: sel.all, some: sel.some, onChange: sel.toggleAll });
const rowSelect = (sel: Selection, id: string) => ({ checked: sel.has(id), onChange: (on: boolean) => sel.toggle(id, on) });

function DayGroup({ date, entries, baseUrl, index, selection }: { date: string; entries: HoursEntry[]; baseUrl: string; index: NonNullable<ReturnType<typeof useHoursBundle>["index"]>; selection: Selection }) {
  const d = dayTotals(index, date);
  const open = entries.filter(isOpenItem).length;
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
          {open > 0 && <span className="text-v2-info">{open} backlog · </span>}
          {d.notYetLogged > 0 && <span className="text-v2-warn">{fmtHm(d.notYetLogged)} not logged · </span>}
          <Mono>{fmtHm(d.total)}</Mono>
        </span>
      </div>
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} baseUrl={baseUrl} select={rowSelect(selection, e.id)} backlog={isBacklogItem(e)} />
      ))}
    </section>
  );
}
