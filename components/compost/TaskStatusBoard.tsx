"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskStatus } from "@/lib/types/task";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "@/lib/types/task";
import { TaskCard } from "./TaskCard";
import { Mono } from "@/components/dashboard/Mono";

const COLLAPSED_BY_DEFAULT: TaskStatus[] = ["completed", "cancelled"];

/** Cards whose status hasn't changed in >3 days display a "stuck Nd"
 *  badge. We approximate "status hasn't changed" with updated_at —
 *  a status patch always touches updated_at, so this is a sufficient
 *  proxy without adding a separate status_changed_at column. */
function stuckDays(t: Task): number | null {
  if (t.status === "completed" || t.status === "cancelled") return null;
  const updated = new Date(t.updated_at).getTime();
  const days = (Date.now() - updated) / 86_400_000;
  return days > 3 ? Math.floor(days) : null;
}

function statusOf(task: Task): TaskStatus {
  return task.status ?? "new";
}

function findColumn(cols: Record<TaskStatus, Task[]>, id: string): TaskStatus | null {
  if (id.startsWith("status-")) {
    const s = id.slice("status-".length) as TaskStatus;
    return TASK_STATUSES.includes(s) ? s : null;
  }
  for (const s of TASK_STATUSES) {
    if (cols[s].some((t) => t.id === id)) return s;
  }
  return null;
}

function SortableStatusCard({
  task,
  onClick,
  onStatusChange,
}: {
  task: Task;
  onClick: (t: Task) => void;
  onStatusChange: (next: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const stuck = stuckDays(task);
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className="relative">
        {task.project_colour && (
          <span
            aria-hidden
            style={{ backgroundColor: task.project_colour }}
            className="absolute left-0 top-2 bottom-2 w-1 rounded-l-md"
          />
        )}
        <TaskCard
          task={task}
          onClick={() => onClick(task)}
          compact
          onStatusChange={onStatusChange}
        />
        {stuck !== null && (
          <span
            className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-md border border-warn/40 bg-warn/15 text-warn font-[family-name:var(--font-mono)]"
            title={`No status change for ${stuck} days`}
          >
            stuck {stuck}d
          </span>
        )}
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  collapsed,
  onToggleCollapsed,
  onCardClick,
  onMoveStatus,
}: {
  status: TaskStatus;
  tasks: Task[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCardClick: (t: Task) => void;
  onMoveStatus: (id: string, status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `status-${status}` });
  const ids = tasks.map((t) => t.id);
  const collapsible =
    status === "completed" || status === "cancelled";

  return (
    <div className="flex flex-col gap-2 min-w-[240px] flex-shrink-0">
      <button
        type="button"
        onClick={collapsible ? onToggleCollapsed : undefined}
        className={`flex items-center justify-between px-2 py-1 rounded-sm text-left ${
          collapsible ? "hover:bg-ink-2/40 cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="card-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {TASK_STATUS_LABEL[status]}
        </span>
        <Mono className="text-[10px] text-ink-3">
          {tasks.length}
          {collapsible && (collapsed ? " ▶" : " ▼")}
        </Mono>
      </button>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[80px] rounded-md p-1.5 transition-colors ${
          isOver
            ? "bg-glow-3/40 ring-1 ring-glow-2/50"
            : "bg-ink-0/30 border border-dashed border-ink-2/60"
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {collapsed ? (
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-center py-3">
              {tasks.length} hidden
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tasks.map((t) => (
                <SortableStatusCard
                  key={t.id}
                  task={t}
                  onClick={onCardClick}
                  onStatusChange={(s) => onMoveStatus(t.id, s)}
                />
              ))}
              {tasks.length === 0 && (
                <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-center py-4">
                  drop here
                </div>
              )}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function TaskStatusBoard({
  tasks,
  onCardClick,
  onMoveStatus,
}: {
  tasks: Task[];
  onCardClick: (t: Task) => void;
  onMoveStatus: (id: string, status: TaskStatus) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const grouped = useMemo<Record<TaskStatus, Task[]>>(() => {
    const cols = Object.fromEntries(
      TASK_STATUSES.map((s) => [s, [] as Task[]])
    ) as Record<TaskStatus, Task[]>;
    for (const t of tasks) cols[statusOf(t)].push(t);
    for (const s of TASK_STATUSES) {
      cols[s].sort(
        (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)
      );
    }
    return cols;
  }, [tasks]);

  const [override, setOverride] = useState<Record<TaskStatus, Task[]> | null>(
    null
  );
  const columns = override ?? grouped;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(
    () => new Set(COLLAPSED_BY_DEFAULT)
  );

  function toggleCollapsed(s: TaskStatus) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
    setOverride(grouped);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) {
      setOverride(null);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    const source = override ?? grouped;
    const activeCol = findColumn(source, activeId);
    const overCol = findColumn(source, overId);
    setOverride(null);
    if (!activeCol || !overCol || activeCol === overCol) return;
    onMoveStatus(activeId, overCol);
  }

  const draggingTask =
    draggingId !== null ? tasks.find((t) => t.id === draggingId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDraggingId(null);
        setOverride(null);
      }}
    >
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {TASK_STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={columns[s]}
            collapsed={collapsed.has(s)}
            onToggleCollapsed={() => toggleCollapsed(s)}
            onCardClick={onCardClick}
            onMoveStatus={onMoveStatus}
          />
        ))}
      </div>
      <DragOverlay>
        {draggingTask ? <TaskCard task={draggingTask} dragging compact /> : null}
      </DragOverlay>
    </DndContext>
  );
}
