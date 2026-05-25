"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SessionExercise } from "@/lib/fitness/types";

type Props = {
  sessionId: string;
  exercises: SessionExercise[];
  activeId: string | null;
  readOnly: boolean;
  onSelect: (exId: string) => void;
  onSkip: (ex: SessionExercise) => void;
  onRemove: (ex: SessionExercise) => void;
  onReorder: (newOrder: SessionExercise[]) => void;
  onNavigateToHistory: (ex: SessionExercise) => string;
};

export function ReorderableExerciseList({
  sessionId,
  exercises,
  activeId,
  readOnly,
  onSelect,
  onSkip,
  onRemove,
  onReorder,
  onNavigateToHistory,
}: Props) {
  // No local items state — parent (LogClient) owns the canonical order via
  // `setSession`. onReorder is called optimistically; the parent updates
  // session.exercises immediately, and we re-render via props.

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(e: DragEndEvent) {
    if (readOnly) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((i) => i.id === active.id);
    const newIndex = exercises.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(exercises, oldIndex, newIndex);
    onReorder(next);
    try {
      await fetch(`/api/fitness/sessions/${sessionId}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise_ids: next.map((x) => x.id) }),
      });
    } catch {
      /* parent re-fetch will reconcile if it failed */
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => void handleDragEnd(e)}
    >
      <SortableContext
        items={exercises.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col">
          {exercises.map((ex) => (
            <SortableRow
              key={ex.id}
              ex={ex}
              isActive={activeId === ex.id}
              readOnly={readOnly}
              onSelect={() => onSelect(ex.id)}
              onSkip={() => onSkip(ex)}
              onRemove={() => onRemove(ex)}
              historyHref={onNavigateToHistory(ex)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  ex,
  isActive,
  readOnly,
  onSelect,
  onSkip,
  onRemove,
  historyHref,
}: {
  ex: SessionExercise;
  isActive: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onSkip: () => void;
  onRemove: () => void;
  historyHref: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ex.id, disabled: readOnly });
  const [menuOpen, setMenuOpen] = useState(false);

  const completed = !!ex.completed_at;
  const loggedSets = (ex.sets ?? []).filter((s) => s.completed_at).length;
  const target = ex.template?.default_sets ?? null;

  const icon = ex.skipped
    ? "✗"
    : completed
    ? "✓"
    : isActive
    ? "▶"
    : "▢";
  const tone = ex.skipped
    ? "text-ink-3"
    : completed
    ? "text-ok"
    : isActive
    ? "text-accent"
    : "text-ink-3";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative border-b border-ink-2 last:border-b-0 ${
        isDragging ? "z-10 bg-accent/5 shadow-lg scale-[1.01]" : ""
      } ${isActive && !isDragging ? "bg-accent/5" : ""} ${
        ex.skipped ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-3">
        {!readOnly && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="h-8 w-6 shrink-0 flex items-center justify-center text-ink-3 hover:text-ink-4 cursor-grab active:cursor-grabbing select-none touch-none"
            // Stop the inner click from also opening the row
            onClick={(e) => e.stopPropagation()}
          >
            <span aria-hidden className="text-base leading-none">⠿</span>
          </button>
        )}

        {readOnly ? (
          <a
            href={historyHref}
            className="flex-1 flex items-center gap-3 text-left"
          >
            <span className={`text-base shrink-0 ${tone}`} aria-hidden>
              {icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`text-sm truncate ${completed ? "text-ink-3" : "text-ink-4"}`}>
                {ex.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                {target ? `${loggedSets}/${target} sets` : `${loggedSets} sets`}
                {ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ""}
                {ex.save_to_template ? " · → tpl" : ""}
              </div>
            </div>
            <span
              className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] shrink-0"
              aria-hidden
            >
              →
            </span>
          </a>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="flex-1 flex items-center gap-3 text-left"
          >
            <span className={`text-base shrink-0 ${tone}`} aria-hidden>
              {icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`text-sm truncate ${completed ? "text-ink-3" : "text-ink-4"}`}>
                {ex.name}
              </div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                {target ? `${loggedSets}/${target} sets` : `${loggedSets} sets`}
                {ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ""}
                {ex.save_to_template ? " · → tpl" : ""}
              </div>
            </div>
          </button>
        )}

        {!readOnly && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Row actions"
            className="h-8 w-7 shrink-0 flex items-center justify-center text-ink-3 hover:text-ink-4"
          >
            ⋮
          </button>
        )}
      </div>

      {menuOpen && !readOnly && (
        <div
          className="absolute right-2 top-12 z-20 bg-ink-1 border border-ink-2 rounded-md shadow-2xl flex"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSkip();
            }}
            className="px-3 py-2 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] text-warn hover:bg-ink-2/30"
          >
            SKIP
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onRemove();
            }}
            className="px-3 py-2 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] text-danger hover:bg-ink-2/30"
          >
            REMOVE
          </button>
        </div>
      )}
    </li>
  );
}
