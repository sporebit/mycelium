"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  KIND_LABEL,
  SLOT_LABEL,
  WORKOUT_KINDS,
  WORKOUT_SLOTS,
  type Workout,
  type WorkoutKind,
  type WorkoutSlot,
} from "@/lib/fitness/workouts";

export function WorkoutCreateClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<WorkoutKind | "">("");
  const [slot, setSlot] = useState<WorkoutSlot | "">("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          default_kind: kind || null,
          default_slot: slot || null,
          notes: notes.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        workout?: Workout;
        error?: string;
      };
      if (!r.ok || !j.workout) {
        setError(j.error ?? "Create failed.");
        return;
      }
      router.replace(`/fitness/workouts/${j.workout.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <h1 className="font-[family-name:var(--font-display)] italic text-2xl text-text-0">
        New workout
      </h1>
      <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
        Build the template; you&apos;ll add exercises on the next screen.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Name *
        </span>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Push Day A"
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Default kind
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as WorkoutKind | "")}
            className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          >
            <option value="">— None —</option>
            {WORKOUT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            Default slot
          </span>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value as WorkoutSlot | "")}
            className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
          >
            <option value="">— None —</option>
            {WORKOUT_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="(optional)"
          className="bg-ink-2 rounded-sm text-sm text-text-0 px-2 py-1.5 outline-none focus:ring-2 focus:ring-glow-2/60"
        />
      </label>

      {error && (
        <p className="text-[11px] text-danger font-[family-name:var(--font-mono)] uppercase tracking-[0.18em]">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] text-ink-3 hover:text-ink-4"
        >
          CANCEL
        </button>
        <button
          type="button"
          onClick={create}
          disabled={creating || !name.trim()}
          className="px-3 py-1.5 rounded-md bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 disabled:opacity-40 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em]"
        >
          {creating ? "CREATING…" : "CREATE"}
        </button>
      </div>
    </div>
  );
}
