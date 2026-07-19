"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/types/project";

export function ProjectFilterDropdown({
  projects,
  selected,
  onChange,
}: {
  projects: Project[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
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

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function clear() {
    onChange(new Set());
  }

  const count = selected.size;
  const label =
    count === 0
      ? "ALL PROJECTS"
      : count === 1
        ? (() => {
            const only = Array.from(selected)[0];
            if (only === "__none__") return "NO PROJECT";
            return (
              projects.find((p) => p.id === only)?.name.toUpperCase() ??
              "1 PROJECT"
            );
          })()
        : `${count} PROJECTS`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1.5 rounded-md border text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors ${
          count > 0
            ? "border-accent/40 bg-accent/15 text-accent"
            : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
        }`}
      >
        ◆ {label}
      </button>
      {open && (
        <div className="absolute z-50 left-0 mt-2 w-64 max-h-80 overflow-y-auto rounded-md bg-ink-1 border border-ink-2 shadow-2xl p-2 flex flex-col gap-0.5">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Filter by project
            </span>
            {count > 0 && (
              <button
                type="button"
                onClick={clear}
                className="text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
              >
                Clear
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-ink-2/40 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has("__none__")}
              onChange={() => toggle("__none__")}
              className="accent-accent"
            />
            <span className="text-sm text-ink-3 italic">No project</span>
          </label>
          {projects.map((p) => (
            <label
              key={p.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-ink-2/40 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-accent"
              />
              {p.colour && (
                <span
                  aria-hidden
                  style={{ backgroundColor: p.colour }}
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                />
              )}
              <span className="text-sm text-text-0 truncate flex-1">
                {p.name}
              </span>
            </label>
          ))}
          {projects.length === 0 && (
            <div className="px-2 py-3 text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
              No active projects yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
