"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { entryState, fmtHm, parseDuration } from "@/lib/hours/calc";
import type { HoursEntry } from "@/lib/hours/types";
import { parseTicket } from "@/lib/hours/ticket";
import { StateDot } from "./kit";
import { entryColumns, FilterInput, FunnelButton, GridHead, type TableState } from "./table";
import { useEntryMutations } from "./useEntryMutations";

/**
 * One Log row edited like a spreadsheet (Phil, 2026-11-20): every cell is an
 * input that reads as text until it has focus. A change saves when the cell
 * loses focus or on Enter; Enter and Shift+Enter move down and up the same
 * column (Excel's habit), Tab moves across, Esc puts the cell back. The
 * Logged tick saves at once. The row's ticket opens in a new tab from the
 * small link beside the cell (D3). Spec §7: Date, Time Spent, Description,
 * Ticket, Logged — no visible id or status column. `showEstimate` adds the
 * Estimate cell (Backlog); `showDate` is on wherever rows are not grouped by day.
 */
export function EntryRow({ entry, baseUrl, showDate = true, showEstimate = false }: { entry: HoursEntry; baseUrl: string; showDate?: boolean; showEstimate?: boolean }) {
  const { patch, remove } = useEntryMutations();
  const state = entryState(entry);
  const pending = entry.id.startsWith("tmp-");
  const ticket = parseTicket(entry.ticket_raw, baseUrl);

  const del = async () => {
    if (!window.confirm(`Delete "${entry.description || entry.ticket_raw || "this entry"}"?`)) return;
    await remove(entry.id);
  };

  const cols = `${showDate ? "9.5rem_" : ""}4.5rem_${showEstimate ? "4.5rem_" : ""}minmax(0,1fr)_10rem_auto_auto`;

  return (
    <div
      className={`group grid items-center gap-x-1 px-1 py-0.5 rounded-v2-md hover:bg-surface-1 focus-within:bg-surface-1 ${pending ? "opacity-60 pointer-events-none" : ""}`}
      style={{ gridTemplateColumns: `auto ${cols.replace(/_/g, " ")}` }}
      data-hours-row
    >
      <span className="pl-1 pr-1">
        <StateDot state={state} />
      </span>
      {showDate && (
        <Cell
          col="date"
          type="date"
          value={entry.entry_date ?? ""}
          display={entry.entry_date ?? ""}
          placeholder="no date"
          onCommit={(v) => patch(entry.id, { entry_date: v || null })}
          className="font-[family-name:var(--font-mono)] text-xs"
        />
      )}
      <Cell
        col="time"
        value={entry.minutes === null ? "" : fmtHm(entry.minutes)}
        display={entry.minutes === null ? "" : fmtHm(entry.minutes)}
        placeholder="open"
        inputMode="decimal"
        validate={(v) => v.trim() === "" || parseDuration(v) !== null}
        onCommit={(v) => patch(entry.id, { minutes: v.trim() === "" ? null : parseDuration(v) })}
        className={`text-right font-[family-name:var(--font-mono)] tabular-nums ${entry.minutes === null ? "text-text-lo" : "text-text-hi"}`}
      />
      {showEstimate && (
        <Cell
          col="estimate"
          value={entry.estimate_minutes === null ? "" : fmtHm(entry.estimate_minutes)}
          display={entry.estimate_minutes === null ? "" : `~${fmtHm(entry.estimate_minutes)}`}
          placeholder="est."
          inputMode="decimal"
          validate={(v) => v.trim() === "" || parseDuration(v) !== null}
          onCommit={(v) => patch(entry.id, { estimate_minutes: v.trim() === "" ? null : parseDuration(v) })}
          className="text-right font-[family-name:var(--font-mono)] tabular-nums text-text-mid"
        />
      )}
      <Cell
        col="description"
        value={entry.description}
        display={entry.description}
        placeholder="description"
        onCommit={(v) => patch(entry.id, { description: v.trim() })}
        className={`${entry.description ? "text-text-hi" : "placeholder:text-v2-error/70"}`}
      />
      <span className="flex items-center min-w-0">
        <Cell
          col="ticket"
          value={entry.ticket_raw}
          display={ticket.isPlainLink ? "link" : (ticket.key ?? entry.ticket_raw)}
          title={entry.ticket_raw}
          placeholder="ticket"
          onCommit={(v) => patch(entry.id, { ticket: v.trim() })}
          className={`font-[family-name:var(--font-mono)] ${entry.ticket_raw ? "text-text-hi" : "placeholder:text-v2-error/70"}`}
        />
        {ticket.url && (
          <a href={ticket.url} target="_blank" rel="noreferrer noopener" tabIndex={-1} className="shrink-0 px-1 text-xs text-glow hover:underline" title={`Open ${ticket.key ?? "link"}`}>
            ↗
          </a>
        )}
      </span>
      <label className="flex items-center justify-center px-1.5 select-none" title="Ticked when this time is also in Jira">
        <input type="checkbox" data-col="logged" checked={entry.logged} onChange={(e) => void patch(entry.id, { logged: e.target.checked })} onKeyDown={moveOnEnter} />
      </label>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => void del()}
        className="w-6 text-center text-text-lo opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-v2-error text-sm leading-none"
        title="Delete"
        aria-label="Delete entry"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Column header that lines up with EntryRow's grid. With a `table` (from
 * useTable) the labels sort on click and the funnel at the end opens a row
 * of per-column filter inputs; without one it is a plain header.
 */
export function EntryHeader({ showDate = true, showEstimate = false, table }: { showDate?: boolean; showEstimate?: boolean; table?: TableState<HoursEntry> }) {
  const cols = `${showDate ? "9.5rem_" : ""}4.5rem_${showEstimate ? "4.5rem_" : ""}minmax(0,1fr)_10rem_auto_auto`;
  const grid = { gridTemplateColumns: `auto ${cols.replace(/_/g, " ")}` };
  const h = "px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-lo";
  if (!table) {
    return (
      <div className="hidden sm:grid items-center gap-x-1 px-1 pb-1 border-b border-hairline mb-1" style={grid}>
        <span className="w-[18px]" />
        {showDate && <span className={h}>Date</span>}
        <span className={`${h} text-right`}>Time</span>
        {showEstimate && <span className={`${h} text-right`}>Est.</span>}
        <span className={h}>Description</span>
        <span className={h}>Ticket</span>
        <span className={h}>Logged</span>
        <span className="w-6" />
      </div>
    );
  }
  const columns = entryColumns(showDate, showEstimate);
  return (
    <div className="hidden sm:block border-b border-hairline mb-1">
      <div className="grid items-center gap-x-1 px-1 pb-1" style={grid}>
        <span className="w-[18px]" />
        {columns.map((c) => (
          <GridHead key={c.key} col={c} table={table} className={c.key === "logged" ? "text-center" : ""} />
        ))}
        <FunnelButton table={table} />
      </div>
      {table.showFilters && (
        <div className="grid items-center gap-x-1 px-1 pb-1" style={grid}>
          <span className="w-[18px]" />
          {columns.map((c) => (
            <span key={c.key} className="px-0.5">
              <FilterInput col={c} table={table} />
            </span>
          ))}
          <button type="button" onClick={table.clearFilters} className="w-6 text-[10px] text-text-lo hover:text-text-hi" title="Clear all filters" aria-label="Clear all filters">
            {table.active > 0 ? "✕" : ""}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Cells and keyboard movement
// ---------------------------------------------------------------------

/** The look of a spreadsheet cell: plain text until hovered or focused; red border when refused. Shared with NewEntryRow. */
export function cellClass(bad: boolean, extra = ""): string {
  return `w-full min-w-0 rounded-sm border bg-transparent px-1.5 py-1 text-sm truncate outline-none transition-colors ${
    bad ? "border-v2-error" : "border-transparent hover:border-hairline focus:border-glow-dim focus:bg-surface-0"
  } ${extra}`;
}

/** Enter → same column in the next row; Shift+Enter → previous row. Works across day groups inside one [data-hours-grid]. */
function moveToRow(el: HTMLElement, dir: 1 | -1) {
  const col = el.getAttribute("data-col");
  const grid = el.closest("[data-hours-grid]");
  if (!col || !grid) return false;
  const all = Array.from(grid.querySelectorAll<HTMLElement>(`[data-col="${col}"]`));
  const i = all.indexOf(el);
  const next = all[i + dir];
  if (!next) return false;
  next.focus();
  if (next instanceof HTMLInputElement && next.type === "text") next.select();
  return true;
}

function moveOnEnter(e: KeyboardEvent<HTMLElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    moveToRow(e.currentTarget, e.shiftKey ? -1 : 1);
  }
}

type CellProps = {
  col: string;
  value: string;
  display: string;
  placeholder?: string;
  type?: "text" | "date";
  inputMode?: "text" | "decimal";
  title?: string;
  className?: string;
  validate?: (v: string) => boolean;
  onCommit: (v: string) => Promise<unknown>;
};

/**
 * A spreadsheet cell: an input that looks like text until focused. Local
 * draft while editing; commits on blur and on Enter (then moves down),
 * reverts on Esc. A value the validator refuses stays red and is not saved.
 */
function Cell({ col, value, display, placeholder, type = "text", inputMode, title, className = "", validate, onCommit }: CellProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const shown = draft ?? (focused ? value : display);
  // The draft only lives while a cell is being edited, or when it was refused (red) so the person can fix it.
  const bad = draft !== null && validate ? !validate(draft) : false;

  const commit = async () => {
    if (draft === null) return true;
    if (bad) return false;
    if (draft !== value) await onCommit(draft);
    setDraft(null);
    return true;
  };

  const onKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(null);
      e.currentTarget.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = e.currentTarget;
      if (await commit()) moveToRow(target, e.shiftKey ? -1 : 1);
    }
  };

  return (
    <input
      ref={ref}
      data-col={col}
      type={type}
      inputMode={inputMode}
      value={shown}
      title={title}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        if (type === "text") e.target.select();
      }}
      onBlur={() => {
        setFocused(false);
        void commit();
      }}
      onKeyDown={(e) => void onKey(e)}
      autoComplete="off"
      className={cellClass(bad, className)}
    />
  );
}
