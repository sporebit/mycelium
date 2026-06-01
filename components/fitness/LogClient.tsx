"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mono } from "@/components/dashboard/Mono";
import type {
  LastSession,
  LoggedSet,
  SessionDetail,
  SessionExercise,
  WeightUnit,
} from "@/lib/fitness/types";
import { RestTimer } from "./RestTimer";
import { FinishModal } from "./FinishModal";
import { PainLogModal } from "./PainLogModal";
import { ReorderableExerciseList } from "./ReorderableExerciseList";
import { targetForDisplay, topSet } from "@/lib/fitness/progression";
import { triggerGlowPulse } from "@/lib/motion";
import { localDateKey } from "@/lib/util/date";
import {
  FEEL_EMOJI,
  formatRegion,
  formatSeverity,
  summarizeBaseline,
} from "@/lib/fitness/pain";
import type {
  ExerciseBaseline,
  ExercisePainLog,
  WorkoutSessionType,
} from "@/lib/fitness/types";

const UNITS: WeightUnit[] = ["kg", "lbs", "stone"];
const UNIT_LABEL: Record<WeightUnit, string> = { kg: "KG", lbs: "LBS", stone: "ST" };

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function localNowForDatetimeInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToISO(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fmtDurationMinutes(totalMin: number): string {
  const t = Math.max(0, totalMin);
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}`;
  return String(m);
}

function parseDurationMinutes(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":");
    if (parts.length !== 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || m < 0 || m >= 60) return null;
    return Math.round(h * 60 + m);
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function usesSetsGrid(ex: SessionExercise): boolean {
  // data_shape is authoritative when present (Phase 2+). Legacy rows fall
  // back to the previous heuristic.
  const shape = ex.data_shape ?? ex.template?.data_shape ?? null;
  if (shape === "sets_reps") return true;
  if (shape === "hold") return true; // hold uses a per-set numeric input column
  if (shape === "duration" || shape === "distance") return false;
  const def = ex.template?.default_sets ?? null;
  if (def !== null && def > 0) return true;
  if (def !== null && def === 0) return false;
  return !ex.duration_min;
}

/** Which input mode the current exercise needs. */
function dataShapeOf(ex: SessionExercise): "sets_reps" | "hold" | "duration" | "distance" {
  const s = ex.data_shape ?? ex.template?.data_shape;
  if (s === "hold" || s === "duration" || s === "distance" || s === "sets_reps") {
    return s;
  }
  // Legacy inference
  if (ex.template?.default_duration_min && !(ex.template?.default_sets ?? 0)) {
    return "duration";
  }
  return "sets_reps";
}

/** Weight column is always shown for sets_reps / hold exercises. The
 *  previous heuristic hid the column for custom (no-template) rows,
 *  which broke logging weight on ad-hoc exercises like "EZ Bar Curl
 *  10/10/8". Empty values just render as "—" (or "BW" when the
 *  exercise is bodyweight). The cardio "duration"/"distance" shapes
 *  use a different grid via `dataShapeOf`, so they're unaffected. */
function showsWeightColumn(_ex: SessionExercise): boolean {
  return true;
}

/** True when the exercise should be treated as bodyweight — the
 *  weight column header becomes "+ KG" and empty values render as
 *  "BW". Falls back to the template's flag when the session row
 *  hasn't been touched yet. */
function isBodyweight(ex: SessionExercise): boolean {
  if (typeof ex.is_bodyweight === "boolean") return ex.is_bodyweight;
  if (typeof ex.template?.is_bodyweight === "boolean") {
    return ex.template.is_bodyweight;
  }
  return false;
}

/** Print a rounded target weight without trailing zeros. */
function formatTargetNumber(w: number): string {
  if (Number.isInteger(w)) return String(w);
  // 2.5-step rounding can leave a single decimal; trim trailing zeros.
  return w
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

/**
 * Initial visible set_numbers when nothing's been added/removed yet.
 * Merges the prescribed-row count with any historical logged numbers so we
 * never hide a row the DB already knows about.
 */
function defaultVisibleSets(ex: SessionExercise): number[] {
  const def = ex.template?.default_sets ?? null;
  const baseCount = def && def > 0 ? def : 3;
  const out = new Set<number>();
  for (let i = 1; i <= baseCount; i++) out.add(i);
  for (const s of ex.sets ?? []) out.add(s.set_number);
  return Array.from(out).sort((a, b) => a - b);
}

function targetLine(ex: SessionExercise): string {
  const t = ex.template;
  const parts: string[] = [];
  if (t?.default_sets && t.default_sets > 0) {
    parts.push(`${t.default_sets} × ${t.default_reps ?? "?"}`);
    if (t.default_weight != null) {
      parts.push(`${t.default_weight}${t.default_weight_unit ?? "kg"}`);
    }
    if (t.rest_seconds) parts.push(`${t.rest_seconds}s rest`);
  } else if (t?.default_duration_min) {
    parts.push(`${t.default_duration_min} min`);
    if (t.default_intensity) parts.push(t.default_intensity);
    if (t.default_distance_km) parts.push(`${t.default_distance_km} km`);
  } else {
    if (ex.duration_min) parts.push(`${ex.duration_min} min`);
  }
  return parts.join(" · ");
}

type Toast = { kind: "ok" | "error"; text: string } | null;

export function LogClient({ initial }: { initial: SessionDetail }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [lastByEx, setLastByEx] = useState<Record<string, LastSession>>({});
  const [unitByEx, setUnitByEx] = useState<Record<string, WeightUnit>>(() => {
    // Lazy init from localStorage so we don't need an effect-setstate roundtrip.
    if (typeof window === "undefined") return {};
    const out: Record<string, WeightUnit> = {};
    for (const ex of initial.exercises) {
      const key = `mycelium.fitness.unit.${ex.programme_exercise_id ?? ex.id}`;
      try {
        const v = localStorage.getItem(key);
        if (v === "kg" || v === "lbs" || v === "stone") out[ex.id] = v;
      } catch {
        /* SSR / private mode */
      }
    }
    return out;
  });
  const [toast, setToast] = useState<Toast>(null);
  const [showFinish, setShowFinish] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTimeEdit, setShowTimeEdit] = useState(false);
  const [ageBannerDismissed, setAgeBannerDismissed] = useState(false);
  const [completeAtInput, setCompleteAtInput] = useState<string>(() =>
    localNowForDatetimeInput()
  );
  const [elapsed, setElapsed] = useState<number>(0);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedFlash, setSavedFlash] = useState(false);
  const [visibleSetsByEx, setVisibleSetsByEx] = useState<
    Record<string, number[]>
  >({});
  const [restMeta, setRestMeta] = useState<{
    exerciseName?: string;
    setNumber?: number;
    totalSets?: number;
  } | null>(null);
  const [baselinesByName, setBaselinesByName] = useState<
    Record<string, ExerciseBaseline>
  >({});
  const [painLogsByExId, setPainLogsByExId] = useState<
    Record<string, ExercisePainLog>
  >({});
  /** Session-level pain note (session_exercise_id = null). Lives
   *  in its own slot so the "Session pain notes" section at the foot
   *  of the page doesn't have to filter the exercise map. */
  const [sessionPainLog, setSessionPainLog] = useState<ExercisePainLog | null>(
    null,
  );
  /** painModalFor holds a session_exercise_id OR the sentinel
   *  "__session__" when the user opened the session-level modal. */
  const [painModalFor, setPainModalFor] = useState<string | null>(null);
  // Flash markers: keys "<exId>:<setNumber>" that just appeared via polling.
  const [flashSetKeys, setFlashSetKeys] = useState<Set<string>>(new Set());
  const [typeLabel, setTypeLabel] = useState<string | null>(null);
  const weightInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const readOnly = !!session.completed_at;

  // Ordered exercises (snapshot already ordered by position)
  const exercises = session.exercises;

  // The "current" exercise — first non-completed, non-skipped (or whatever the user tapped)
  const current = useMemo<SessionExercise | null>(() => {
    if (activeId) {
      const found = exercises.find((e) => e.id === activeId);
      if (found) return found;
    }
    return (
      exercises.find((e) => !e.completed_at && !e.skipped) ??
      exercises[0] ??
      null
    );
  }, [activeId, exercises]);

  // ---------------------------------------------------------------------------
  // Elapsed clock
  useEffect(() => {
    if (readOnly) return;
    const startedAt = session.started_at
      ? new Date(session.started_at).getTime()
      : Date.now();
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.started_at, readOnly]);

  // ---------------------------------------------------------------------------
  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // Saved-flash auto-dismiss
  useEffect(() => {
    if (!savedFlash) return;
    const id = setTimeout(() => setSavedFlash(false), 900);
    return () => clearTimeout(id);
  }, [savedFlash]);

  function setUnitFor(ex: SessionExercise, unit: WeightUnit) {
    setUnitByEx((prev) => ({ ...prev, [ex.id]: unit }));
    try {
      const key = `mycelium.fitness.unit.${ex.programme_exercise_id ?? ex.id}`;
      localStorage.setItem(key, unit);
    } catch {
      /* ignore */
    }
  }

  function unitFor(ex: SessionExercise): WeightUnit {
    return (
      unitByEx[ex.id] ??
      (ex.template?.default_weight_unit as WeightUnit | undefined) ??
      "kg"
    );
  }

  function getVisibleSets(ex: SessionExercise): number[] {
    return visibleSetsByEx[ex.id] ?? defaultVisibleSets(ex);
  }

  function addVisibleSet(ex: SessionExercise) {
    if (readOnly) return;
    setVisibleSetsByEx((prev) => {
      const cur = prev[ex.id] ?? defaultVisibleSets(ex);
      const max = cur.length === 0 ? 0 : cur[cur.length - 1];
      return { ...prev, [ex.id]: [...cur, max + 1] };
    });
  }

  async function removeVisibleSet(ex: SessionExercise, setNumber: number) {
    if (readOnly) return;
    const logged = (ex.sets ?? []).find(
      (s) => s.set_number === setNumber && s.completed_at
    );
    if (logged) {
      const ok = window.confirm(
        `Delete set ${setNumber}? This will remove the logged weight/reps.`
      );
      if (!ok) return;
      noteSaving("saving");
      const r = await fetch(
        `/api/fitness/sessions/${session.id}/exercises/${ex.id}/sets/${setNumber}`,
        { method: "DELETE" }
      );
      if (!r.ok) {
        noteSaving("error");
        setToast({ kind: "error", text: "Could not delete set" });
        return;
      }
      await reload();
      noteSaving("saved");
    }
    setVisibleSetsByEx((prev) => {
      const cur = prev[ex.id] ?? defaultVisibleSets(ex);
      return { ...prev, [ex.id]: cur.filter((n) => n !== setNumber) };
    });
    setInputDraft((prev) => {
      const out = { ...prev };
      delete out[setKey(ex.id, setNumber, "w")];
      delete out[setKey(ex.id, setNumber, "r")];
      return out;
    });
  }

  // Resolve session_type to a label (once, when session.session_type is set)
  useEffect(() => {
    if (!session.session_type) {
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/fitness/session-types", { cache: "no-store" });
      if (!r.ok || cancelled) return;
      const j = (await r.json()) as { types: WorkoutSessionType[] };
      const found = (j.types ?? []).find(
        (t) => t.type_key === session.session_type
      );
      if (!cancelled) setTypeLabel(found?.label ?? session.session_type);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.session_type]);

  // ---------------------------------------------------------------------------
  // Baselines + pain logs (once on mount). Baselines are fetched as a whole
  // list so we can look up by name regardless of which exercises are present.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/fitness/baselines", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { baselines: ExerciseBaseline[] };
        if (cancelled) return;
        const map: Record<string, ExerciseBaseline> = {};
        for (const b of j.baselines ?? []) {
          map[b.exercise_name.toLowerCase()] = b;
        }
        setBaselinesByName(map);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/fitness/pain-logs?session_id=${session.id}`,
          { cache: "no-store" }
        );
        if (!r.ok || cancelled) return;
        const j = (await r.json()) as { pain_logs: ExercisePainLog[] };
        if (cancelled) return;
        const map: Record<string, ExercisePainLog> = {};
        let sessionLevel: ExercisePainLog | null = null;
        for (const l of j.pain_logs ?? []) {
          if (l.session_exercise_id) {
            map[l.session_exercise_id] = l;
          } else {
            sessionLevel = l;
          }
        }
        setPainLogsByExId(map);
        setSessionPainLog(sessionLevel);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  // ---------------------------------------------------------------------------
  // Last-session lookup (in parallel, once on mount)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = exercises
        .map((e) => e.programme_exercise_id)
        .filter((x): x is string => !!x);
      const out: Record<string, LastSession> = {};
      await Promise.all(
        ids.map(async (pid) => {
          try {
            const r = await fetch(`/api/fitness/last-session/${pid}`, {
              cache: "no-store",
            });
            if (!r.ok) return;
            const j = (await r.json()) as { last: LastSession };
            if (j.last) {
              const target = exercises.find((e) => e.programme_exercise_id === pid);
              if (target) out[target.id] = j.last;
            }
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setLastByEx(out);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Server helpers
  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/fitness/sessions/${session.id}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as { session: SessionDetail };
      setSession(j.session);
    } catch {
      /* ignore */
    }
  }, [session.id]);

  /**
   * Polling-aware reload: compares incoming set list with current and flashes
   * any newly-appeared sets. Also refetches pain logs to catch voice-driven
   * additions arriving from /api/capture-audio while the page is open.
   */
  const pollReload = useCallback(async () => {
    try {
      const r = await fetch(`/api/fitness/sessions/${session.id}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = (await r.json()) as { session: SessionDetail };
      const next = j.session;

      // Diff sets — only flag rows the server now has that we didn't.
      const oldKeys = new Set<string>();
      for (const ex of session.exercises) {
        for (const s of ex.sets ?? []) {
          if (s.completed_at) oldKeys.add(`${ex.id}:${s.set_number}`);
        }
      }
      const newlyLogged: string[] = [];
      for (const ex of next.exercises) {
        for (const s of ex.sets ?? []) {
          if (!s.completed_at) continue;
          const key = `${ex.id}:${s.set_number}`;
          if (!oldKeys.has(key)) newlyLogged.push(key);
        }
      }
      setSession(next);
      if (newlyLogged.length > 0) {
        setFlashSetKeys((prev) => new Set([...prev, ...newlyLogged]));
        setTimeout(() => {
          setFlashSetKeys((prev) => {
            const out = new Set(prev);
            for (const k of newlyLogged) out.delete(k);
            return out;
          });
        }, 2000);
      }

      // Also refresh pain logs (exercise-level + the session-level row).
      const pr = await fetch(
        `/api/fitness/pain-logs?session_id=${session.id}`,
        { cache: "no-store" }
      );
      if (pr.ok) {
        const pj = (await pr.json()) as { pain_logs: ExercisePainLog[] };
        const map: Record<string, ExercisePainLog> = {};
        let sessionLevel: ExercisePainLog | null = null;
        for (const l of pj.pain_logs ?? []) {
          if (l.session_exercise_id) {
            map[l.session_exercise_id] = l;
          } else {
            sessionLevel = l;
          }
        }
        setPainLogsByExId(map);
        setSessionPainLog(sessionLevel);
      }
    } catch {
      /* ignore */
    }
  }, [session.id, session.exercises]);

  // 30-second polling — only fires when the tab is visible and no rest
  // timer overlay is showing (we don't want to distract during rest).
  useEffect(() => {
    if (readOnly) return;
    if (restEndsAt !== null) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      void pollReload();
    }, 30_000);
    return () => clearInterval(id);
  }, [readOnly, restEndsAt, pollReload]);

  function noteSaving(state: "saving" | "saved" | "error") {
    setSaving(state);
    if (state === "saved") {
      setSavedFlash(true);
      setTimeout(() => setSaving("idle"), 700);
    }
  }

  // ---------------------------------------------------------------------------
  // SETS — log / un-log
  async function toggleSetDone(ex: SessionExercise, setNumber: number) {
    if (readOnly) return;
    const existing = (ex.sets ?? []).find((s) => s.set_number === setNumber);
    if (existing && existing.completed_at) {
      // un-log
      noteSaving("saving");
      const r = await fetch(
        `/api/fitness/sessions/${session.id}/exercises/${ex.id}/sets/${setNumber}`,
        { method: "DELETE" }
      );
      if (r.ok) {
        await reload();
        noteSaving("saved");
      } else {
        noteSaving("error");
        setToast({ kind: "error", text: "Could not un-log set" });
      }
      return;
    }

    // Read inputs from refs/state
    const wKey = setKey(ex.id, setNumber, "w");
    const rKey = setKey(ex.id, setNumber, "r");
    const weightRaw = inputDraft[wKey] ?? "";
    const repsRaw = inputDraft[rKey] ?? "";
    const weight = weightRaw === "" ? null : Number(weightRaw);
    const repsOrHold = repsRaw === "" ? null : Number(repsRaw);
    const unit = unitFor(ex);
    const shape = ex.data_shape ?? ex.template?.data_shape ?? "sets_reps";
    const isHold = shape === "hold";

    noteSaving("saving");
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}/sets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          set_number: setNumber,
          weight,
          // For hold-shaped exercises, the "reps" column input is interpreted
          // as seconds and stored on hold_seconds. Leave reps null so the
          // history aggregator can tell them apart.
          reps: isHold ? null : repsOrHold,
          hold_seconds: isHold ? repsOrHold : null,
          unit,
        }),
      }
    );
    if (!r.ok) {
      noteSaving("error");
      setToast({ kind: "error", text: "Save failed — check connection" });
      return;
    }
    // Start a new rest timer (auto-stops any running one because endsAt resets)
    const restSec = ex.rest_seconds ?? 90;
    const visible = getVisibleSets(ex);
    const displayedIndex = visible.indexOf(setNumber);
    setRestMeta({
      exerciseName: ex.name,
      setNumber: displayedIndex >= 0 ? displayedIndex + 1 : undefined,
      totalSets: visible.length,
    });
    // eslint-disable-next-line react-hooks/purity -- timestamp captured inside async callback, not render
    setRestEndsAt(Date.now() + restSec * 1000);
    await reload();
    noteSaving("saved");

    // Auto-focus next un-logged weight input (the row directly after this one)
    const nextNum = visible[displayedIndex + 1];
    if (nextNum !== undefined) {
      setTimeout(() => {
        const nextKey = setKey(ex.id, nextNum, "w");
        weightInputRefs.current[nextKey]?.focus();
      }, 50);
    }
  }

  // ---------------------------------------------------------------------------
  // Local input draft state — avoids a controlled-input round-trip per keystroke.
  function setKey(exId: string, setNumber: number, field: "w" | "r"): string {
    return `${exId}:${setNumber}:${field}`;
  }
  const [inputDraft, setInputDraft] = useState<Record<string, string>>(() => {
    // Seed from already-logged sets so the inputs show the saved values.
    const out: Record<string, string> = {};
    for (const ex of initial.exercises) {
      for (const s of ex.sets ?? []) {
        if (!s.completed_at) continue;
        if (s.weight != null) out[setKey(ex.id, s.set_number, "w")] = String(s.weight);
        if (s.reps != null) out[setKey(ex.id, s.set_number, "r")] = String(s.reps);
      }
    }
    return out;
  });

  // Ad-hoc exercises start with no logged sets, so they don't need draft
  // seeding. Drafts for prescribed sets are seeded once via the useState
  // initializer above.

  // ---------------------------------------------------------------------------
  // EXERCISE-LEVEL
  async function markExerciseDone(ex: SessionExercise) {
    if (readOnly) return;
    noteSaving("saving");
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      }
    );
    if (!r.ok) {
      noteSaving("error");
      return;
    }
    await reload();
    noteSaving("saved");
    // advance to next pending
    const idx = exercises.findIndex((e) => e.id === ex.id);
    const next = exercises.slice(idx + 1).find((e) => !e.completed_at && !e.skipped);
    setActiveId(next?.id ?? null);
  }

  async function skipExercise(ex: SessionExercise) {
    if (readOnly) return;
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}/skip`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipped: true }),
      }
    );
    if (r.ok) {
      await reload();
      setToast({ kind: "ok", text: "Skipped" });
      const idx = exercises.findIndex((e) => e.id === ex.id);
      const next = exercises.slice(idx + 1).find((e) => !e.completed_at && !e.skipped);
      setActiveId(next?.id ?? null);
    } else setToast({ kind: "error", text: "Skip failed" });
  }

  async function removeExercise(ex: SessionExercise) {
    if (readOnly) return;
    if (!window.confirm(`Remove "${ex.name}" from today?`)) return;
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      { method: "DELETE" }
    );
    if (r.ok) {
      await reload();
      setToast({ kind: "ok", text: "Removed" });
    } else setToast({ kind: "error", text: "Remove failed" });
  }

  function scheduleCommentSave(ex: SessionExercise, value: string) {
    const key = `cmt:${ex.id}`;
    if (commentTimers.current[key]) clearTimeout(commentTimers.current[key]);
    commentTimers.current[key] = setTimeout(async () => {
      noteSaving("saving");
      const r = await fetch(
        `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: value || null }),
        }
      );
      noteSaving(r.ok ? "saved" : "error");
      if (r.ok) await reload();
    }, 500);
  }

  async function toggleSaveToTemplate(ex: SessionExercise) {
    if (readOnly) return;
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save_to_template: !ex.save_to_template }),
      }
    );
    if (r.ok) await reload();
  }

  /** Flip is_bodyweight on the selected exercise. Optimistic — we
   *  update local state immediately so the BW chip + column header
   *  flip without waiting on the PATCH round-trip. */
  async function toggleBodyweight(ex: SessionExercise, next: boolean) {
    if (readOnly) return;
    setSession((cur) => ({
      ...cur,
      exercises: cur.exercises.map((e) =>
        e.id === ex.id ? { ...e, is_bodyweight: next } : e,
      ),
    }));
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bodyweight: next }),
      },
    );
    if (!r.ok) {
      // Roll back on failure so the UI matches the server.
      setSession((cur) => ({
        ...cur,
        exercises: cur.exercises.map((e) =>
          e.id === ex.id ? { ...e, is_bodyweight: !next } : e,
        ),
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // DURATION-mode "DONE": save duration_min/distance_km/intensity + completed_at
  async function logDuration(
    ex: SessionExercise,
    fields: {
      duration_min: number | null;
      distance_km: number | null;
      intensity: string | null;
    }
  ) {
    if (readOnly) return;
    noteSaving("saving");
    const r = await fetch(
      `/api/fitness/sessions/${session.id}/exercises/${ex.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          completed_at: new Date().toISOString(),
        }),
      }
    );
    if (!r.ok) {
      noteSaving("error");
      return;
    }
    await reload();
    noteSaving("saved");
    const idx = exercises.findIndex((e) => e.id === ex.id);
    const next = exercises.slice(idx + 1).find((e) => !e.completed_at && !e.skipped);
    setActiveId(next?.id ?? null);
  }

  // ---------------------------------------------------------------------------
  // SESSION-LEVEL
  async function abandonSession() {
    if (
      !window.confirm(
        "Mark this session as abandoned? Any logged sets are kept; the session will be marked abandoned in history.",
      )
    ) {
      return;
    }
    const r = await fetch(`/api/fitness/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "abandoned" }),
    });
    if (r.ok) router.push("/fitness");
    else setToast({ kind: "error", text: "Abandon failed" });
  }

  async function finishSession(args: {
    calories: number | null;
    notes: string | null;
    apply_template_updates: boolean;
  }) {
    const r = await fetch(`/api/fitness/sessions/${session.id}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (r.ok) router.push("/fitness?finished=1");
    else setToast({ kind: "error", text: "Finish failed" });
  }

  async function saveTimeEdit(next: {
    started_at: string | null;
    completed_at: string | null;
  }) {
    noteSaving("saving");
    const r = await fetch(`/api/fitness/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!r.ok) {
      noteSaving("error");
      setToast({ kind: "error", text: "Could not update time" });
      return;
    }
    await reload();
    noteSaving("saved");
    setShowTimeEdit(false);
    setToast({ kind: "ok", text: "Time updated" });
  }

  async function markYesterdayComplete() {
    const completedAt = completeAtInput
      ? new Date(completeAtInput).toISOString()
      : new Date().toISOString();
    const r = await fetch(`/api/fitness/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: completedAt }),
    });
    if (r.ok) router.push("/fitness");
  }

  // ---------------------------------------------------------------------------
  // Stats for header
  const elapsedForDisplay = useMemo(() => {
    if (!session.started_at) return readOnly ? 0 : elapsed;
    const startMs = new Date(session.started_at).getTime();
    if (session.completed_at) {
      return new Date(session.completed_at).getTime() - startMs;
    }
    return elapsed;
  }, [session.started_at, session.completed_at, elapsed, readOnly]);

  const completedCount = exercises.filter((e) => e.completed_at || e.skipped).length;
  const hasAnyLoggedSet = useMemo(
    () => exercises.some((e) => (e.sets ?? []).some((s) => s.completed_at)),
    [exercises]
  );

  const todayKey = localDateKey();
  const isStale =
    !readOnly &&
    !ageBannerDismissed &&
    session.date < todayKey;
  // status='attempted' is set by the today/sessions GET endpoints when
  // an active session has sat past 48h; the banner is informational —
  // logging stays enabled (readOnly is still gated by completed_at).
  const isAttempted = session.status === "attempted";

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen pb-32 sm:pb-24" data-readonly={readOnly}>
      <div className="max-w-[600px] mx-auto px-3 sm:px-4">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2 bg-ink-0/95 backdrop-blur-xl border-b border-ink-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/fitness")}
            className="text-ink-3 hover:text-ink-4 text-sm font-[family-name:var(--font-mono)]"
            aria-label="Back"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink-4 truncate">
              {session.name ?? "Session"}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] flex items-center gap-2">
              <span>{session.slot}</span>
              {typeLabel && (
                <>
                  <span>·</span>
                  <span>{typeLabel}</span>
                </>
              )}
              <span>·</span>
              <button
                type="button"
                onClick={() => setShowTimeEdit(true)}
                className="hover:text-ink-4 hover:underline underline-offset-2 transition-colors"
                aria-label="Edit session time"
              >
                <Mono>{fmtElapsed(elapsedForDisplay)}</Mono>
              </button>
              <span>·</span>
              <span>
                {completedCount}/{exercises.length}
              </span>
              {savedFlash && (
                <span className="text-ok ml-1" aria-live="polite">
                  ✓
                </span>
              )}
              {saving === "error" && (
                <span className="text-danger ml-1">⚠</span>
              )}
              {readOnly && (
                <span className="text-ok ml-1">✓ COMPLETED</span>
              )}
            </div>
          </div>
          {!readOnly && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((v) => !v)}
                className="h-10 w-10 rounded-md border border-ink-2 text-ink-3 hover:text-ink-4"
                aria-label="Menu"
              >
                ⋮
              </button>
              {showMenu && (
                <div
                  className="absolute right-0 top-12 w-56 bg-ink-1 border border-ink-2 rounded-md shadow-2xl z-40 flex flex-col py-1"
                  onMouseLeave={() => setShowMenu(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      void abandonSession();
                    }}
                    className="px-3 py-2 text-left text-sm text-danger hover:bg-ink-2/30"
                  >
                    Abandon session
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Attempted banner — only when the lifecycle status is
            attempted *and* the session isn't already finished. */}
        {isAttempted && !readOnly && (
          <div className="my-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-ink-4">
            <div className="font-[family-name:var(--font-display)] italic">
              This session was marked as attempted — it started 48+ hours ago
              and was never completed. You can still log sets or mark it
              complete.
            </div>
          </div>
        )}

        {/* Yesterday-banner */}
        {isStale && (
          <div className="my-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-ink-4">
            <div className="font-[family-name:var(--font-display)] italic mb-2">
              This session is from {session.date}. Mark complete or start fresh?
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={completeAtInput}
                onChange={(e) => setCompleteAtInput(e.target.value)}
                aria-label="Completed at"
                className="bg-ink-0/40 border border-ink-2 rounded-md text-[11px] text-ink-4 px-2 py-1 font-[family-name:var(--font-mono)] tracking-[0.05em] outline-none focus:border-ink-3"
              />
              <button
                type="button"
                onClick={() => void markYesterdayComplete()}
                className="px-2 py-1 rounded-md border border-ok/40 text-ok text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em]"
              >
                MARK COMPLETE
              </button>
              <button
                type="button"
                onClick={() => setAgeBannerDismissed(true)}
                className="px-2 py-1 rounded-md border border-ink-2 text-ink-3 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em]"
              >
                CONTINUE
              </button>
              <button
                type="button"
                onClick={() => void abandonSession()}
                className="px-2 py-1 rounded-md border border-danger/40 text-danger text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em]"
              >
                DISCARD
              </button>
            </div>
          </div>
        )}

        {/* CURRENT EXERCISE */}
        {current && (
          <CurrentExerciseCard
            ex={current}
            readOnly={readOnly}
            unit={unitFor(current)}
            setUnit={(u) => setUnitFor(current, u)}
            onToggleBodyweight={toggleBodyweight}
            last={lastByEx[current.id] ?? null}
            inputDraft={inputDraft}
            setInputDraft={setInputDraft}
            weightInputRefs={weightInputRefs}
            onToggleSet={toggleSetDone}
            onDone={markExerciseDone}
            onSkip={skipExercise}
            onCommentChange={scheduleCommentSave}
            onToggleSaveToTemplate={toggleSaveToTemplate}
            onLogDuration={logDuration}
            visibleSets={getVisibleSets(current)}
            baseline={baselinesByName[current.name.toLowerCase()] ?? null}
            painLog={painLogsByExId[current.id] ?? null}
            flashSetKeys={flashSetKeys}
            onOpenPainLog={() => setPainModalFor(current.id)}
            onAddSet={() => addVisibleSet(current)}
            onRemoveSet={(n) => void removeVisibleSet(current, n)}
            onStartRest={() => {
              setRestMeta({ exerciseName: current.name });
              setRestEndsAt(Date.now() + (current.rest_seconds ?? 90) * 1000);
            }}
            restActive={restEndsAt !== null}
          />
        )}

        {/* REMAINING LIST */}
        <div className="mt-4 rounded-2xl border border-ink-2 bg-ink-1/60">
          <div className="px-3 py-2 border-b border-ink-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
            All exercises ({exercises.length})
          </div>
          <ReorderableExerciseList
            sessionId={session.id}
            exercises={exercises}
            activeId={current?.id ?? null}
            readOnly={readOnly}
            onSelect={(exId) => setActiveId(exId)}
            onSkip={(ex) => void skipExercise(ex)}
            onRemove={(ex) => void removeExercise(ex)}
            onReorder={(next) => {
              // Optimistic: update local session.exercises with new ordering
              setSession((prev) => ({ ...prev, exercises: next }));
            }}
            onNavigateToHistory={(ex) =>
              `/fitness/history/exercise/${encodeURIComponent(ex.name)}`
            }
          />
          {!readOnly && (
            <div className="px-3 py-3 border-t border-ink-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex-1 h-11 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4 hover:border-ink-3"
              >
                + ADD EXERCISE
              </button>
              <button
                type="button"
                disabled
                title="Coming in next round"
                className="h-11 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] opacity-40 cursor-not-allowed"
              >
                🎤 VOICE
              </button>
            </div>
          )}
        </div>

        {/* SESSION PAIN NOTES — one row per session, session_exercise_id
            is null. Always rendered (read-only mode shows the saved
            note; live mode lets the user edit it). */}
        <SessionPainSection
          painLog={sessionPainLog}
          onOpen={() => setPainModalFor("__session__")}
          readOnly={readOnly}
        />

        {/* FINISH bar */}
        {!readOnly && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowFinish(true)}
              disabled={!hasAnyLoggedSet}
              className="w-full h-14 rounded-md bg-ok/15 border border-ok/40 text-ok text-sm font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-ok/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              FINISH SESSION
            </button>
          </div>
        )}
      </div>

      {/* Rest timer (full-screen overlay) */}
      {!readOnly && (
        <RestTimer
          endsAt={restEndsAt}
          exerciseName={restMeta?.exerciseName}
          setNumber={restMeta?.setNumber}
          totalSets={restMeta?.totalSets}
          onSkip={() => {
            setRestEndsAt(null);
            setRestMeta(null);
          }}
          onStop={() => {
            setRestEndsAt(null);
            setRestMeta(null);
          }}
          onAdjust={(d) =>
            setRestEndsAt((cur) => (cur == null ? null : cur + d * 1000))
          }
        />
      )}

      {/* Finish modal */}
      {showFinish && (
        <FinishModal
          session={session}
          onClose={() => setShowFinish(false)}
          onConfirm={async (args) => {
            await finishSession(args);
          }}
        />
      )}

      {/* Pain log modal */}
      {painModalFor &&
        (() => {
          // painModalFor === "__session__" → session-level note.
          // Otherwise it's a workout_session_exercises id.
          if (painModalFor === "__session__") {
            return (
              <PainLogModal
                sessionId={session.id}
                exerciseName="session"
                sessionExerciseId={null}
                baseline={null}
                existing={sessionPainLog}
                onClose={() => setPainModalFor(null)}
                onSaved={(log) => {
                  setSessionPainLog(log);
                  setPainModalFor(null);
                  setToast({ kind: "ok", text: "Logged" });
                }}
              />
            );
          }
          const ex = exercises.find((e) => e.id === painModalFor);
          if (!ex) return null;
          return (
            <PainLogModal
              sessionId={session.id}
              exerciseName={ex.name}
              sessionExerciseId={ex.id}
              baseline={baselinesByName[ex.name.toLowerCase()] ?? null}
              existing={painLogsByExId[ex.id] ?? null}
              onClose={() => setPainModalFor(null)}
              onSaved={(log) => {
                setPainLogsByExId((prev) => ({ ...prev, [ex.id]: log }));
                setPainModalFor(null);
                setToast({ kind: "ok", text: "Logged" });
              }}
            />
          );
        })()}

      {/* Time edit */}
      {showTimeEdit && (
        <TimeEditModal
          session={session}
          onClose={() => setShowTimeEdit(false)}
          onSave={saveTimeEdit}
        />
      )}

      {/* Add ad-hoc */}
      {showAdd && (
        <AddExerciseModal
          onClose={() => setShowAdd(false)}
          onCreate={async (data) => {
            const r = await fetch(
              `/api/fitness/sessions/${session.id}/exercises`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              }
            );
            if (r.ok) {
              await reload();
              setShowAdd(false);
              setToast({ kind: "ok", text: "Exercise added" });
            } else setToast({ kind: "error", text: "Add failed" });
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-md text-sm shadow-2xl font-[family-name:var(--font-mono)] ${
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

// ---------------------------------------------------------------------------
// CURRENT EXERCISE CARD — sets grid OR duration UI
// ---------------------------------------------------------------------------

function CurrentExerciseCard({
  ex,
  readOnly,
  unit,
  setUnit,
  last,
  inputDraft,
  setInputDraft,
  weightInputRefs,
  visibleSets,
  baseline,
  painLog,
  flashSetKeys,
  onOpenPainLog,
  onAddSet,
  onRemoveSet,
  onToggleSet,
  onDone,
  onSkip,
  onCommentChange,
  onToggleSaveToTemplate,
  onLogDuration,
  onStartRest,
  onToggleBodyweight,
  restActive,
}: {
  ex: SessionExercise;
  readOnly: boolean;
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
  last: LastSession | null;
  inputDraft: Record<string, string>;
  setInputDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  weightInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  visibleSets: number[];
  baseline: ExerciseBaseline | null;
  painLog: ExercisePainLog | null;
  flashSetKeys: Set<string>;
  onOpenPainLog: () => void;
  onAddSet: () => void;
  onRemoveSet: (n: number) => void;
  onToggleSet: (ex: SessionExercise, n: number) => void | Promise<void>;
  onDone: (ex: SessionExercise) => void;
  onSkip: (ex: SessionExercise) => void;
  onCommentChange: (ex: SessionExercise, value: string) => void;
  onToggleSaveToTemplate: (ex: SessionExercise) => void;
  onLogDuration: (
    ex: SessionExercise,
    fields: {
      duration_min: number | null;
      distance_km: number | null;
      intensity: string | null;
    }
  ) => void | Promise<void>;
  onStartRest: () => void;
  onToggleBodyweight: (ex: SessionExercise, next: boolean) => void;
  restActive: boolean;
}) {
  const sets = useMemo<LoggedSet[]>(() => ex.sets ?? [], [ex.sets]);
  const setsByNum = useMemo(
    () => new Map(sets.map((s) => [s.set_number, s] as const)),
    [sets]
  );
  const target = useMemo(
    () => targetForDisplay(ex.template, last, unit),
    [ex.template, last, unit]
  );
  const lastTop = useMemo(() => topSet(last), [last]);
  const grid = usesSetsGrid(ex);

  const placeholderWeight = target && target.weight > 0
    ? formatTargetNumber(target.weight)
    : null;
  const unitLower = unit === "stone" ? "st" : unit;

  const [duration, setDuration] = useState<string>(
    ex.duration_min != null ? String(ex.duration_min) : ""
  );
  const [distance, setDistance] = useState<string>(
    ex.distance_km != null ? String(ex.distance_km) : ""
  );
  const [intensity, setIntensity] = useState<string>(ex.intensity ?? "");
  const [commentDraft, setCommentDraft] = useState<string>(ex.comment ?? "");

  // Reset local draft when ex.id changes
  const lastExId = useRef<string>(ex.id);
  useEffect(() => {
    if (lastExId.current === ex.id) return;
    lastExId.current = ex.id;
    setDuration(ex.duration_min != null ? String(ex.duration_min) : "");
    setDistance(ex.distance_km != null ? String(ex.distance_km) : "");
    setIntensity(ex.intensity ?? "");
    setCommentDraft(ex.comment ?? "");
  }, [ex.id, ex.duration_min, ex.distance_km, ex.intensity, ex.comment]);

  function setKey(n: number, field: "w" | "r"): string {
    return `${ex.id}:${n}:${field}`;
  }
  function getDraft(n: number, field: "w" | "r"): string {
    return inputDraft[setKey(n, field)] ?? "";
  }
  function setDraft(n: number, field: "w" | "r", value: string) {
    setInputDraft((prev) => ({ ...prev, [setKey(n, field)]: value }));
  }

  const targets = targetLine(ex);

  return (
    <div className="mt-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-lg sm:text-xl text-ink-4 leading-tight">
            {readOnly ? (
              <Link
                href={`/fitness/history/exercise/${encodeURIComponent(ex.name)}`}
                className="hover:text-accent transition-colors"
              >
                {ex.name} <span className="text-ink-3 text-sm">→</span>
              </Link>
            ) : (
              ex.name
            )}
          </div>
          {targets && (
            <div className="text-[11px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
              {targets}
            </div>
          )}
          {grid && lastTop && (
            <div className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)] mt-1">
              Last: {lastTop.weight}
              {lastTop.unit} × {lastTop.reps}
              {last?.session_date ? ` on ${last.session_date}` : ""}
            </div>
          )}
          {ex.notes && (
            <div className="text-[11px] text-ink-3 italic font-[family-name:var(--font-display)] mt-1 leading-snug">
              {ex.notes}
            </div>
          )}
        </div>
        {grid && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onToggleBodyweight(ex, !isBodyweight(ex))}
              aria-pressed={isBodyweight(ex)}
              title={
                isBodyweight(ex)
                  ? "Bodyweight on — weight column logs added load."
                  : "Tap to mark this exercise as bodyweight."
              }
              className={`px-2 py-1.5 rounded-md border text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] transition-colors ${
                isBodyweight(ex)
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-ink-0/40 border-ink-2 text-ink-3 hover:text-ink-4"
              }`}
            >
              BW
            </button>
            <div className="flex rounded-md overflow-hidden border border-ink-2">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setUnit(u)}
                  className={`px-2 py-1.5 text-[10px] font-[family-name:var(--font-mono)] tracking-[0.15em] ${
                    unit === u
                      ? "bg-accent/20 text-accent"
                      : "text-ink-3 hover:text-ink-4"
                  }`}
                >
                  {UNIT_LABEL[u]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PAIN INDICATOR — only when there's a baseline with known issues
          or an existing log for this exercise. Always informational, never
          auto-prompts. */}
      {(baseline?.has_known_issues || painLog) && (
        <PainIndicator
          baseline={baseline}
          painLog={painLog}
          onOpen={onOpenPainLog}
          disabled={readOnly}
        />
      )}

      {grid ? (
        <div className="mt-3 flex flex-col gap-2">
          {/* TARGET RIBBON — only when a target weight exists */}
          {target && target.weight > 0 && (
            <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex flex-col items-center text-center">
              <span className="text-[10px] uppercase tracking-[0.22em] text-ink-3 font-[family-name:var(--font-mono)]">
                Target
              </span>
              <span className="text-4xl sm:text-5xl text-accent font-[family-name:var(--font-mono)] tabular-nums leading-tight mt-1">
                {formatTargetNumber(target.weight)}{" "}
                <span className="text-base align-baseline tracking-[0.1em]">
                  {unitLower}
                </span>
              </span>
              {target.delta_kg > 0 && (
                <span className="text-[11px] text-accent/80 font-[family-name:var(--font-mono)] tracking-[0.12em] mt-1">
                  ↪ +{target.delta_kg}kg from last
                </span>
              )}
            </div>
          )}

          <div
            className={`grid ${
              showsWeightColumn(ex)
                ? "grid-cols-[2rem_1fr_1fr_4.5rem_2rem]"
                : "grid-cols-[2rem_1fr_4.5rem_2rem]"
            } gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)] pl-1`}
          >
            <span>Set</span>
            {showsWeightColumn(ex) && (
              <span>{isBodyweight(ex) ? `+ ${unitLower}` : "Weight"}</span>
            )}
            <span>{dataShapeOf(ex) === "hold" ? "Seconds" : "Reps"}</span>
            <span className="text-right">Done</span>
            <span />
          </div>
          {visibleSets.map((n, i) => {
            const displayed = i + 1;
            const logged = setsByNum.get(n);
            const isLogged = !!logged?.completed_at;
            const lastForRow =
              last?.sets.find((s) => s.set_number === n) ??
              last?.sets.find((s) => s.set_number === displayed) ??
              null;
            // Weight placeholder = target if available, else last's matching set
            const weightPlaceholder = placeholderWeight
              ? placeholderWeight
              : lastForRow?.weight != null
              ? String(lastForRow.weight)
              : "";
            const repsPlaceholder =
              lastForRow?.reps != null ? String(lastForRow.reps) : "";
            const flashKey = `${ex.id}:${n}`;
            const flashing = flashSetKeys.has(flashKey);
            const showWeight = showsWeightColumn(ex);
            const bw = isBodyweight(ex);
            const isHold = dataShapeOf(ex) === "hold";
            const holdPlaceholder = isHold
              ? String(ex.template?.default_hold_seconds ?? "—")
              : repsPlaceholder || "—";
            // Bodyweight exercises with no added weight render the
            // placeholder as "BW" so the column reads naturally
            // without needing a numeric value.
            const weightFieldPlaceholder = bw
              ? weightPlaceholder || "BW"
              : weightPlaceholder || "—";
            return (
              <div
                key={n}
                className={`grid ${
                  showWeight
                    ? "grid-cols-[2rem_1fr_1fr_4.5rem_2rem]"
                    : "grid-cols-[2rem_1fr_4.5rem_2rem]"
                } gap-2 items-center rounded-md border px-1 py-1 transition-colors duration-500 ${
                  flashing
                    ? "border-ok bg-ok/30 ring-2 ring-ok/40"
                    : isLogged
                    ? "border-ok/50 bg-ok/10"
                    : "border-ink-2 bg-ink-0/30"
                }`}
              >
                <span className="text-center text-sm font-[family-name:var(--font-mono)] text-ink-3">
                  {displayed}
                </span>
                {showWeight && (
                  <input
                    ref={(el) => {
                      weightInputRefs.current[setKey(n, "w")] = el;
                    }}
                    inputMode="decimal"
                    type="text"
                    disabled={readOnly}
                    value={getDraft(n, "w")}
                    onChange={(e) =>
                      setDraft(n, "w", e.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder={weightFieldPlaceholder}
                    className="bg-transparent border border-ink-2 rounded-md text-base text-ink-4 px-2 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums min-w-0"
                  />
                )}
                <input
                  inputMode="numeric"
                  type="text"
                  disabled={readOnly}
                  value={getDraft(n, "r")}
                  onChange={(e) =>
                    setDraft(n, "r", e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder={isHold ? holdPlaceholder : repsPlaceholder || "—"}
                  className="bg-transparent border border-ink-2 rounded-md text-base text-ink-4 px-2 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums min-w-0"
                />
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={(e) => {
                    triggerGlowPulse(e.currentTarget);
                    void onToggleSet(ex, n);
                  }}
                  className={`h-10 rounded-md text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] ${
                    isLogged
                      ? "bg-ok/20 border border-ok/50 text-ok"
                      : "bg-accent/10 border border-accent/40 text-accent"
                  } disabled:opacity-40`}
                >
                  {isLogged ? "✓" : "DONE"}
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => onRemoveSet(n)}
                  aria-label={`Delete set ${displayed}`}
                  className="h-10 rounded-md text-ink-3 hover:text-danger text-base disabled:opacity-40"
                >
                  🗑
                </button>
              </div>
            );
          })}
          {!readOnly && (
            <button
              type="button"
              onClick={onAddSet}
              className="self-start mt-1 px-3 h-9 rounded-md border border-ink-2 text-ink-3 text-[11px] font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4 hover:border-ink-3"
            >
              + ADD SET
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 col-span-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Duration (min)
            </span>
            <input
              inputMode="numeric"
              type="text"
              disabled={readOnly}
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={String(ex.template?.default_duration_min ?? "—")}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Distance (km)
            </span>
            <input
              inputMode="decimal"
              type="text"
              disabled={readOnly}
              value={distance}
              onChange={(e) =>
                setDistance(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder={
                ex.template?.default_distance_km != null
                  ? String(ex.template.default_distance_km)
                  : "—"
              }
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Intensity
            </span>
            <input
              type="text"
              disabled={readOnly}
              value={intensity}
              onChange={(e) => setIntensity(e.target.value)}
              placeholder={ex.template?.default_intensity ?? "easy / moderate / hard"}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          rows={2}
          disabled={readOnly}
          value={commentDraft}
          onChange={(e) => {
            setCommentDraft(e.target.value);
            onCommentChange(ex, e.target.value);
          }}
          placeholder="How did this feel?"
          className="bg-ink-0/40 border border-ink-2 rounded-md text-sm text-ink-4 px-3 py-2 outline-none focus:border-accent resize-none"
        />
        <label className="flex items-center gap-2 text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em]">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={ex.save_to_template}
            onChange={() => onToggleSaveToTemplate(ex)}
          />
          Save changes to template
        </label>
      </div>

      {!readOnly && (
        <div className="mt-3 flex gap-2 items-center">
          {grid && !restActive && (
            <button
              type="button"
              onClick={onStartRest}
              className="h-12 px-3 rounded-md border border-ink-2 text-ink-3 text-xs font-[family-name:var(--font-mono)] tracking-[0.15em] hover:text-ink-4"
            >
              START REST
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              grid
                ? onDone(ex)
                : void onLogDuration(ex, {
                    duration_min: duration === "" ? null : Number(duration),
                    distance_km: distance === "" ? null : Number(distance),
                    intensity: intensity.trim() || null,
                  })
            }
            className="flex-1 h-12 rounded-md bg-accent/20 border border-accent/50 text-accent text-sm font-[family-name:var(--font-mono)] tracking-[0.18em] hover:bg-accent/30"
          >
            {ex.completed_at ? "✓ DONE" : "DONE — NEXT >"}
          </button>
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onSkip(ex)}
          className="mt-2 text-[11px] text-ink-3 hover:text-danger underline-offset-2 font-[family-name:var(--font-mono)] tracking-[0.1em]"
        >
          Skip this
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pain indicator — subtle, opt-in entry to the pain modal.
// ---------------------------------------------------------------------------

function PainIndicator({
  baseline,
  painLog,
  onOpen,
  disabled,
}: {
  baseline: ExerciseBaseline | null;
  painLog: ExercisePainLog | null;
  onOpen: () => void;
  disabled: boolean;
}) {
  if (painLog) {
    const emoji = painLog.feel_rating ? FEEL_EMOJI[painLog.feel_rating] : "·";
    const regions =
      painLog.pain_regions && painLog.pain_regions.length > 0
        ? painLog.pain_regions.map(formatRegion).join(", ").toLowerCase()
        : null;
    const sevPart = painLog.severity != null ? ` ${painLog.severity}/10` : "";
    const summary = [painLog.feel_rating, regions].filter(Boolean).join(" · ");
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="mt-3 w-full flex items-center gap-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-left hover:bg-ok/15 transition-colors disabled:opacity-60"
      >
        <span aria-hidden className="text-base shrink-0">
          {emoji}
        </span>
        <span className="flex-1 min-w-0 text-[11px] uppercase tracking-[0.15em] text-ok font-[family-name:var(--font-mono)] truncate">
          Logged: {summary || "—"}
          {sevPart}
        </span>
        <span className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.18em] shrink-0">
          EDIT →
        </span>
      </button>
    );
  }
  if (!baseline?.has_known_issues) return null;
  const sev = formatSeverity(baseline);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="mt-3 w-full flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-left hover:bg-warn/15 transition-colors disabled:opacity-60"
    >
      <span aria-hidden className="text-base shrink-0">
        ⚠
      </span>
      <span className="flex-1 min-w-0 text-[11px] uppercase tracking-[0.15em] text-warn font-[family-name:var(--font-mono)]">
        Known pain history
        {summarizeBaseline(baseline)
          ? `: ${summarizeBaseline(baseline)}`
          : ""}
        {sev && !summarizeBaseline(baseline).includes("typical")
          ? ` · typical ${sev}`
          : ""}
      </span>
      <span className="text-[11px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.18em] shrink-0">
        LOG →
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Time edit modal — STARTED / ENDED / DURATION with derivation rules
// ---------------------------------------------------------------------------

function TimeEditModal({
  session,
  onClose,
  onSave,
}: {
  session: SessionDetail;
  onClose: () => void;
  onSave: (next: {
    started_at: string | null;
    completed_at: string | null;
  }) => Promise<void>;
}) {
  const [startedInput, setStartedInput] = useState<string>(() =>
    session.started_at
      ? isoToDatetimeLocal(session.started_at)
      : localNowForDatetimeInput()
  );
  const [endedInput, setEndedInput] = useState<string>(() =>
    session.completed_at ? isoToDatetimeLocal(session.completed_at) : ""
  );
  const [durationInput, setDurationInput] = useState<string>(() => {
    if (!session.started_at) return "0";
    const startMs = new Date(session.started_at).getTime();
    const endMs = session.completed_at
      ? new Date(session.completed_at).getTime()
      : Date.now();
    return fmtDurationMinutes(Math.max(0, Math.round((endMs - startMs) / 60000)));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onStartedChange(v: string) {
    setStartedInput(v);
    setError(null);
    const startMs = v ? new Date(v).getTime() : NaN;
    if (!Number.isFinite(startMs)) return;
    if (endedInput) {
      const endMs = new Date(endedInput).getTime();
      if (Number.isFinite(endMs)) {
        setDurationInput(
          fmtDurationMinutes(Math.max(0, Math.round((endMs - startMs) / 60000)))
        );
      }
    } else {
      setDurationInput(
        fmtDurationMinutes(
          Math.max(0, Math.round((Date.now() - startMs) / 60000))
        )
      );
    }
  }

  function onEndedChange(v: string) {
    setEndedInput(v);
    setError(null);
    if (!v) return;
    const startMs = startedInput ? new Date(startedInput).getTime() : NaN;
    const endMs = new Date(v).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      setDurationInput(
        fmtDurationMinutes(Math.max(0, Math.round((endMs - startMs) / 60000)))
      );
    }
  }

  function onDurationChange(v: string) {
    setDurationInput(v);
    setError(null);
    const mins = parseDurationMinutes(v);
    const startMs = startedInput ? new Date(startedInput).getTime() : NaN;
    if (mins !== null && Number.isFinite(startMs)) {
      const endDate = new Date(startMs + mins * 60000);
      setEndedInput(isoToDatetimeLocal(endDate.toISOString()));
    }
  }

  async function submit() {
    setError(null);
    const startedIso = datetimeLocalToISO(startedInput);
    if (!startedIso) {
      setError("Start time is required");
      return;
    }
    const startMs = new Date(startedIso).getTime();
    if (startMs > Date.now()) {
      setError("Start can't be in the future");
      return;
    }
    let endedIso: string | null = null;
    if (endedInput.trim()) {
      endedIso = datetimeLocalToISO(endedInput);
      if (!endedIso) {
        setError("End time invalid");
        return;
      }
      const endMs = new Date(endedIso).getTime();
      if (endMs < startMs) {
        setError("End must be at or after start");
        return;
      }
      if (endMs === startMs) {
        setError("Duration must be positive");
        return;
      }
    }
    setBusy(true);
    try {
      await onSave({ started_at: startedIso, completed_at: endedIso });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-sm bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-ink-4">
            Edit time
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Started
            </span>
            <input
              type="datetime-local"
              value={startedInput}
              onChange={(e) => onStartedChange(e.target.value)}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Ended
            </span>
            <input
              type="datetime-local"
              value={endedInput}
              onChange={(e) => onEndedChange(e.target.value)}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)]"
            />
            {!session.completed_at ? (
              <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em]">
                Set to mark complete; leave blank to keep active.
              </span>
            ) : (
              <span className="text-[10px] text-ink-3 font-[family-name:var(--font-mono)] tracking-[0.1em]">
                Clear to reopen this session.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Duration (MM or HH:MM)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={durationInput}
              onChange={(e) => onDurationChange(e.target.value)}
              placeholder="45 or 1:15"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)] tabular-nums"
            />
          </label>
          {error && (
            <div className="text-danger text-[11px] font-[family-name:var(--font-mono)] tracking-[0.1em]">
              {error}
            </div>
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
            {busy ? "SAVING…" : "SAVE"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add ad-hoc exercise modal
// ---------------------------------------------------------------------------

function AddExerciseModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    rest_seconds: number;
    save_to_template: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rest, setRest] = useState("90");
  const [saveTpl, setSaveTpl] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        rest_seconds: Number(rest) || 90,
        save_to_template: saveTpl,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="growth-in w-full sm:max-w-sm bg-ink-1 border border-ink-2 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ink-2">
          <h2 className="text-lg italic font-[family-name:var(--font-display)] text-ink-4">
            Add exercise
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-4 text-xl leading-none"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Name
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lat pulldown"
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
              Rest (seconds)
            </span>
            <input
              inputMode="numeric"
              type="text"
              value={rest}
              onChange={(e) => setRest(e.target.value.replace(/[^0-9]/g, ""))}
              className="bg-ink-0/40 border border-ink-2 rounded-md text-base text-ink-4 px-3 py-2 outline-none focus:border-accent font-[family-name:var(--font-mono)]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-4">
            <input
              type="checkbox"
              checked={saveTpl}
              onChange={(e) => setSaveTpl(e.target.checked)}
            />
            Save to template
          </label>
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
            disabled={!name.trim() || busy}
            onClick={() => void submit()}
            className="flex-[2] h-12 rounded-md bg-accent/20 border border-accent/50 text-accent text-xs font-[family-name:var(--font-mono)] tracking-[0.18em] disabled:opacity-40"
          >
            {busy ? "SAVING…" : "ADD"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionPainSection — the foot-of-page block where the user logs an
// overall pain / how-it-felt note for the session as a whole. Pulls
// from sessionPainLog (session_exercise_id is null on its row).
function SessionPainSection({
  painLog,
  onOpen,
  readOnly,
}: {
  painLog: ExercisePainLog | null;
  onOpen: () => void;
  readOnly: boolean;
}) {
  const severityTone = (s: number): string => {
    if (s === 0) return "bg-ok/15 text-ok border-ok/40";
    if (s <= 3) return "bg-warn/15 text-warn border-warn/40";
    if (s <= 6) return "bg-warn/25 text-warn border-warn/60";
    return "bg-danger/15 text-danger border-danger/50";
  };
  return (
    <section className="mt-6 rounded-2xl border border-ink-2 bg-ink-1/60">
      <div className="px-3 py-2 border-b border-ink-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-3 font-[family-name:var(--font-mono)]">
          Session pain notes
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={onOpen}
            className="text-[10px] uppercase tracking-[0.18em] text-accent hover:text-text-0 font-[family-name:var(--font-mono)]"
          >
            {painLog ? "EDIT" : "+ LOG"}
          </button>
        )}
      </div>
      <div className="px-3 py-3">
        {painLog ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-mono)] px-1.5 py-0.5 rounded-md border ${severityTone(
                  painLog.severity,
                )}`}
              >
                Severity {painLog.severity}
              </span>
              {painLog.feel_rating && (
                <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                  · {painLog.feel_rating}
                </span>
              )}
              {painLog.pain_regions.length > 0 && (
                <span className="text-[10px] uppercase tracking-[0.15em] text-ink-3 font-[family-name:var(--font-mono)]">
                  · {painLog.pain_regions.join(", ")}
                </span>
              )}
            </div>
            {painLog.notes && (
              <p className="text-sm text-ink-4 whitespace-pre-wrap">
                {painLog.notes}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-ink-3 italic font-[family-name:var(--font-display)]">
            {readOnly
              ? "No session-level pain notes."
              : "Tap LOG to record how the session felt overall, or any pain that wasn't tied to a specific exercise."}
          </p>
        )}
      </div>
    </section>
  );
}
