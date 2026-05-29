"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Mono } from "@/components/dashboard/Mono";
import { AddSessionModal } from "./AddSessionModal";
import { SessionSwapDropdown } from "./SessionSwapDropdown";
import { KIND_VISUALS, SLOT_ICON, SLOT_LABEL, SLOT_ORDER } from "@/lib/fitness/kind";
import type {
  Slot,
  TemplateExercise,
  TodayResponse,
  TodaySlotEntry,
  WorkoutSessionType,
} from "@/lib/fitness/types";

function exerciseLine(ex: TemplateExercise): string {
  if (ex.data_shape === "hold" && ex.default_hold_seconds) {
    return `${ex.default_hold_seconds}s × ${ex.default_sets ?? 1}`;
  }
  if (ex.data_shape === "duration" && ex.default_duration_min) {
    const parts = [`${ex.default_duration_min} min`];
    if (ex.default_intensity) parts.push(ex.default_intensity);
    return parts.join(" · ");
  }
  if (ex.data_shape === "distance" && ex.default_distance_km) {
    return `${ex.default_distance_km} km`;
  }
  if (ex.default_sets !== null && ex.default_sets > 0) {
    const parts: string[] = [];
    parts.push(`${ex.default_sets}×${ex.default_reps ?? "?"}`);
    if (ex.with_weight && ex.default_weight !== null) {
      parts.push(`${ex.default_weight}${ex.default_weight_unit ?? "kg"}`);
    }
    return parts.join(" · ");
  }
  if (ex.default_duration_min !== null) return `${ex.default_duration_min} min`;
  return "—";
}

function jsDayToProgrammeDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

type Toast = { kind: "ok" | "error"; text: string } | null;

export function TodayView() {
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [typesByKey, setTypesByKey] = useState<Record<string, WorkoutSessionType>>({});
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<Slot | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const load = useCallback(async () => {
    try {
      const [tRes, typeRes] = await Promise.all([
        fetch("/api/fitness/today", { cache: "no-store" }),
        fetch("/api/fitness/session-types", { cache: "no-store" }),
      ]);
      if (!tRes.ok) {
        setError(`Load failed (${tRes.status})`);
        return;
      }
      const j = (await tRes.json()) as TodayResponse;
      setData(j);
      if (typeRes.ok) {
        const tj = (await typeRes.json()) as { types: WorkoutSessionType[] };
        const m: Record<string, WorkoutSessionType> = {};
        for (const t of tj.types ?? []) m[t.type_key] = t;
        setTypesByKey(m);
      }
    } catch {
      setError("Network error");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await load();
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  async function startOrResume(s: TodaySlotEntry) {
    if (s.logged_session_id) {
      router.push(`/fitness/log/${s.logged_session_id}`);
      return;
    }
    // Custom (no programme template) sessions are created already-logged
    // by the AddSessionModal. If we land here without a logged_session_id
    // and without a programme_session_id, the row is in a bad state —
    // refresh the data.
    if (!s.programme_session_id) {
      router.refresh();
      return;
    }
    setStarting(s.programme_session_id);
    try {
      const r = await fetch("/api/fitness/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme_session_id: s.programme_session_id,
          slot: s.slot,
          kind: s.kind,
          name: s.name,
          date: data?.date,
        }),
      });
      if (!r.ok) {
        setError("Could not start session");
        return;
      }
      const j = (await r.json()) as { session_id: string };
      router.push(`/fitness/log/${j.session_id}`);
    } finally {
      setStarting(null);
    }
  }

  async function handleReorder(slot: Slot, newOrder: TodaySlotEntry[]) {
    if (!data) return;
    // Only sessions that have a workout_sessions row can be reordered (the
    // API requires session ids). Planned-only template entries skip.
    const ids = newOrder
      .map((e) => e.logged_session_id)
      .filter((id): id is string => !!id);
    if (ids.length < 2) return;
    // Optimistic local update
    setData((prev) =>
      prev
        ? {
            ...prev,
            slots: { ...prev.slots, [slot]: newOrder },
          }
        : prev
    );
    try {
      await fetch("/api/fitness/sessions/reorder-in-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: data.date,
          slot,
          session_ids: ids,
        }),
      });
    } catch {
      /* parent re-fetch will reconcile */
    }
  }

  if (error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)]">
        ⚠ {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-sm text-ink-3 italic font-[family-name:var(--font-display)] py-12 text-center">
        Loading…
      </div>
    );
  }

  const todayDow = jsDayToProgrammeDow(
    new Date(data.date.replace(/-/g, "/")).getDay()
  );

  return (
    <div className="flex flex-col gap-6">
      {data.programme_name && (
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Programme · {data.programme_name}
        </div>
      )}

      {SLOT_ORDER.map((slot) => {
        const entries = data.slots[slot] ?? [];
        return (
          <SlotSection
            key={slot}
            slot={slot}
            entries={entries}
            programmeSessions={data.programme_sessions}
            todayDow={todayDow}
            typesByKey={typesByKey}
            starting={starting}
            onStart={(e) => void startOrResume(e)}
            onReorder={(newOrder) => void handleReorder(slot, newOrder)}
            onAdd={() => setAddFor(slot)}
            onSwapped={() => void load()}
          />
        );
      })}

      {addFor && (
        <AddSessionModal
          slot={addFor}
          date={data.date}
          programmeSessions={data.programme_sessions}
          onClose={() => setAddFor(null)}
          onSaved={(toastMsg) => {
            setAddFor(null);
            if (toastMsg) setToast(toastMsg);
            void load();
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`growth-in fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
            toast.kind === "ok"
              ? "bg-ok/20 text-ok border border-ok/40"
              : "bg-danger/20 text-danger border border-danger/40"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function SlotSection({
  slot,
  entries,
  programmeSessions,
  todayDow,
  typesByKey,
  starting,
  onStart,
  onReorder,
  onAdd,
  onSwapped,
}: {
  slot: Slot;
  entries: TodaySlotEntry[];
  programmeSessions: TodayResponse["programme_sessions"];
  todayDow: number;
  typesByKey: Record<string, WorkoutSessionType>;
  starting: string | null;
  onStart: (entry: TodaySlotEntry) => void;
  onReorder: (newOrder: TodaySlotEntry[]) => void;
  onAdd: () => void;
  onSwapped: () => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function entryKey(e: TodaySlotEntry): string {
    return e.logged_session_id ?? `tpl:${e.programme_session_id}`;
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = entries.findIndex((x) => entryKey(x) === active.id);
    const newIdx = entries.findIndex((x) => entryKey(x) === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(entries, oldIdx, newIdx));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg" aria-hidden>
          {SLOT_ICON[slot]}
        </span>
        <span className="card-eyebrow">{SLOT_LABEL[slot]}</span>
      </div>

      {entries.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={entries.map(entryKey)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {entries.map((entry) => (
                <SortableSessionCard
                  key={entryKey(entry)}
                  id={entryKey(entry)}
                  entry={entry}
                  programmeSessions={programmeSessions}
                  todayDow={todayDow}
                  typesByKey={typesByKey}
                  starting={starting}
                  onStart={onStart}
                  onSwapped={onSwapped}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      <button
        type="button"
        onClick={onAdd}
        className="self-start px-3 py-1.5 rounded-md border border-ink-2 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4 hover:border-ink-3 transition-colors"
      >
        + ADD SESSION
      </button>
    </section>
  );
}

function SortableSessionCard(props: {
  id: string;
  entry: TodaySlotEntry;
  programmeSessions: TodayResponse["programme_sessions"];
  todayDow: number;
  typesByKey: Record<string, WorkoutSessionType>;
  starting: string | null;
  onStart: (entry: TodaySlotEntry) => void;
  onSwapped: () => void;
}) {
  const { id, entry, programmeSessions, todayDow, typesByKey, starting, onStart, onSwapped } =
    props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const kindVisual = KIND_VISUALS[entry.kind];
  const typeLabel = entry.session_type
    ? typesByKey[entry.session_type]?.label ?? entry.session_type
    : null;
  const isAttempted = entry.status === "attempted";
  const label = entry.completed
    ? `LOGGED · ${entry.summary?.sets ?? 0} sets${
        entry.summary?.minutes != null ? ` · ${entry.summary.minutes}m` : ""
      }`
    : isAttempted
    ? "ATTEMPTED →"
    : entry.in_progress
    ? "RESUME →"
    : "START SESSION →";

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`growth-in rounded-md bg-ink-1 p-5 flex flex-col gap-3 ${
        isDragging ? "ring-1 ring-glow-2/60 shadow-2xl" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          className="h-7 w-5 shrink-0 flex items-center justify-center text-ink-3 hover:text-ink-4 cursor-grab active:cursor-grabbing touch-none"
        >
          <span aria-hidden className="text-base leading-none">⠿</span>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${kindVisual.bgClass} ${kindVisual.textClass} ${kindVisual.borderClass}`}
            >
              {kindVisual.icon} {kindVisual.label}
            </span>
            {typeLabel && (
              <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                · {typeLabel}
              </span>
            )}
            {entry.swapped_from_programme_session_id && (
              <span className="text-[10px] uppercase tracking-[0.15em] text-warn font-[family-name:var(--font-mono)]">
                ↻ swapped
              </span>
            )}
            {isAttempted && (
              <span
                className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border border-warn/40 bg-warn/15 text-warn"
                title="Marked as attempted — started over 48h ago, never finished"
              >
                ATTEMPTED
              </span>
            )}
            {entry.known_issues_count > 0 && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-warn"
                title={`${entry.known_issues_count} exercise(s) with known pain history`}
              />
            )}
          </div>
          <div className="font-[family-name:var(--font-display)] text-xl text-text-0 mt-1 truncate">
            {entry.name}
          </div>
          <div className="text-[11px] text-text-2 font-[family-name:var(--font-mono)] tracking-[0.08em] mt-0.5">
            {entry.exercises.length > 0
              ? `${entry.exercises.length} exercise${entry.exercises.length === 1 ? "" : "s"}`
              : "free-form"}
            {entry.completed && entry.summary
              ? ` · ${entry.summary.sets} sets${
                  entry.summary.minutes != null ? ` · ${entry.summary.minutes}m` : ""
                }`
              : ""}
          </div>
        </div>
        {!entry.completed && entry.programme_session_id && (
          <SessionSwapDropdown
            slot={entry.slot === "extra" ? "morning" : entry.slot}
            currentProgrammeSessionId={entry.programme_session_id}
            sessionId={entry.logged_session_id}
            hasLoggedWork={!!entry.logged_session_id && entry.in_progress}
            todayDayOfWeek={todayDow}
            programmeSessions={programmeSessions}
            onSwapped={onSwapped}
          />
        )}
      </div>

      {entry.exercises.length > 0 && (
        <ul className="flex flex-col divide-y divide-ink-2/60">
          {entry.exercises.slice(0, 5).map((ex) => (
            <li
              key={ex.id}
              className="py-1.5 first:pt-0 last:pb-0 flex items-baseline gap-3"
            >
              <Mono className="text-[10px] text-ink-3 w-5 shrink-0">
                {ex.position}
              </Mono>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-0 leading-snug truncate">
                  {ex.name}
                </div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-text-2 font-[family-name:var(--font-mono)]">
                  {exerciseLine(ex)}
                </div>
              </div>
            </li>
          ))}
          {entry.exercises.length > 5 && (
            <li className="py-1.5 text-[10px] text-text-2 font-[family-name:var(--font-mono)] tracking-[0.15em]">
              + {entry.exercises.length - 5} more
            </li>
          )}
        </ul>
      )}

      <div className="flex items-center justify-end">
        {entry.completed && entry.logged_session_id ? (
          <Link
            href={`/fitness/log/${entry.logged_session_id}`}
            className="text-[10px] uppercase tracking-[0.18em] text-ok font-[family-name:var(--font-mono)] hover:text-text-0"
          >
            {label}
          </Link>
        ) : isAttempted && entry.logged_session_id ? (
          <Link
            href={`/fitness/log/${entry.logged_session_id}`}
            className="text-[10px] uppercase tracking-[0.18em] text-warn font-[family-name:var(--font-mono)] hover:text-text-0 px-2 py-1 rounded-md border border-warn/40 bg-warn/15"
          >
            {label}
          </Link>
        ) : (
          (() => {
            // `starting` only tracks in-flight POSTs to /api/fitness/sessions,
            // which only fire for programme-template entries. Custom entries
            // have programme_session_id=null, so a naïve `starting===null` test
            // would disable them permanently.
            const isStarting =
              starting !== null && starting === entry.programme_session_id;
            return (
              <button
                type="button"
                disabled={isStarting}
                onClick={() => onStart(entry)}
                className="text-[11px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)] disabled:opacity-40"
              >
                {isStarting ? "STARTING…" : label}
              </button>
            );
          })()
        )}
      </div>
    </article>
  );
}
