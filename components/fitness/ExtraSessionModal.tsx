"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  SessionKind,
  SessionTypeLoggingMode,
  WorkoutSessionType,
} from "@/lib/fitness/types";

type Toast = { kind: "ok" | "error"; text: string } | null;

export function ExtraSessionModal({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: (toast: Toast) => void;
}) {
  const router = useRouter();
  const [types, setTypes] = useState<WorkoutSessionType[]>([]);
  const [typeKey, setTypeKey] = useState<string>("");
  const [customMode, setCustomMode] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [calories, setCalories] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/fitness/session-types", { cache: "no-store" });
      if (!r.ok || cancelled) return;
      const j = (await r.json()) as { types: WorkoutSessionType[] };
      if (cancelled) return;
      // Already sorted by label server-side, but be defensive.
      const sorted = [...(j.types ?? [])].sort((a, b) =>
        a.label.localeCompare(b.label)
      );
      setTypes(sorted);
      if (sorted.length > 0) setTypeKey(sorted[0].type_key);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = types.find((t) => t.type_key === typeKey) ?? null;

  function pickType(key: string) {
    if (key === "__custom__") {
      setCustomMode(true);
      setTypeKey("");
      return;
    }
    setCustomMode(false);
    setTypeKey(key);
  }

  /** Infer the kind for the workout_sessions row from a type's logging mode. */
  function inferKindFor(mode: SessionTypeLoggingMode): SessionKind {
    return mode === "full" ? "resistance" : "other";
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let typeRow: WorkoutSessionType | null = selected;

      if (customMode) {
        const label = customLabel.trim();
        if (!label) {
          setError("Type name required");
          return;
        }
        const r = await fetch("/api/fitness/session-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        });
        const j = await r.json();
        if (!r.ok) {
          setError(j.error ?? "Could not create type");
          return;
        }
        typeRow = j.type as WorkoutSessionType;
      }
      if (!typeRow) {
        setError("Pick a session type");
        return;
      }

      const finalName = name.trim() || typeRow.label;
      const cal = calories.trim() === "" ? undefined : Number(calories);
      const mode = typeRow.typical_logging_mode;
      const sessionKind = inferKindFor(mode);
      const isSimple = mode === "simple";

      const sessionRes = await fetch("/api/fitness/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          slot: "extra",
          kind: sessionKind,
          name: finalName,
          session_type: typeRow.type_key,
          notes: notes.trim() || undefined,
          calories: Number.isFinite(cal as number) ? (cal as number) : undefined,
        }),
      });
      const sj = await sessionRes.json();
      if (!sessionRes.ok) {
        setError(sj.error ?? "Could not create session");
        return;
      }
      const sessionId = sj.session_id as string;

      if (isSimple) {
        // Mark it complete now — simple sessions are logged in one shot.
        try {
          await fetch(`/api/fitness/sessions/${sessionId}/finish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notes: notes.trim() || null,
              calories:
                Number.isFinite(cal as number) ? (cal as number) : null,
              apply_template_updates: false,
            }),
          });
        } catch {
          /* not fatal — user can finish manually */
        }
        onSaved({ kind: "ok", text: `Logged ${typeRow.label}` });
        return;
      }

      // Full-logging mode → route to the log page
      onSaved(null);
      router.push(`/fitness/log/${sessionId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-ink-4">
            Add extra session
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-xl leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Session type
            </span>
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => {
                const active = !customMode && typeKey === t.type_key;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickType(t.type_key)}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                      active
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-ink-2 text-ink-4 hover:border-ink-3"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => pickType("__custom__")}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.1em] border transition-colors ${
                  customMode
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-ink-2 text-ink-3 hover:border-ink-3"
                }`}
              >
                + Other
              </button>
            </div>
          </div>

          {customMode && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
                What kind of session?
              </span>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value.slice(0, 30))}
                placeholder="e.g. Yoga, Climbing, Swimming"
                className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Name (optional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                customMode
                  ? customLabel || "What did you do?"
                  : selected?.label
                  ? `e.g. ${selected.label} — Snowdon`
                  : "What did you do?"
              }
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Notes (optional)
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="2 hours, hurt my knees on descent…"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-accent resize-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Calories (optional)
            </span>
            <input
              inputMode="numeric"
              value={calories}
              onChange={(e) =>
                setCalories(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="—"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)]"
            />
          </label>

          {error && (
            <p className="text-xs text-danger font-[family-name:var(--font-mono)]">
              {error}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-ink-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex-[2] h-12 rounded-md bg-accent/20 border border-accent/50 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
          >
            {busy ? "SAVING…" : "CREATE SESSION"}
          </button>
        </footer>
      </div>
    </div>
  );
}
