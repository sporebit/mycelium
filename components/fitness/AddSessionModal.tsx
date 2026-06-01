"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { triggerGlowPulse } from "@/lib/motion";
import { KIND_VISUALS, SLOT_LABEL } from "@/lib/fitness/kind";
import { DAY_SHORT } from "@/lib/fitness/types";
import type {
  Slot,
  TemplateKind,
  TodayResponse,
  WorkoutSessionType,
} from "@/lib/fitness/types";
import { KIND_ICON, type Workout } from "@/lib/fitness/workouts";

const TEMPLATE_KINDS: TemplateKind[] = [
  "cardio",
  "conditioning",
  "resistance",
  "mobility",
];

type Toast = { kind: "ok" | "error"; text: string };

export function AddSessionModal({
  slot,
  date,
  programmeSessions,
  onClose,
  onSaved,
}: {
  slot: Slot;
  date: string;
  programmeSessions: TodayResponse["programme_sessions"];
  onClose: () => void;
  onSaved: (toast: Toast | null) => void;
}) {
  const router = useRouter();
  const [source, setSource] = useState<"programme" | "library" | "custom">(
    "programme",
  );
  const [pickedTplId, setPickedTplId] = useState<string | null>(null);
  const [pickedWorkoutId, setPickedWorkoutId] = useState<string | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [kind, setKind] = useState<TemplateKind>("mobility");
  const [name, setName] = useState("");
  const [sessionType, setSessionType] = useState<string>("");
  const [types, setTypes] = useState<WorkoutSessionType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tRes, wRes] = await Promise.all([
          fetch("/api/fitness/session-types", { cache: "no-store" }),
          fetch("/api/workouts", { cache: "no-store" }),
        ]);
        if (!mounted) return;
        if (tRes.ok) {
          const j = (await tRes.json()) as { types: WorkoutSessionType[] };
          if (mounted) setTypes(j.types ?? []);
        }
        if (wRes.ok) {
          const j = (await wRes.json()) as { workouts?: Workout[] };
          if (mounted) setWorkouts(Array.isArray(j.workouts) ? j.workouts : []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grouped = useMemo(() => {
    const byDow = new Map<number, TodayResponse["programme_sessions"]>();
    for (const s of programmeSessions) {
      const list = byDow.get(s.day_of_week) ?? [];
      list.push(s);
      byDow.set(s.day_of_week, list);
    }
    return byDow;
  }, [programmeSessions]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { date, slot };
      if (source === "programme") {
        if (!pickedTplId) {
          setError("Pick a programme session");
          return;
        }
        const tpl = programmeSessions.find((s) => s.id === pickedTplId);
        if (!tpl) {
          setError("Programme session not found");
          return;
        }
        payload.programme_session_id = pickedTplId;
        payload.kind = tpl.kind;
        payload.name = name.trim() || tpl.name;
      } else if (source === "library") {
        if (!pickedWorkoutId) {
          setError("Pick a workout from the library");
          return;
        }
        const w = workouts.find((x) => x.id === pickedWorkoutId);
        payload.workout_id = pickedWorkoutId;
        payload.kind = w?.default_kind ?? "other";
        payload.name = name.trim() || w?.name || "Workout";
      } else {
        payload.kind = kind;
        payload.name = name.trim() || `${KIND_VISUALS[kind].label} session`;
      }
      if (sessionType) payload.session_type = sessionType;

      const r = await fetch("/api/fitness/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Create failed");
        return;
      }
      if (j.session_id) {
        onSaved(null);
        router.push(`/fitness/log/${j.session_id}`);
        return;
      }
      onSaved({ kind: "ok", text: "Session added" });
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
        className="growth-in w-full sm:max-w-lg bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-text-0">
            Add session to {SLOT_LABEL[slot]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-2 hover:text-text-0 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
          {/* Source chips */}
          <div className="flex gap-2 flex-wrap">
            {(["programme", "library", "custom"] as const).map((s) => {
              const active = source === s;
              const label =
                s === "programme"
                  ? "FROM PROGRAMME"
                  : s === "library"
                    ? "FROM LIBRARY"
                    : "CUSTOM";
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] border transition-colors ${
                    active
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {source === "programme" ? (
            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
              {programmeSessions.length === 0 ? (
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                  No programme active.
                </p>
              ) : (
                Array.from(grouped.entries())
                  .sort((a, b) => a[0] - b[0])
                  .map(([dow, sessions]) => (
                    <div key={dow} className="flex flex-col gap-1">
                      <div className="card-eyebrow">{DAY_SHORT[dow]}</div>
                      <div className="flex flex-col gap-1">
                        {sessions.map((s) => {
                          const active = pickedTplId === s.id;
                          const kv = KIND_VISUALS[s.kind];
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setPickedTplId(s.id)}
                              className={`text-left rounded-sm px-3 py-2 flex items-center gap-2 transition-colors ${
                                active
                                  ? "bg-accent/15 ring-1 ring-accent/40"
                                  : "bg-ink-2/40 hover:bg-ink-2"
                              }`}
                            >
                              <span aria-hidden>{kv.icon}</span>
                              <span className="text-[11px] uppercase tracking-[0.15em] text-text-2 font-[family-name:var(--font-mono)]">
                                {s.slot}
                              </span>
                              <span className="text-sm text-text-0 flex-1 truncate">
                                {s.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
              )}
            </div>
          ) : source === "library" ? (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {workouts.length === 0 ? (
                <p className="text-sm text-ink-3 italic font-[family-name:var(--font-display)]">
                  No workouts in the library yet. Build one at{" "}
                  <Link
                    href="/fitness/workouts/new"
                    className="text-accent hover:text-text-0 underline"
                  >
                    /fitness/workouts/new
                  </Link>
                  .
                </p>
              ) : (
                <>
                  {workouts.length > 8 && (
                    <input
                      type="search"
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                      placeholder="Filter workouts…"
                      className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
                    />
                  )}
                  <div className="flex flex-col gap-1">
                    {workouts
                      .filter((w) =>
                        libraryQuery
                          ? `${w.name} ${w.default_kind ?? ""}`
                              .toLowerCase()
                              .includes(libraryQuery.toLowerCase())
                          : true,
                      )
                      .map((w) => {
                        const active = pickedWorkoutId === w.id;
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => setPickedWorkoutId(w.id)}
                            className={`text-left rounded-sm px-3 py-2 flex items-center gap-2 transition-colors ${
                              active
                                ? "bg-accent/15 ring-1 ring-accent/40"
                                : "bg-ink-2/40 hover:bg-ink-2"
                            }`}
                          >
                            <span aria-hidden>
                              {w.default_kind ? KIND_ICON[w.default_kind] : "·"}
                            </span>
                            <span className="text-sm text-text-0 flex-1 truncate">
                              {w.name}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                              {w.exercise_count ?? "·"} ex
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="card-eyebrow">Kind</span>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_KINDS.map((k) => {
                  const active = kind === k;
                  const kv = KIND_VISUALS[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] border transition-colors flex items-center gap-1.5 ${
                        active
                          ? `${kv.bgClass} ${kv.textClass} ${kv.borderClass}`
                          : "border-ink-2 text-ink-3 hover:text-ink-4 hover:border-ink-3"
                      }`}
                    >
                      <span aria-hidden>{kv.icon}</span>
                      {kv.label.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="card-eyebrow">Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="leave blank to use the default"
              className="bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 placeholder:italic px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
            />
          </label>

          {types.length > 0 && (
            <SessionTypeSelect
              types={types}
              value={sessionType}
              onChange={setSessionType}
              onTypesUpdated={setTypes}
            />
          )}

          {error && (
            <p className="text-xs text-error font-[family-name:var(--font-mono)]">
              {error}
            </p>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-ink-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-sm border border-ink-4 text-text-1 text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] hover:text-text-0 hover:bg-ink-2"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              triggerGlowPulse(e.currentTarget);
              void submit();
            }}
            className="flex-[2] h-12 rounded-sm bg-glow-2 text-text-0 hover:bg-glow-1 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-[family-name:var(--font-mono)] tracking-[0.18em]"
          >
            {busy ? "ADDING…" : "ADD"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Session type dropdown. Sorts known types alphabetically by label and
 * appends a "+ Other custom…" sentinel. Picking the sentinel reveals
 * an inline input that POSTs to /api/fitness/session-types and
 * immediately selects the freshly-created type.
 */
function SessionTypeSelect({
  types,
  value,
  onChange,
  onTypesUpdated,
}: {
  types: WorkoutSessionType[];
  value: string;
  onChange: (next: string) => void;
  onTypesUpdated: (next: WorkoutSessionType[]) => void;
}) {
  const CUSTOM_SENTINEL = "__custom__";
  const sorted = [...types].sort((a, b) => a.label.localeCompare(b.label));
  const [customMode, setCustomMode] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCustom() {
    const label = customLabel.trim();
    if (!label || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/fitness/session-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        type?: WorkoutSessionType;
        error?: string;
      };
      if (!r.ok || !j.type) {
        setError(j.error ?? "Could not create type");
        return;
      }
      onTypesUpdated([...types, j.type]);
      onChange(j.type.type_key);
      setCustomMode(false);
      setCustomLabel("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="card-eyebrow">Session type (optional)</span>
      <select
        value={customMode ? CUSTOM_SENTINEL : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CUSTOM_SENTINEL) {
            setCustomMode(true);
            return;
          }
          setCustomMode(false);
          onChange(v);
        }}
        className="bg-ink-2 rounded-sm text-sm text-text-0 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
      >
        <option value="">—</option>
        {sorted.map((t) => (
          <option key={t.id} value={t.type_key}>
            {t.label}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>+ Other custom…</option>
      </select>
      {customMode && (
        <div className="flex items-center gap-2 mt-2">
          <input
            autoFocus
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void createCustom();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setCustomMode(false);
                setCustomLabel("");
              }
            }}
            placeholder="e.g. Tennis, Yoga"
            className="flex-1 bg-ink-2 rounded-sm text-sm text-text-0 placeholder:text-text-3 px-3 py-2 outline outline-1 outline-transparent focus:outline-glow-2"
          />
          <button
            type="button"
            onClick={() => void createCustom()}
            disabled={!customLabel.trim() || submitting}
            className="px-3 py-2 rounded-sm bg-accent/15 border border-accent/40 text-accent text-[11px] font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
          >
            {submitting ? "…" : "ADD"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomMode(false);
              setCustomLabel("");
            }}
            className="text-ink-3 hover:text-ink-4 text-sm"
            aria-label="Cancel"
          >
            ×
          </button>
        </div>
      )}
      {error && (
        <p className="text-[11px] uppercase tracking-[0.18em] text-danger font-[family-name:var(--font-mono)] mt-1">
          ⚠ {error}
        </p>
      )}
    </label>
  );
}
