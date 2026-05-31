"use client";

import { useEffect, useRef, useState } from "react";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  TASK_STATUS_TONE,
  type TaskStatus,
} from "@/lib/types/task";

/**
 * Status pill that, on click, opens a 10-option dropdown to change status
 * inline. Stops click propagation so it can live inside a parent that
 * also has a click handler (e.g. a list row that opens the detail pane).
 */
export function StatusDropdown({
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tone = TASK_STATUS_TONE[value];
  const sizeCls =
    size === "sm"
      ? "text-[9px] tracking-[0.12em] px-1.5 py-0.5"
      : "text-[10px] tracking-[0.15em] px-2 py-0.5";

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel ?? `Status: ${TASK_STATUS_LABEL[value]}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`uppercase font-[family-name:var(--font-mono)] rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-2/60 ${sizeCls} ${tone.fg} ${tone.bg} ${tone.border}`}
      >
        {TASK_STATUS_LABEL[value]}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 left-0 top-full mt-1 min-w-[180px] rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-1 flex flex-col gap-0.5"
        >
          {TASK_STATUSES.map((s) => {
            const t = TASK_STATUS_TONE[s];
            const isActive = s === value;
            return (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (s !== value) onChange(s);
                }}
                className={`text-left text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-2 py-1.5 rounded-sm flex items-center gap-2 hover:bg-ink-2/60 transition-colors ${
                  isActive ? "ring-1 ring-glow-2/40" : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-2 w-2 rounded-full border ${t.bg} ${t.border}`}
                />
                <span className={t.fg}>{TASK_STATUS_LABEL[s]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
