"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { parseDuration } from "@/lib/hours/calc";
import { cellClass } from "./EntryRow";
import { useEntryMutations } from "./useEntryMutations";

/**
 * The blank row at the top of the Log's holding section (Phil, 2026-11-20:
 * "an empty row always at the top of that area", Excel style, no add box).
 * Type into any cell; the entry is created when focus leaves the row or on
 * Enter, as long as it has a time, a description or a ticket and the time
 * parses. It then drops into the held rows beneath and this row clears,
 * keeping the date and putting the cursor back in Time. Tab moves across
 * without saving, so a half-typed row is never split in two. Esc clears.
 * The date follows the spec default (last entry's date, else today) until
 * the person picks one. Cells carry data-col so Shift+Enter from the first
 * held row lands here.
 */
export function NewEntryRow({ defaultDate, catchAll, showEstimate = false }: { defaultDate: string; catchAll: string[]; showEstimate?: boolean }) {
  const { add } = useEntryMutations();
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [estimate, setEstimate] = useState("");
  const [description, setDescription] = useState("");
  const [ticket, setTicket] = useState("");
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  const timeRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!touched.current) setDate(defaultDate);
  }, [defaultDate]);

  const minutes = time.trim() === "" ? null : parseDuration(time);
  const est = estimate.trim() === "" ? null : parseDuration(estimate);
  const timeBad = time.trim() !== "" && minutes === null;
  const estBad = estimate.trim() !== "" && est === null;
  const hasContent = minutes !== null || description.trim() !== "" || ticket.trim() !== "";

  const clear = () => {
    setTime("");
    setEstimate("");
    setDescription("");
    setTicket("");
    setLogged(false);
  };

  const commit = async (refocus: boolean) => {
    if (busy || !hasContent || timeBad || estBad) return;
    setBusy(true);
    const ok = await add({ entry_date: date || null, minutes, estimate_minutes: est, description: description.trim(), ticket: ticket.trim(), logged });
    setBusy(false);
    if (!ok) return; // the toast says why; the row keeps what was typed
    clear();
    if (refocus) timeRef.current?.focus();
  };

  // Leaving the row (not moving between its cells) saves it, like clicking elsewhere on a sheet.
  const onRowBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && rowRef.current?.contains(e.relatedTarget as Node)) return;
    void commit(false);
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      clear();
    }
  };

  const cols = `9.5rem 4.5rem ${showEstimate ? "4.5rem " : ""}minmax(0,1fr) 10rem auto auto`;
  const mono = "font-[family-name:var(--font-mono)]";

  return (
    <div
      ref={rowRef}
      onBlur={onRowBlur}
      className={`group grid items-center gap-x-1 px-1 py-0.5 rounded-v2-md bg-glow-wash/40 focus-within:bg-surface-1 ${busy ? "opacity-60" : ""}`}
      style={{ gridTemplateColumns: `auto ${cols}` }}
      data-hours-row
      data-hours-new-row
    >
      <span className="pl-1 pr-1 w-[18px] text-center text-text-lo text-xs select-none" title="New entry">
        +
      </span>
      <input
        data-col="date"
        aria-label="Date"
        type="date"
        value={date}
        onChange={(e) => {
          touched.current = true;
          setDate(e.target.value);
        }}
        onKeyDown={onKey}
        className={cellClass(false, `${mono} text-xs`)}
      />
      <input
        ref={timeRef}
        data-col="time"
        aria-label="Time spent"
        placeholder="0:45"
        inputMode="decimal"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onKeyDown={onKey}
        autoComplete="off"
        className={cellClass(timeBad, `text-right ${mono} tabular-nums text-text-hi`)}
      />
      {showEstimate && (
        <input
          data-col="estimate"
          aria-label="Estimate"
          placeholder="est."
          inputMode="decimal"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          className={cellClass(estBad, `text-right ${mono} tabular-nums text-text-mid`)}
        />
      )}
      <input
        data-col="description"
        aria-label="Description"
        placeholder="What you did"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={onKey}
        autoComplete="off"
        className={cellClass(false, "text-text-hi")}
      />
      <span className="flex items-center min-w-0">
        <input
          data-col="ticket"
          aria-label="Ticket"
          placeholder="ABC-123 or URL"
          list={catchAll.length > 0 ? "hours-catch-all" : undefined}
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          className={cellClass(false, `${mono} text-text-hi`)}
        />
        {catchAll.length > 0 && (
          <datalist id="hours-catch-all">
            {catchAll.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        )}
      </span>
      <label className="flex items-center justify-center px-1.5 select-none" title="Ticked when this time is also in Jira">
        <input type="checkbox" data-col="logged" aria-label="Logged" checked={logged} onChange={(e) => setLogged(e.target.checked)} onKeyDown={onKey} />
      </label>
      <span className="w-6" />
    </div>
  );
}
