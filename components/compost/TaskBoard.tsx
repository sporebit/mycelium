"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskUrgency } from "@/lib/types/task";
import {
  URGENCIES,
  URGENCY_LABEL,
  isOverdue,
  midpointScore,
} from "@/lib/types/task";
import { TaskCard } from "./TaskCard";

type Columns = Record<TaskUrgency, Task[]>;

/**
 * Display order per column: each parent immediately followed by its
 * sub-tasks (sorted by created_at). Parents sorted by priority_score desc.
 * Sub-tasks ignore their own urgency and live with their parent.
 */
function groupByUrgency(tasks: Task[]): Columns {
  const out: Columns = {
    today: [],
    this_week: [],
    this_month: [],
    someday: [],
  };
  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const subsByParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.parent_task_id) continue;
    const list = subsByParent.get(t.parent_task_id) ?? [];
    list.push(t);
    subsByParent.set(t.parent_task_id, list);
  }

  for (const u of URGENCIES) {
    const parents = topLevel
      .filter((t) => (t.urgency ?? "someday") === u)
      .sort(
        (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)
      );
    for (const parent of parents) {
      out[u].push(parent);
      const kids = (subsByParent.get(parent.id) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      out[u].push(...kids);
    }
  }
  return out;
}

function findColumnIn(cols: Columns, idOrCol: string): TaskUrgency | null {
  if (idOrCol.startsWith("column-")) {
    const u = idOrCol.slice("column-".length) as TaskUrgency;
    return URGENCIES.includes(u) ? u : null;
  }
  for (const u of URGENCIES) {
    if (cols[u].some((t) => t.id === idOrCol)) return u;
  }
  return null;
}

function SortableTaskCard({
  task,
  onClick,
  isSubTask,
  subStats,
}: {
  task: Task;
  onClick: (t: Task) => void;
  isSubTask: boolean;
  subStats: { done: number; total: number } | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isSubTask ? "pl-6 relative" : ""}
    >
      {isSubTask && (
        <span
          aria-hidden
          className="absolute left-2 top-0 bottom-0 w-px bg-ink-2"
        />
      )}
      <TaskCard
        task={task}
        onClick={() => onClick(task)}
        compact={isSubTask}
        muted={isSubTask}
        subStats={subStats}
      />
    </div>
  );
}

function Column({
  urgency,
  tasks,
  onCardClick,
  subStatsById,
}: {
  urgency: TaskUrgency;
  tasks: Task[];
  onCardClick: (t: Task) => void;
  subStatsById: Map<string, { done: number; total: number }>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${urgency}` });
  const ids = tasks.map((t) => t.id);
  const isEmpty = tasks.length === 0;
  // The column header counts top-level tasks only — sub-tasks are nested.
  const topLevelCount = tasks.filter((t) => !t.parent_task_id).length;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {/* Column header — D3 eyebrow treatment */}
      <div className="px-1 flex flex-col gap-0.5">
        <span className="card-eyebrow">
          {URGENCY_LABEL[urgency]}
        </span>
        <span className="text-[11px] font-[family-name:var(--font-mono)] tabular-nums text-text-1">
          {topLevelCount} {topLevelCount === 1 ? "task" : "tasks"}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-md p-2 transition-colors ${
          isOver
            ? "bg-glow-3/40 ring-1 ring-glow-2/50"
            : isEmpty
              ? "border border-dashed border-ink-2 bg-transparent"
              : "bg-transparent"
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((t) => (
              <SortableTaskCard
                key={t.id}
                task={t}
                onClick={onCardClick}
                isSubTask={!!t.parent_task_id}
                subStats={
                  !t.parent_task_id ? (subStatsById.get(t.id) ?? null) : null
                }
              />
            ))}
            {isEmpty && (
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] text-center py-6">
                drop tasks here
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export function TaskBoard({
  tasks,
  onCardClick,
  onMove,
}: {
  tasks: Task[];
  onCardClick: (t: Task) => void;
  onMove: (
    id: string,
    urgency: TaskUrgency,
    priorityScore: number,
    extra?: Partial<Task>
  ) => void;
}) {
  // Overdue row shows top-level tasks only — sub-task overdue inherits parent
  // visibility by being grouped under it in the column.
  const overdueTasks = useMemo(
    () =>
      tasks
        .filter((t) => isOverdue(t) && !t.parent_task_id)
        .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)),
    [tasks]
  );
  const nonOverdueTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.parent_task_id !== null || !isOverdue(t)
      ),
    [tasks]
  );

  // Per-parent stats: how many sub-tasks are done / total.
  const subStatsById = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const prev = m.get(t.parent_task_id) ?? { done: 0, total: 0 };
      prev.total += 1;
      if (t.completed_at) prev.done += 1;
      m.set(t.parent_task_id, prev);
    }
    return m;
  }, [tasks]);

  const baseColumns = useMemo(
    () => groupByUrgency(nonOverdueTasks),
    [nonOverdueTasks]
  );
  const [dragOverride, setDragOverride] = useState<Columns | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const columns = dragOverride ?? baseColumns;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
    setDragOverride(baseColumns);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setDragOverride((prev) => {
      const source = prev ?? baseColumns;
      const activeCol = findColumnIn(source, activeId);
      const overCol = findColumnIn(source, overId);
      if (!activeCol || !overCol || activeCol === overCol) return source;

      const activeTask = source[activeCol].find((t) => t.id === activeId);
      if (!activeTask) return source;

      const overTasks = source[overCol];
      let newIdx: number;
      if (overId.startsWith("column-")) {
        newIdx = overTasks.length;
      } else {
        const oi = overTasks.findIndex((t) => t.id === overId);
        newIdx = oi === -1 ? overTasks.length : oi;
      }

      return {
        ...source,
        [activeCol]: source[activeCol].filter((t) => t.id !== activeId),
        [overCol]: [
          ...overTasks.slice(0, newIdx),
          activeTask,
          ...overTasks.slice(newIdx),
        ],
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setDraggingId(null);
    if (!over) {
      setDragOverride(null);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    const draggedTask = tasks.find((t) => t.id === activeId);
    const wasSubTask = !!draggedTask?.parent_task_id;

    setDragOverride((prev) => {
      const source = prev ?? baseColumns;
      const activeCol = findColumnIn(source, activeId);
      const overCol = findColumnIn(source, overId);
      if (!activeCol || !overCol) return null;

      // Sub-task moved within its current column → ignore (no persist).
      // Sub-task moved across columns → promote to top-level.
      if (wasSubTask) {
        if (activeCol !== overCol) {
          // Promote: clear parent_task_id, adopt destination urgency.
          // Compute a midpoint score against the destination column's
          // top-level neighbours (ignore sub-tasks of other parents).
          const colTasks = source[overCol];
          const finalIdx = colTasks.findIndex((t) => t.id === activeId);
          const above =
            finalIdx > 0 ? colTasks[finalIdx - 1].priority_score : null;
          const below =
            finalIdx < colTasks.length - 1
              ? colTasks[finalIdx + 1].priority_score
              : null;
          const newScore = midpointScore(above, below);
          onMove(activeId, overCol, newScore, { parent_task_id: null });
        }
        return null;
      }

      // Top-level task: existing reorder/move logic.
      let nextCols = source;
      if (
        activeCol === overCol &&
        activeId !== overId &&
        !overId.startsWith("column-")
      ) {
        const colTasks = source[activeCol];
        const oldIdx = colTasks.findIndex((t) => t.id === activeId);
        const newIdx = colTasks.findIndex((t) => t.id === overId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          nextCols = {
            ...source,
            [activeCol]: arrayMove(colTasks, oldIdx, newIdx),
          };
        }
      }

      const finalColTasks = nextCols[overCol];
      const finalIdx = finalColTasks.findIndex((t) => t.id === activeId);
      if (finalIdx >= 0) {
        const above =
          finalIdx > 0 ? finalColTasks[finalIdx - 1].priority_score : null;
        const below =
          finalIdx < finalColTasks.length - 1
            ? finalColTasks[finalIdx + 1].priority_score
            : null;
        const newScore = midpointScore(above, below);
        onMove(activeId, overCol, newScore);
      }

      return null;
    });
  }

  const draggingTask =
    draggingId !== null ? tasks.find((t) => t.id === draggingId) ?? null : null;
  const draggingIsSub = !!draggingTask?.parent_task_id;

  return (
    <div className="flex flex-col gap-4">
      {/* OVERDUE row */}
      {overdueTasks.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-2">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
              OVERDUE{" "}
              <span className="text-ink-4">{overdueTasks.length}</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              edit in drawer
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {overdueTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onClick={() => onCardClick(t)}
                compact
                subStats={subStatsById.get(t.id) ?? null}
              />
            ))}
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setDraggingId(null);
          setDragOverride(null);
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {URGENCIES.map((u) => (
            <Column
              key={u}
              urgency={u}
              tasks={columns[u]}
              onCardClick={onCardClick}
              subStatsById={subStatsById}
            />
          ))}
        </div>
        <DragOverlay>
          {draggingTask ? (
            <TaskCard
              task={draggingTask}
              dragging
              compact={draggingIsSub}
              muted={draggingIsSub}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
