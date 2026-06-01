"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  KIND_LABEL,
  SLOT_LABEL,
  WORKOUT_KINDS,
  WORKOUT_SLOTS,
  type WorkoutDetail,
  type WorkoutExercise,
  type WorkoutKind,
  type WorkoutSlot,
} from "@/lib/fitness/workouts";

/**
 * Shared editor used by /fitness/workouts/[id]. Owns local exercise
 * state with optimistic updates; reorders persist in batch via the
 * reorder endpoint.
 */
export function WorkoutEditor({
  workout,
  onPatchWorkout,
  onExercisesChange,
}: {
  workout: WorkoutDetail;
  onPatchWorkout: (patch: Partial<WorkoutDetail>) => Promise<void>;
  onExercisesChange?: (exercises: WorkoutExercise[]) => void;
}) {
  const [name, setName] = useState(workout.name);
  const [defaultKind, setDefaultKind] = useState<WorkoutKind | "">(
    workout.default_kind ?? "",
  );
  const [defaultSlot, setDefaultSlot] = useState<WorkoutSlot | "">(
    workout.default_slot ?? "",
  );
  const [notes, setNotes] = useState(workout.notes ?? "");
  const [exercises, setExercises] = useState<WorkoutExercise[]>(
    workout.exercises ?? [],
  );

  // Keep parent informed of the live exercise list so the used-in
  // section can adjust if needed.
  useEffect(() => {
    onExercisesChange?.(exercises);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  async function saveHeader() {
    await onPatchWorkout({
      name: name.trim(),
      default_kind: (defaultKind || null) as WorkoutKind | null,
      default_slot: (defaultSlot || null) as WorkoutSlot | null,
      notes: notes.trim() || null,
    });
  }

  async function addExercise() {
    const r = await fetch(`/api/workouts/${workout.id}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New exercise" }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      exercise?: WorkoutExercise;
    };
    if (j.exercise) setExercises((cur) => [...cur, j.exercise!]);
  }

  async function patchExercise(id: string, patch: Partial<WorkoutExercise>) {
    setExercises((cur) =>
      cur.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
    await fetch(`/api/workouts/${workout.id}/exercises/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function removeExercise(id: string) {
    if (!window.confirm("Remove this exercise from the workout?")) return;
    setExercises((cur) => cur.filter((e) => e.id !== id));
    await fetch(`/api/workouts/${workout.id}/exercises/${id}`, {
      method: "DELETE",
    });
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = exercises.map((x) => x.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(exercises, oldIdx, newIdx);
    setExercises(next);
    await fetch(`/api/workouts/${workout.id}/exercises/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: next.map((x) => x.id) }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveHeader}
          className="text-2xl text-ink-4 bg-transparent border-b border-ink-2 focus:border-accent outline-none pb-1 font-[family-name:var(--font-display)] italic"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Field label="Default kind">
            <select
              value={defaultKind}
              onChange={(e) => setDefaultKind(e.target.value as WorkoutKind | "")}
              onBlur={saveHeader}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            >
              <option value="">— None —</option>
              {WORKOUT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default slot">
            <select
              value={defaultSlot}
              onChange={(e) => setDefaultSlot(e.target.value as WorkoutSlot | "")}
              onBlur={saveHeader}
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            >
              <option value="">— None —</option>
              {WORKOUT_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveHeader}
              placeholder="(optional)"
              className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
            />
          </Field>
        </div>
      </header>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
          Exercises
        </h2>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <SortableContext
            items={exercises.map((e) => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {exercises.map((ex) => (
                <ExerciseRow
                  key={ex.id}
                  ex={ex}
                  onPatch={(p) => void patchExercise(ex.id, p)}
                  onRemove={() => void removeExercise(ex.id)}
                />
              ))}
              {exercises.length === 0 && (
                <li className="rounded-md bg-ink-1 px-3 py-3 text-sm text-ink-3 italic font-[family-name:var(--font-display)] text-center">
                  No exercises yet.
                </li>
              )}
            </ul>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={addExercise}
          className="mt-3 px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] transition-colors"
        >
          + ADD EXERCISE
        </button>
      </section>

      {workout.used_in && workout.used_in.length > 0 && (
        <section className="rounded-md bg-ink-1 border border-ink-2 p-3">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] mb-2">
            Used in {workout.used_in.length} programme
            {workout.used_in.length === 1 ? "" : "s"}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {workout.used_in.map((u) => (
              <li key={u.programme_session_id}>
                <a
                  href={`/fitness/programmes/${u.programme_id}/edit`}
                  className="text-sm text-ink-4 hover:text-accent transition-colors"
                >
                  {u.programme_name}{" "}
                  <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                    · day {u.day_of_week} · {u.slot}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ExerciseRow({
  ex,
  onPatch,
  onRemove,
}: {
  ex: WorkoutExercise;
  onPatch: (patch: Partial<WorkoutExercise>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ex.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md bg-ink-1 border border-ink-2 px-3 py-2 flex items-start gap-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="text-ink-3 hover:text-ink-4 cursor-grab active:cursor-grabbing select-none touch-none mt-1.5"
      >
        ⠿
      </button>
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[2fr_4rem_5rem_4rem_5rem_auto] gap-2 items-center">
        <input
          type="text"
          defaultValue={ex.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== ex.name) onPatch({ name: v });
          }}
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
        <input
          type="number"
          inputMode="numeric"
          min={1}
          defaultValue={ex.sets}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 1 && v !== ex.sets) onPatch({ sets: v });
          }}
          aria-label="Sets"
          title="Sets"
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60 tabular-nums"
        />
        <input
          type="text"
          defaultValue={ex.reps_per_set}
          onBlur={(e) => {
            const v = e.target.value.trim() || "8-12";
            if (v !== ex.reps_per_set) onPatch({ reps_per_set: v });
          }}
          aria-label="Reps"
          title="Reps (e.g. 8-12 or 5)"
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60 tabular-nums"
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={ex.rest_seconds ?? 90}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onPatch({ rest_seconds: v });
          }}
          aria-label="Rest seconds"
          title="Rest (seconds)"
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60 tabular-nums"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            defaultValue={ex.weight_kg ?? ""}
            placeholder={ex.is_bodyweight ? "+ kg" : "kg"}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const v = raw === "" ? null : Number(raw);
              onPatch({ weight_kg: v });
            }}
            aria-label="Weight kg"
            title="Weight (kg). Empty = no target."
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60 tabular-nums"
          />
          <button
            type="button"
            onClick={() => onPatch({ is_bodyweight: !ex.is_bodyweight })}
            aria-pressed={ex.is_bodyweight}
            title="Bodyweight"
            className={`shrink-0 px-1.5 py-1.5 rounded-md border text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] transition-colors ${
              ex.is_bodyweight
                ? "bg-accent/20 border-accent/40 text-accent"
                : "bg-ink-0/40 border-ink-2 text-ink-3 hover:text-ink-4"
            }`}
          >
            BW
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove exercise"
          className="text-ink-3 hover:text-danger text-base"
        >
          🗑
        </button>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
        {label}
      </span>
      {children}
    </label>
  );
}
