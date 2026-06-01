"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/types/task";
import { TASK_STATUS_TONE } from "@/lib/types/task";

const NO_DATE_DROP_ID = "__no_date__";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function parseYmd(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

type DragState = {
  /** All ids being dragged (1 for single, N for multi-select). */
  ids: string[];
  /** The task the pointer started on — used for the DragOverlay preview. */
  primary: Task;
};

export function TaskCalendarView({
  tasks,
  onOpen,
  onCreateForDate,
  onPatchDueDate,
  onBulkPatchDueDate,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onCreateForDate: (dueDate: string) => void;
  onPatchDueDate?: (taskId: string, dueDate: string | null) => void;
  onBulkPatchDueDate?: (ids: string[], dueDate: string | null) => void;
}) {
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);

  // Pointer = mouse/trackpad; Touch = long-press on mobile so taps still
  // work for "open task". Activation distance keeps short taps from
  // accidentally triggering a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    }),
  );

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

  // NO DATE list ordering — used for shift-click range selection.
  const noDateIds = useMemo(() => noDate.map((t) => t.id), [noDate]);

  // Track the most recent "anchor" id for range selection. The anchor
  // stays in state across month changes — but at use-time we check that
  // it's still in the visible NO DATE list before treating it as a
  // valid range start, so navigating away then back doesn't span stale
  // selections.
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);

  function toggleSelect(id: string, e: React.MouseEvent) {
    const validAnchor =
      rangeAnchor && noDateIds.includes(rangeAnchor) ? rangeAnchor : null;
    if (e.shiftKey && validAnchor) {
      const a = noDateIds.indexOf(validAnchor);
      const b = noDateIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelected((cur) => {
          const next = new Set(cur);
          for (let i = from; i <= to; i++) next.add(noDateIds[i]);
          return next;
        });
        return;
      }
    }
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setRangeAnchor(id);
  }

  function clearSelection() {
    setSelected(new Set());
    setRangeAnchor(null);
  }

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const primary = tasks.find((t) => t.id === id);
    if (!primary) return;
    const ids = selected.has(id) ? Array.from(selected) : [id];
    setDrag({ ids, primary });
  }

  function handleDragEnd(e: DragEndEvent) {
    const cur = drag;
    setDrag(null);
    if (!e.over) return;
    const overId = String(e.over.id);
    const ids = cur?.ids ?? [String(e.active.id)];

    let nextDate: string | null = null;
    if (overId === NO_DATE_DROP_ID) {
      nextDate = null;
    } else if (overId.startsWith("day-")) {
      nextDate = overId.slice("day-".length);
    } else {
      return;
    }

    // Skip the patch when every dragged task is already on the target day.
    const allOnTarget = ids.every((id) => {
      const t = tasks.find((x) => x.id === id);
      return t && (t.due_date ?? null) === nextDate;
    });
    if (allOnTarget) {
      if (ids.length > 1) clearSelection();
      return;
    }

    if (ids.length > 1) {
      onBulkPatchDueDate?.(ids, nextDate);
      clearSelection();
    } else {
      onPatchDueDate?.(ids[0], nextDate);
    }

    // If the drop landed on a day cell outside the visible month,
    // navigate to that month so the user can see where the task went.
    if (nextDate) {
      const target = parseYmd(nextDate);
      const sameMonth =
        target.getFullYear() === anchor.getFullYear() &&
        target.getMonth() === anchor.getMonth();
      if (!sameMonth) setAnchor(startOfMonth(target));
    }
  }

  const todayKey = fmtYmd(new Date());

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      {/* Stack the no-date column under the grid below xl. The
       *  calendar lives inside the split-pane's 55% column when a
       *  task is open; at common viewport widths the side-by-side
       *  layout starved both columns. */}
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-[family-name:var(--font-display)] italic text-ink-4">
              {anchor.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2 py-1 rounded-md border border-accent/40 bg-accent/15 text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/25 transition-colors"
                >
                  ✕ CLEAR {selected.size}
                </button>
              )}
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
                <DayCell
                  key={idx}
                  dateKey={key}
                  inMonth={inMonth}
                  isToday={isToday}
                  dayNum={date.getDate()}
                  items={items}
                  onCreate={() => inMonth && onCreateForDate(key)}
                  onOpen={onOpen}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                />
              );
            })}
          </div>
        </div>

        <NoDateSidebar
          noDate={noDate}
          onOpen={onOpen}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      </div>

      <DragOverlay>
        {drag ? (
          <DragPreview
            primary={drag.primary}
            count={drag.ids.length}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DayCell({
  dateKey,
  inMonth,
  isToday,
  dayNum,
  items,
  onCreate,
  onOpen,
  selected,
  onToggleSelect,
}: {
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  dayNum: number;
  items: Task[];
  onCreate: () => void;
  onOpen: (t: Task) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dateKey}` });
  return (
    <div
      ref={setNodeRef}
      onClick={() => {
        if (items.length === 0 && inMonth) onCreate();
      }}
      className={`min-h-[80px] rounded-md border p-1.5 flex flex-col gap-1 transition-colors ${
        inMonth
          ? "bg-ink-1 border-ink-2 cursor-pointer hover:bg-ink-2/40"
          : "bg-ink-0/40 border-ink-2/40 opacity-50"
      } ${isToday ? "ring-1 ring-glow-2/60" : ""} ${
        isOver ? "ring-2 ring-glow-2 bg-glow-2/10" : ""
      }`}
    >
      <span
        className={`text-[10px] font-[family-name:var(--font-mono)] tabular-nums ${
          isToday ? "text-glow-2" : "text-ink-3"
        }`}
      >
        {dayNum}
      </span>
      <div className="flex flex-col gap-0.5">
        {items.slice(0, 4).map((t) => (
          <DraggablePill
            key={t.id}
            task={t}
            onOpen={() => onOpen(t)}
            isSelected={selected.has(t.id)}
            onToggleSelect={(e) => onToggleSelect(t.id, e)}
            variant="day"
          />
        ))}
        {items.length > 4 && (
          <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)]">
            +{items.length - 4} more
          </span>
        )}
      </div>
    </div>
  );
}

function NoDateSidebar({
  noDate,
  onOpen,
  selected,
  onToggleSelect,
}: {
  noDate: Task[];
  onOpen: (t: Task) => void;
  selected: Set<string>;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE_DROP_ID });
  return (
    <aside
      ref={setNodeRef}
      className={`w-full xl:w-56 xl:shrink-0 flex flex-col gap-2 rounded-md p-2 transition-colors ${
        isOver
          ? "bg-glow-2/10 ring-2 ring-glow-2"
          : "bg-transparent"
      }`}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        No date ({noDate.length})
      </span>
      <ul className="flex flex-col gap-1.5 max-h-[600px] overflow-y-auto">
        {noDate.length === 0 ? (
          <li className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
            All tasks have a date.
          </li>
        ) : (
          noDate.map((t) => (
            <li key={t.id}>
              <DraggablePill
                task={t}
                onOpen={() => onOpen(t)}
                isSelected={selected.has(t.id)}
                onToggleSelect={(e) => onToggleSelect(t.id, e)}
                variant="sidebar"
              />
            </li>
          ))
        )}
      </ul>
      <p className="text-[9px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        ⇧ click to range · ⌘/ctrl click to toggle
      </p>
    </aside>
  );
}

function DraggablePill({
  task,
  onOpen,
  isSelected,
  onToggleSelect,
  variant,
}: {
  task: Task;
  onOpen: () => void;
  isSelected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
  variant: "day" | "sidebar";
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const tone = TASK_STATUS_TONE[task.status];
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  // Modifier-click selects; bare click opens the task. This matches the
  // spec — selection requires intent (⇧ / ⌘ / ctrl) so a normal tap
  // still routes through to the detail pane.
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onToggleSelect(e);
      return;
    }
    if (isSelected) {
      // A bare click on an already-selected pill: deselect rather than
      // opening, so the user can recover from a misclick.
      onToggleSelect(e);
      return;
    }
    onOpen();
  }

  if (variant === "day") {
    return (
      <button
        ref={setNodeRef}
        type="button"
        style={style}
        {...attributes}
        {...listeners}
        onClick={handleClick}
        title={task.title}
        className={`relative text-left text-[10px] px-1.5 py-0.5 rounded-sm truncate border ${tone.bg} ${tone.fg} ${tone.border} ${
          task.completed_at ? "line-through opacity-60" : ""
        } ${isSelected ? "ring-2 ring-accent" : ""} cursor-grab active:cursor-grabbing`}
      >
        {isSelected && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent text-ink-0 text-[8px] flex items-center justify-center"
          >
            ✓
          </span>
        )}
        {task.title}
      </button>
    );
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      title={task.title}
      className={`relative w-full text-left rounded-md px-2 py-1.5 bg-ink-1 hover:bg-ink-2/40 transition-colors flex items-start gap-2 ${
        task.completed_at ? "opacity-60" : ""
      } ${isSelected ? "ring-2 ring-accent bg-accent/5" : ""} cursor-grab active:cursor-grabbing`}
    >
      {isSelected && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent text-ink-0 text-[8px] flex items-center justify-center"
        >
          ✓
        </span>
      )}
      <span
        className={`mt-0.5 h-2 w-2 rounded-full border shrink-0 ${tone.bg} ${tone.border}`}
        aria-hidden
      />
      <span
        className={`text-xs leading-snug ${
          task.completed_at ? "line-through text-ink-3" : "text-ink-4"
        }`}
      >
        {task.title}
      </span>
    </button>
  );
}

function DragPreview({ primary, count }: { primary: Task; count: number }) {
  const tone = TASK_STATUS_TONE[primary.status];
  if (count > 1) {
    return (
      <div className="px-2 py-1.5 rounded-md bg-accent/20 border-2 border-accent text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] shadow-2xl">
        {count} tasks
      </div>
    );
  }
  return (
    <div
      className={`text-left text-[10px] px-1.5 py-0.5 rounded-sm truncate border max-w-[200px] shadow-2xl ${tone.bg} ${tone.fg} ${tone.border}`}
    >
      {primary.title}
    </div>
  );
}
