"use client";

import { useMemo, useState } from "react";
import { Pill } from "@/components/tickets/ContextEditor";
import {
  DUE_WINDOW_LABEL,
  fmtShort,
  todayLondon,
  weekendsFrom,
  whenLabel,
  type DueWindow,
  type WhenSubject,
} from "@/lib/tickets/when";

/**
 * The When picker (tickets spec §18 R4). Every choice sends a `due_window`
 * and the server derives the dates in London; only a weekend and a picked
 * date carry a date of their own. `onChange(null)` clears the window.
 */
export type WhenBody = { due_window: DueWindow | null; scheduled_on?: string | null; deadline_on?: string | null };

const QUICK: ReadonlyArray<Exclude<DueWindow, "weekend" | "date">> = ["week", "month", "month_end", "someday"];

export function WhenPicker({
  value,
  onChange,
  compact = false,
  disabled = false,
}: {
  value: WhenSubject;
  onChange: (body: WhenBody) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const today = todayLondon();
  const weekends = useMemo(() => weekendsFrom(today, 8), [today]);
  const current = (value.due_window ?? null) as DueWindow | null;
  const [pickingWeekend, setPickingWeekend] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const label = whenLabel(value, today);

  const choose = (body: WhenBody) => {
    setPickingWeekend(false);
    setPickingDate(false);
    onChange(body);
  };

  return (
    <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-2"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((w) => (
          <Pill key={w} active={current === w} onClick={() => !disabled && choose({ due_window: w })} title={DUE_WINDOW_LABEL[w]}>
            {DUE_WINDOW_LABEL[w]}
          </Pill>
        ))}
        <Pill
          active={current === "weekend"}
          onClick={() => {
            if (disabled) return;
            setPickingWeekend((v) => !v);
            setPickingDate(false);
          }}
          title="Pick a specific weekend — Saturday scheduled, Sunday the deadline"
        >
          {DUE_WINDOW_LABEL.weekend}
        </Pill>
        <Pill
          active={current === "date"}
          onClick={() => {
            if (disabled) return;
            setPickingDate((v) => !v);
            setPickingWeekend(false);
          }}
          title="A deadline on a date you choose"
        >
          {DUE_WINDOW_LABEL.date}
        </Pill>
        {(current || value.deadline_on || value.someday) && (
          <button type="button" onClick={() => !disabled && choose({ due_window: null })} className="text-[11px] text-ink-3 hover:text-ink-4" title="No deadline">
            clear
          </button>
        )}
      </div>

      {pickingWeekend && (
        <select
          autoFocus
          className="w-fit rounded-sm bg-ink-2 px-2 py-1 text-[12px] text-text-0"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) choose({ due_window: "weekend", scheduled_on: e.target.value });
          }}
        >
          <option value="">Which weekend?</option>
          {weekends.map((w) => (
            <option key={w.saturday} value={w.saturday}>
              {w.label} · {fmtShort(w.saturday)}–{fmtShort(w.sunday)}
            </option>
          ))}
        </select>
      )}

      {pickingDate && (
        <input
          autoFocus
          type="date"
          min={today}
          className="w-fit rounded-sm bg-ink-2 px-2 py-1 text-[12px] text-text-0"
          defaultValue={value.deadline_on ?? ""}
          onChange={(e) => {
            if (e.target.value) choose({ due_window: "date", deadline_on: e.target.value });
          }}
        />
      )}

      {!compact && label && (
        <span className={`text-[11px] ${label.kind === "overdue" ? "text-danger" : "text-ink-3"}`}>
          {label.kind === "overdue"
            ? `Overdue by ${label.days} day${label.days === 1 ? "" : "s"}`
            : label.kind === "someday"
              ? "Parked — no date"
              : `${label.text} · deadline ${fmtShort(label.date)}${value.scheduled_on ? ` · scheduled ${fmtShort(value.scheduled_on)}` : ""}`}
        </span>
      )}
    </div>
  );
}
