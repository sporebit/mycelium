"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { fmtHm } from "@/lib/hours/calc";
import { activeFilterCount, applyTable, nextSort, type ColumnDef, type Filters, type SortState } from "@/lib/hours/table";
import type { HoursEntry } from "@/lib/hours/types";
import { parseTicket } from "@/lib/hours/ticket";

/**
 * Sort and per-column filter for the hours tables (Phil, 2026-11-20). One
 * hook holds the state; the small header pieces below render it, in a
 * `<table>` (Th, FilterRow, FunnelTh) or in the Log's CSS grid (GridHead,
 * GridFilter, FunnelButton). Click a header to sort (natural order, then
 * flipped, then off); the funnel at the row's end shows an input under every
 * column; the grammar is in lib/hours/table.ts.
 */
export type TableState<R> = {
  rows: R[];
  total: number;
  hidden: number;
  sort: SortState;
  toggleSort: (col: ColumnDef<R>) => void;
  filters: Filters;
  setFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  active: number;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
};

export function useTable<R>(rows: R[], columns: ColumnDef<R>[], initial: SortState = null): TableState<R> {
  const [sort, setSort] = useState<SortState>(initial);
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const out = useMemo(() => applyTable(rows, columns, sort, filters), [rows, columns, sort, filters]);
  const toggleSort = useCallback((col: ColumnDef<R>) => setSort((s) => nextSort(s, col)), []);
  const setFilter = useCallback((key: string, value: string) => setFilters((f) => ({ ...f, [key]: value })), []);
  const clearFilters = useCallback(() => setFilters({}), []);
  const active = activeFilterCount(columns, filters);
  return { rows: out, total: rows.length, hidden: rows.length - out.length, sort, toggleSort, filters, setFilter, clearFilters, active, showFilters: showFilters || active > 0, setShowFilters };
}

export const HEAD = "px-2 py-1.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo";
const FILTER_INPUT = "w-full min-w-0 rounded-sm border border-hairline bg-surface-0 px-1.5 py-0.5 text-xs font-normal normal-case tracking-normal text-text-hi placeholder:text-text-lo/60 focus:border-glow-dim focus:outline-none";

function SortMark({ dir }: { dir: "asc" | "desc" | null }) {
  return <span className={`ml-1 inline-block w-2 text-[9px] ${dir ? "text-glow" : "text-text-lo/40 group-hover/th:text-text-lo"}`}>{dir === "asc" ? "▲" : dir === "desc" ? "▼" : "▲"}</span>;
}

function headLabel<R>(col: ColumnDef<R>, table: TableState<R>) {
  const dir = table.sort?.key === col.key ? table.sort.dir : null;
  const filtered = (table.filters[col.key] ?? "").trim() !== "";
  const align = col.align ?? (col.kind === "text" || col.kind === "date" ? "left" : "right");
  return { dir, filtered, align };
}

/** A sortable `<th>`. */
export function Th<R>({ col, table, className = "" }: { col: ColumnDef<R>; table: TableState<R>; className?: string }) {
  const { dir, filtered, align } = headLabel(col, table);
  if (col.sortable === false) {
    return <th className={`${HEAD} ${align === "left" ? "text-left" : "text-right"} ${className}`}>{col.label}</th>;
  }
  return (
    <th aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"} className={`${HEAD} ${align === "left" ? "text-left" : "text-right"} ${className} p-0`}>
      <button type="button" onClick={() => table.toggleSort(col)} className={`group/th w-full px-2 py-1.5 ${align === "left" ? "text-left" : "text-right"} hover:text-text-hi ${dir || filtered ? "text-text-hi" : ""}`} title={`Sort by ${col.label}`}>
        {filtered && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-glow align-middle" title="filtered" />}
        {col.label}
        <SortMark dir={dir} />
      </button>
    </th>
  );
}

function Funnel({ on }: { on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
    </svg>
  );
}

/** The funnel that shows or hides the filter inputs; lit while any filter is active. */
export function FunnelButton<R>({ table, className = "" }: { table: TableState<R>; className?: string }) {
  const on = table.active > 0;
  return (
    <button
      type="button"
      onClick={() => (on ? table.clearFilters() : table.setShowFilters(!table.showFilters))}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-sm ${on ? "text-glow" : "text-text-lo hover:text-text-hi"} ${className}`}
      title={on ? `${table.active} filter${table.active === 1 ? "" : "s"} on, ${table.hidden} hidden · click to clear` : table.showFilters ? "Hide filters" : "Filter columns"}
      aria-label={on ? "Clear filters" : "Filter columns"}
      aria-pressed={table.showFilters}
    >
      <Funnel on={on} />
    </button>
  );
}

/** The last `<th>` of a header row: the funnel. */
export function FunnelTh<R>({ table }: { table: TableState<R> }) {
  return (
    <th className="w-6 p-0 text-right">
      <FunnelButton table={table} />
    </th>
  );
}

/** A `<tr>` of filter inputs, one per column; renders nothing while filters are hidden. `lead` fills a leading non-column cell. */
export function FilterRow<R>({ columns, table, lead }: { columns: ColumnDef<R>[]; table: TableState<R>; lead?: ReactNode }) {
  if (!table.showFilters) return null;
  return (
    <tr className="border-b border-hairline bg-surface-1/40">
      {lead !== undefined && <th className="p-0">{lead}</th>}
      {columns.map((c) => (
        <th key={c.key} className="px-1 py-1">
          {c.filterable !== false && <FilterInput col={c} table={table} />}
        </th>
      ))}
      <th className="p-0 text-right">
        {table.active > 0 && (
          <button type="button" onClick={table.clearFilters} className="text-[10px] text-text-lo hover:text-text-hi px-1" title="Clear all filters">
            ✕
          </button>
        )}
      </th>
    </tr>
  );
}

const HINT: Record<ColumnDef<unknown>["kind"], string> = {
  text: "contains…",
  date: "contains…",
  number: "> < = …",
  duration: "> 1:00 …",
  pct: "> 50 …",
  bool: "yes / no",
};

export function FilterInput<R>({ col, table, className = "" }: { col: ColumnDef<R>; table: TableState<R>; className?: string }) {
  return (
    <input
      aria-label={`Filter ${col.label}`}
      value={table.filters[col.key] ?? ""}
      onChange={(e) => table.setFilter(col.key, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          table.setFilter(col.key, "");
        }
      }}
      placeholder={HINT[col.kind]}
      autoComplete="off"
      className={`${FILTER_INPUT} ${className}`}
    />
  );
}

/** Grid variant of Th for the Log's CSS-grid rows. */
export function GridHead<R>({ col, table, className = "" }: { col: ColumnDef<R>; table: TableState<R>; className?: string }) {
  const { dir, filtered, align } = headLabel(col, table);
  return (
    <button type="button" onClick={() => table.toggleSort(col)} className={`group/th ${HEAD} px-1.5 ${align === "left" ? "text-left" : "text-right"} hover:text-text-hi ${dir || filtered ? "text-text-hi" : ""} ${className}`} title={`Sort by ${col.label}`}>
      {filtered && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-glow align-middle" />}
      {col.label}
      <SortMark dir={dir} />
    </button>
  );
}

/** Summary line under a table: how many rows the filters hide. */
export function FilterNote<R>({ table }: { table: TableState<R> }) {
  if (table.active === 0) return null;
  return (
    <div className="px-2 pt-1 text-[11px] text-text-lo">
      {table.hidden} of {table.total} hidden by {table.active} filter{table.active === 1 ? "" : "s"} ·{" "}
      <button type="button" onClick={table.clearFilters} className="text-glow hover:underline">
        clear
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Columns of the Log and Backlog rows
// ---------------------------------------------------------------------

export const ENTRY_COLUMNS: ColumnDef<HoursEntry>[] = [
  { key: "date", label: "Date", kind: "date", get: (e) => e.entry_date },
  { key: "time", label: "Time", kind: "duration", get: (e) => e.minutes },
  { key: "estimate", label: "Est.", kind: "duration", get: (e) => e.estimate_minutes, text: (e) => (e.estimate_minutes === null ? "" : `~${fmtHm(e.estimate_minutes)}`) },
  { key: "description", label: "Description", kind: "text", get: (e) => e.description || null },
  { key: "ticket", label: "Ticket", kind: "text", get: (e) => e.ticket_raw || null, text: (e) => `${parseTicket(e.ticket_raw, "").key ?? ""} ${e.ticket_raw}` },
  { key: "logged", label: "Logged", kind: "bool", get: (e) => e.logged },
];

export function entryColumns(showDate: boolean, showEstimate: boolean): ColumnDef<HoursEntry>[] {
  return ENTRY_COLUMNS.filter((c) => (showDate || c.key !== "date") && (showEstimate || c.key !== "estimate"));
}
