"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

/**
 * ProgrammeSession augmented with the new workout fields. The base type
 * predates migration 0032 so we extend at the component boundary.
 */
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
        const j = (await r.json().catch(() => ({}))) as { workouts?: Workout[] };
        setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
      } catch {
        /* ignore */
      }
    });
  }, [load]);

  const byDaySlot = useMemo(() => {
    const m = new Map<string, EditableSession>();
    for (const s of (detail?.sessions ?? []) as EditableSession[]) {
      m.set(`${s.day_of_week}-${s.slot}`, s);
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
      // The previous version silently no-op'd here, masking the real
      // problem (slot CHECK violation on evening/extra). Migration
      // 0035 fixed the underlying cause; the error surface stays so
      // future failures show up immediately.
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {DAY_SHORT.map((dayLabel, dow) => (
          <div key={dow} className="rounded-md bg-ink-1 border border-ink-2 p-3 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              {dayLabel}
            </div>
            <div className="flex flex-col gap-2">
              {WORKOUT_SLOTS.map((slot) => {
                const s = byDaySlot.get(`${dow}-${slot}`);
                return (
                  <SlotCell
                    key={slot}
                    day={dow}
                    slot={slot}
                    session={s ?? null}
                    workout={
                      s?.workout_id ? workoutById.get(s.workout_id) ?? null : null
                    }
                    onAdd={() => setPickerSlot({ day_of_week: dow, slot })}
                    onPatchSession={(patch) =>
                      s ? void patchSession(s.id, patch) : undefined
                    }
                    onDelete={() => (s ? void deleteSession(s.id) : undefined)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {pickerSlot && (
        <WorkoutPickerModal
          day={pickerSlot.day_of_week}
          slot={pickerSlot.slot}
          workouts={workouts}
          onPick={(w) => void addSession(pickerSlot.day_of_week, pickerSlot.slot, w)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}

function SlotCell({
  day: _day,
  slot,
  session,
  workout,
  onAdd,
  onPatchSession,
  onDelete,
}: {
  day: number;
  slot: WorkoutSlot;
  session: EditableSession | null;
  workout: Workout | null;
  onAdd: () => void;
  onPatchSession: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  void _day;
  if (!session) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="text-left rounded-md border border-dashed border-ink-2 hover:border-ink-3 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink-4 font-[family-name:var(--font-mono)] transition-colors"
      >
        + {SLOT_LABEL[slot]}
      </button>
    );
  }

  const effectiveKind: WorkoutKind = (session.kind_override ??
    (workout?.default_kind as WorkoutKind | undefined) ??
    (session.kind as WorkoutKind)) as WorkoutKind;
  const icon = KIND_ICON[effectiveKind] ?? "·";

  return (
    <div className="rounded-md bg-ink-2/40 px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          {SLOT_LABEL[slot]}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove session"
          className="text-ink-3 hover:text-danger text-sm"
        >
          ×
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        {session.workout_id ? (
          <Link
            href={`/fitness/workouts/${session.workout_id}`}
            className="flex-1 text-sm text-ink-4 truncate hover:text-accent"
          >
            {workout?.name ?? session.name}
          </Link>
        ) : (
          <span className="flex-1 text-sm text-ink-4 truncate">
            {session.name}
          </span>
        )}
      </div>
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
    </div>
  );
}

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
