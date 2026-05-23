"use client";

import { useEffect, useMemo, useState } from "react";
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

function groupByUrgency(tasks: Task[]): Columns {
  const out: Columns = {
    today: [],
    this_week: [],
    this_month: [],
    someday: [],
  };
  for (const t of tasks) {
    const u = (t.urgency ?? "someday") as TaskUrgency;
    if (URGENCIES.includes(u)) out[u].push(t);
  }
  for (const u of URGENCIES) {
    out[u].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
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
}: {
  task: Task;
  onClick: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={() => onClick(task)} />
    </div>
  );
}

function Column({
  urgency,
  tasks,
  onCardClick,
}: {
  urgency: TaskUrgency;
  tasks: Task[];
  onCardClick: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${urgency}` });
  const ids = tasks.map((t) => t.id);
  const isEmpty = tasks.length === 0;

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {URGENCY_LABEL[urgency]}{" "}
          <span className="text-ink-4">{tasks.length}</span>
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-xl border p-2 transition-colors ${
          isOver
            ? "border-accent/50 bg-accent/5"
            : isEmpty
              ? "border-dashed border-ink-2 bg-ink-0/20"
              : "border-ink-2 bg-ink-0/30"
        }`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((t) => (
              <SortableTaskCard key={t.id} task={t} onClick={onCardClick} />
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
  onMove: (id: string, urgency: TaskUrgency, priorityScore: number) => void;
}) {
  const overdueTasks = useMemo(
    () =>
      tasks
        .filter((t) => isOverdue(t))
        .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)),
    [tasks]
  );
  const nonOverdueTasks = useMemo(
    () => tasks.filter((t) => !isOverdue(t)),
    [tasks]
  );

  const [columns, setColumns] = useState<Columns>(() =>
    groupByUrgency(nonOverdueTasks)
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Sync from props when not actively dragging
  useEffect(() => {
    if (draggingId) return;
    setColumns(groupByUrgency(nonOverdueTasks));
  }, [nonOverdueTasks, draggingId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setColumns((prev) => {
      const activeCol = findColumnIn(prev, activeId);
      const overCol = findColumnIn(prev, overId);
      if (!activeCol || !overCol || activeCol === overCol) return prev;

      const activeTask = prev[activeCol].find((t) => t.id === activeId);
      if (!activeTask) return prev;

      const overTasks = prev[overCol];
      let newIdx: number;
      if (overId.startsWith("column-")) {
        newIdx = overTasks.length;
      } else {
        const oi = overTasks.findIndex((t) => t.id === overId);
        newIdx = oi === -1 ? overTasks.length : oi;
      }

      return {
        ...prev,
        [activeCol]: prev[activeCol].filter((t) => t.id !== activeId),
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
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    setColumns((prev) => {
      const activeCol = findColumnIn(prev, activeId);
      const overCol = findColumnIn(prev, overId);
      if (!activeCol || !overCol) return prev;

      let nextCols = prev;
      if (
        activeCol === overCol &&
        activeId !== overId &&
        !overId.startsWith("column-")
      ) {
        const colTasks = prev[activeCol];
        const oldIdx = colTasks.findIndex((t) => t.id === activeId);
        const newIdx = colTasks.findIndex((t) => t.id === overId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          nextCols = {
            ...prev,
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

      return nextCols;
    });
  }

  const draggingTask =
    draggingId !== null ? tasks.find((t) => t.id === draggingId) ?? null : null;

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
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {URGENCIES.map((u) => (
            <Column
              key={u}
              urgency={u}
              tasks={columns[u]}
              onCardClick={onCardClick}
            />
          ))}
        </div>
        <DragOverlay>
          {draggingTask ? (
            <TaskCard task={draggingTask} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
