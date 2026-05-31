"use client";

import { useEffect, useRef, useState } from "react";
import type { TaskStatus, TaskUrgency } from "@/lib/types/task";
import type { Project } from "@/lib/types/project";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  URGENCIES,
  URGENCY_LABEL,
} from "@/lib/types/task";

type BulkAction =
  | { kind: "status"; value: TaskStatus }
  | { kind: "urgency"; value: TaskUrgency }
  | { kind: "project"; value: string | null }
  | { kind: "delete" };

export function TaskBulkBar({
  count,
  projects,
  onApply,
  onClear,
}: {
  count: number;
  projects: Project[];
  onApply: (action: BulkAction) => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[80] bg-ink-1 border border-ink-2 rounded-lg shadow-2xl px-4 py-2 flex items-center gap-3 text-sm growth-in">
      <span className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-4">
        {count} task{count === 1 ? "" : "s"} selected
      </span>
      <span className="text-ink-2">|</span>
      <BulkMenu
        label="Status"
        options={TASK_STATUSES.map((s) => ({
          value: s,
          label: TASK_STATUS_LABEL[s],
        }))}
        onPick={(v) => onApply({ kind: "status", value: v as TaskStatus })}
      />
      <BulkMenu
        label="Urgency"
        options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] }))}
        onPick={(v) =>
          onApply({ kind: "urgency", value: v as TaskUrgency })
        }
      />
      <BulkMenu
        label="Project"
        options={[
          { value: "__none__", label: "— None —" },
          ...projects.map((p) => ({ value: p.id, label: p.name })),
        ]}
        onPick={(v) =>
          onApply({
            kind: "project",
            value: v === "__none__" ? null : v,
          })
        }
      />
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              `Delete ${count} task${count === 1 ? "" : "s"}? This cannot be undone.`,
            )
          ) {
            onApply({ kind: "delete" });
          }
        }}
        className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] px-2 py-1 rounded-md text-danger hover:bg-danger/15 transition-colors"
      >
        Delete
      </button>
      <span className="text-ink-2">|</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 transition-colors"
      >
        ✕ Clear
      </button>
    </div>
  );
}

function BulkMenu({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] px-2 py-1 rounded-md text-ink-4 hover:bg-ink-2/60 transition-colors"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 min-w-[180px] max-h-[280px] overflow-y-auto rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-1 flex flex-col gap-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(opt.value);
              }}
              className="text-left text-[11px] font-[family-name:var(--font-mono)] tracking-[0.12em] px-2 py-1.5 rounded-sm text-ink-4 hover:bg-ink-2/60 transition-colors uppercase"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
