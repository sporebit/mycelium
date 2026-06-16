"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  DAY_SHORT,
  type ProgrammeDetail,
  type TemplateSession,
} from "@/lib/fitness/types";
import {
  KIND_ICON,
  KIND_LABEL,
  WORKOUT_KINDS,
  WORKOUT_SLOTS,
  type Workout,
  type WorkoutKind,
  type WorkoutSlot,
} from "@/lib/fitness/workouts";

type EditableSession = TemplateSession & {
  workout_id?: string | null;
  kind_override?: WorkoutKind | null;
};

const SLOT_LABEL: Record<WorkoutSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  extra: "Extra",
};

export function ProgrammeEditor({ programmeId }: { programmeId: string }) {
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<{
    day_of_week: number;
    slot: WorkoutSlot;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fitness/programmes/${programmeId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(`Load failed (${res.status})`);
        return;
      }
      const j = (await res.json()) as { programme?: ProgrammeDetail };
      setDetail(j.programme ?? null);
    } catch {
      setError("Network error");
    }
  }, [programmeId]);

  useEffect(() => {
    queueMicrotask(() => void load());
    queueMicrotask(async () => {
      try {
        const r = await fetch("/api/workouts");
        const j = (await r.json().catch(() => ({}))) as {
          workouts?: Workout[];
        };
        setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
      } catch {
        /* ignore */
      }
    });
  }, [load]);

  const byDaySlot = useMemo(() => {
    const m = new Map<string, EditableSession[]>();
    for (const s of (detail?.sessions ?? []) as EditableSession[]) {
      const key = `${s.day_of_week}-${s.slot}`;
      const arr = m.get(key) || [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [detail]);

  const sessionById = useMemo(() => {
    const m = new Map<string, EditableSession>();
    for (const s of (detail?.sessions ?? []) as EditableSession[]) {
      m.set(s.id, s);
    }
    return m;
  }, [detail]);

  const workoutById = useMemo(() => {
    const m = new Map<string, Workout>();
    for (const w of workouts) m.set(w.id, w);
    return m;
  }, [workouts]);

  async function patchProgramme(patch: Partial<ProgrammeDetail>) {
    if (!detail) return;
    setDetail({ ...detail, ...patch });
    await fetch(`/api/fitness/programmes/${programmeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function addSession(
    day: number,
    slot: WorkoutSlot,
    workout: Workout,
  ) {
    setError(null);
    const r = await fetch(`/api/fitness/programmes/${programmeId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day_of_week: day,
        slot,
        kind: workout.default_kind ?? "resistance",
        name: workout.name,
        workout_id: workout.id,
      }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Couldn't schedule (${r.status})`);
      console.error("[ProgrammeEditor addSession]", r.status, j);
      return;
    }
    setPickerSlot(null);
    await load();
  }

  async function patchSession(
    sessionId: string,
    patch: Record<string, unknown>,
  ) {
    await fetch(
      `/api/fitness/programmes/${programmeId}/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    await load();
  }

  async function deleteSession(sessionId: string) {
    if (!window.confirm("Remove this scheduled session?")) return;
    await fetch(
      `/api/fitness/programmes/${programmeId}/sessions/${sessionId}`,
      { method: "DELETE" },
    );
    await load();
  }

  async function moveSession(
    sessionId: string,
    newDay: number,
    newSlot: WorkoutSlot,
  ) {
    if (!detail) return;
    const session = sessionById.get(sessionId);
    if (!session) return;
    if (session.day_of_week === newDay && session.slot === newSlot) return;

    const oldSessions = detail.sessions;
    const newSessions = oldSessions.map((s) =>
      s.id === sessionId
        ? { ...s, day_of_week: newDay, slot: newSlot }
        : s,
    );
    // TemplateSession.slot is typed as TemplateSlot (3 values) but the
    // DB column accepts all 4 WorkoutSlot values including "extra".
    setDetail({
      ...detail,
      sessions: newSessions as TemplateSession[],
    });

    const r = await fetch(
      `/api/fitness/programmes/${programmeId}/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day_of_week: newDay, slot: newSlot }),
      },
    );
    if (!r.ok) {
      setDetail({ ...detail, sessions: oldSessions });
      setError("Move failed — reverted");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const overId = over.id as string;
    const dashIdx = overId.indexOf("-");
    if (dashIdx === -1) return;
    const newDay = parseInt(overId.slice(0, dashIdx), 10);
    const newSlot = overId.slice(dashIdx + 1) as WorkoutSlot;
    if (isNaN(newDay) || !WORKOUT_SLOTS.includes(newSlot)) return;
    void moveSession(active.id as string, newDay, newSlot);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)] flex items-center justify-between gap-2">
        <span>⚠ {error}</span>
        <button
          type="button"
          onClick={() => setError(null)}
          className="shrink-0 text-danger/60 hover:text-danger"
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  const activeSession = activeId ? sessionById.get(activeId) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/fitness/programmes"
        className="self-start text-[10px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)]"
      >
        ← Programmes
      </Link>

      <input
        type="text"
        defaultValue={detail.name}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== detail.name) void patchProgramme({ name: v });
        }}
        className="text-2xl italic font-[family-name:var(--font-display)] text-ink-4 bg-transparent border-b border-ink-2 focus:border-accent outline-none pb-1"
      />

      <textarea
        defaultValue={detail.description ?? ""}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== (detail.description ?? "")) {
            void patchProgramme({ description: v.trim() || null });
          }
        }}
        rows={2}
        placeholder="Programme description…"
        className="bg-ink-2/40 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
      />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {DAY_SHORT.map((dayLabel, dow) => (
            <div
              key={dow}
              className="rounded-md bg-ink-1 border border-ink-2 p-3 flex flex-col gap-2"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                {dayLabel}
              </div>
              <div className="flex flex-col gap-2">
                {WORKOUT_SLOTS.map((slot) => {
                  const sessions = byDaySlot.get(`${dow}-${slot}`) ?? [];
                  return (
                    <DroppableSlot
                      key={slot}
                      id={`${dow}-${slot}`}
                      slot={slot}
                      isEmpty={sessions.length === 0}
                      onAdd={() =>
                        setPickerSlot({ day_of_week: dow, slot })
                      }
                    >
                      {sessions.map((s) => (
                        <DraggableSessionCard
                          key={s.id}
                          session={s}
                          workout={
                            s.workout_id
                              ? workoutById.get(s.workout_id) ?? null
                              : null
                          }
                          onPatchSession={(patch) =>
                            void patchSession(s.id, patch)
                          }
                          onDelete={() => void deleteSession(s.id)}
                          isDragging={activeId === s.id}
                        />
                      ))}
                    </DroppableSlot>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeSession ? (
            <SessionCardContent
              session={activeSession}
              workout={
                activeSession.workout_id
                  ? workoutById.get(activeSession.workout_id) ?? null
                  : null
              }
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {pickerSlot && (
        <WorkoutPickerModal
          day={pickerSlot.day_of_week}
          slot={pickerSlot.slot}
          workouts={workouts}
          onPick={(w) =>
            void addSession(pickerSlot.day_of_week, pickerSlot.slot, w)
          }
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}

/* ── Droppable slot container ───────────────────────────────────── */

function DroppableSlot({
  id,
  slot,
  isEmpty,
  onAdd,
  children,
}: {
  id: string;
  slot: WorkoutSlot;
  isEmpty: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md transition-all min-h-[40px] flex flex-col gap-1.5 ${
        isOver ? "ring-2 ring-[#84f5b8] bg-[#84f5b8]/5" : ""
      } ${isEmpty && !isOver ? "border border-dashed border-ink-2 hover:border-ink-3" : ""}`}
    >
      {children}
      <button
        type="button"
        onClick={onAdd}
        className={`text-left rounded-md text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] transition-colors ${
          isEmpty ? "px-3 py-2" : "px-3 py-1 text-[10px]"
        }`}
      >
        + {SLOT_LABEL[slot]}
      </button>
    </div>
  );
}

/* ── Draggable session card ─────────────────────────────────────── */

function DraggableSessionCard({
  session,
  workout,
  onPatchSession,
  onDelete,
  isDragging,
}: {
  session: EditableSession;
  workout: Workout | null;
  onPatchSession: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: session.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`group/card transition-opacity ${isDragging ? "opacity-50" : ""}`}
    >
      <SessionCardContent
        session={session}
        workout={workout}
        onPatchSession={onPatchSession}
        onDelete={onDelete}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
}

/* ── Session card content (shared between card and drag overlay) ─ */

function SessionCardContent({
  session,
  workout,
  onPatchSession,
  onDelete,
  dragAttributes,
  dragListeners,
  isOverlay,
}: {
  session: EditableSession;
  workout: Workout | null;
  onPatchSession?: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  dragAttributes?: React.HTMLAttributes<HTMLButtonElement>;
  dragListeners?: DraggableSyntheticListeners;
  isOverlay?: boolean;
}) {
  const effectiveKind: WorkoutKind = (session.kind_override ??
    (workout?.default_kind as WorkoutKind | undefined) ??
    (session.kind as WorkoutKind)) as WorkoutKind;
  const icon = KIND_ICON[effectiveKind] ?? "·";

  return (
    <div
      className={`rounded-md bg-ink-2/40 px-3 py-2 flex flex-col gap-1.5 ${
        isOverlay ? "shadow-lg border border-[#84f5b8]/40 bg-ink-1" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-ink-3 hover:text-ink-4 md:opacity-0 md:group-hover/card:opacity-100 transition-opacity touch-none select-none"
            aria-label="Drag to move"
            {...(dragAttributes ?? {})}
            {...(dragListeners ?? {})}
          >
            ⠿
          </button>
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            {SLOT_LABEL[session.slot as WorkoutSlot]}
          </span>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remove session"
            className="text-ink-3 hover:text-danger text-sm"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        {session.workout_id && !isOverlay ? (
          <Link
            href={`/fitness/workouts/${session.workout_id}`}
            className="flex-1 text-sm text-ink-4 truncate hover:text-accent"
          >
            {workout?.name ?? session.name}
          </Link>
        ) : (
          <span className="flex-1 text-sm text-ink-4 truncate">
            {workout?.name ?? session.name}
          </span>
        )}
      </div>
      {onPatchSession && (
        <select
          value={session.kind_override ?? ""}
          onChange={(e) =>
            onPatchSession({
              kind_override: e.target.value || null,
            })
          }
          className="bg-ink-2 rounded-sm text-[10px] uppercase tracking-[0.18em] font-[family-name:var(--font-mono)] text-ink-3 px-2 py-1 outline-none focus:ring-2 focus:ring-glow-2/60"
          title="Kind override"
        >
          <option value="">
            Use default ({workout?.default_kind ?? session.kind})
          </option>
          {WORKOUT_KINDS.map((k) => (
            <option key={k} value={k}>
              Override: {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ── Workout picker modal (unchanged) ───────────────────────────── */

function WorkoutPickerModal({
  day,
  slot,
  workouts,
  onPick,
  onClose,
}: {
  day: number;
  slot: WorkoutSlot;
  workouts: Workout[];
  onPick: (w: Workout) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      workouts.filter((w) =>
        query
          ? `${w.name} ${w.default_kind ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase())
          : true,
      ),
    [workouts, query],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-lg bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-text-0">
            Pick workout · {DAY_SHORT[day]} {SLOT_LABEL[slot]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-2 hover:text-text-0 text-xl leading-none"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-3 border-b border-ink-2">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter workouts…"
            className="w-full bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
          />
        </div>
        <ul className="flex flex-col divide-y divide-ink-2 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] px-5 py-6 text-center">
              {workouts.length === 0
                ? "No workouts in the library yet."
                : "No matches."}
            </li>
          ) : (
            filtered.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onPick(w)}
                  className="w-full text-left px-5 py-3 hover:bg-ink-2/40 flex items-center gap-3"
                >
                  <span aria-hidden className="text-lg">
                    {w.default_kind ? KIND_ICON[w.default_kind] : "·"}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-4 truncate">
                      {w.name}
                    </span>
                    <span className="block text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                      {w.default_kind ? KIND_LABEL[w.default_kind] : "—"} ·{" "}
                      {w.exercise_count ?? 0} ex
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
