"use client";

import { useMemo, useState } from "react";
import type { Task } from "@/lib/types/task";
import { TASK_STATUS_TONE } from "@/lib/types/task";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function TaskCalendarView({
  tasks,
  onOpen,
  onCreateForDate,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onCreateForDate: (dueDate: string) => void;
}) {
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()));

  const { gridDays, byDate, noDate } = useMemo(() => {
    const byDate = new Map<string, Task[]>();
    const noDate: Task[] = [];
    for (const t of tasks) {
      if (t.parent_task_id) continue;
      if (!t.due_date) {
        noDate.push(t);
        continue;
      }
      const list = byDate.get(t.due_date) ?? [];
      list.push(t);
      byDate.set(t.due_date, list);
    }
    const first = new Date(anchor);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(
      anchor.getFullYear(),
      anchor.getMonth() + 1,
      0,
    ).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    // Leading week-padding days
    for (let i = 0; i < firstWeekday; i++) {
      const d = new Date(first);
      d.setDate(d.getDate() - (firstWeekday - i));
      cells.push({ date: d, inMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({
        date: new Date(anchor.getFullYear(), anchor.getMonth(), i),
        inMonth: true,
      });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last);
      next.setDate(last.getDate() + 1);
      cells.push({ date: next, inMonth: false });
    }
    return { gridDays: cells, byDate, noDate };
  }, [anchor, tasks]);

  const todayKey = fmtYmd(new Date());

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-[family-name:var(--font-display)] italic text-ink-4">
            {anchor.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setAnchor(
                  new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1),
                )
              }
              className="px-2 py-1 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
            >
              ← PREV
            </button>
            <button
              type="button"
              onClick={() => setAnchor(startOfMonth(new Date()))}
              className="px-2 py-1 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
            >
              TODAY
            </button>
            <button
              type="button"
              onClick={() =>
                setAnchor(
                  new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
                )
              }
              className="px-2 py-1 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
            >
              NEXT →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {gridDays.map(({ date, inMonth }, idx) => {
            const key = fmtYmd(date);
            const items = byDate.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={idx}
                onClick={() => {
                  if (items.length === 0 && inMonth) onCreateForDate(key);
                }}
                className={`min-h-[80px] rounded-md border p-1.5 flex flex-col gap-1 transition-colors ${
                  inMonth
                    ? "bg-ink-1 border-ink-2 cursor-pointer hover:bg-ink-2/40"
                    : "bg-ink-0/40 border-ink-2/40 opacity-50"
                } ${isToday ? "ring-1 ring-glow-2/60" : ""}`}
              >
                <span
                  className={`text-[10px] font-[family-name:var(--font-mono)] tabular-nums ${
                    isToday ? "text-glow-2" : "text-ink-3"
                  }`}
                >
                  {date.getDate()}
                </span>
                <div className="flex flex-col gap-0.5">
                  {items.slice(0, 4).map((t) => {
                    const tone = TASK_STATUS_TONE[t.status];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(t);
                        }}
                        title={t.title}
                        className={`text-left text-[10px] px-1.5 py-0.5 rounded-sm truncate border ${tone.bg} ${tone.fg} ${tone.border} ${
                          t.completed_at ? "line-through opacity-60" : ""
                        }`}
                      >
                        {t.title}
                      </button>
                    );
                  })}
                  {items.length > 4 && (
                    <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">
                      +{items.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="w-56 shrink-0 flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          No date ({noDate.length})
        </span>
        <ul className="flex flex-col gap-1.5 max-h-[600px] overflow-y-auto">
          {noDate.length === 0 ? (
            <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
              All tasks have a date.
            </li>
          ) : (
            noDate.map((t) => {
              const tone = TASK_STATUS_TONE[t.status];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(t)}
                    className={`w-full text-left rounded-md px-2 py-1.5 bg-ink-1 hover:bg-ink-2/40 transition-colors flex items-start gap-2 ${
                      t.completed_at ? "opacity-60" : ""
                    }`}
                    title={t.title}
                  >
                    <span
                      className={`mt-0.5 h-2 w-2 rounded-full border shrink-0 ${tone.bg} ${tone.border}`}
                      aria-hidden
                    />
                    <span
                      className={`text-xs leading-snug ${
                        t.completed_at ? "line-through text-ink-3" : "text-ink-4"
                      }`}
                    >
                      {t.title}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>
    </div>
  );
}
