import { toKg } from "./units";
import type {
  ExerciseHistoryEntry,
  ExercisePRs,
  LoggedSet,
  WeightUnit,
} from "./types";

/**
 * Return the set with the highest weight (normalised to kg internally).
 * Tiebreak by highest reps. Ignores sets with no weight logged.
 */
export function topSetForExercise(sets: LoggedSet[]): LoggedSet | null {
  let best: LoggedSet | null = null;
  let bestKg = -Infinity;
  for (const s of sets) {
    if (s.weight == null) continue;
    const unit = (s.unit ?? "kg") as WeightUnit;
    const kg = toKg(s.weight, unit);
    if (
      kg > bestKg ||
      (kg === bestKg && (s.reps ?? 0) > (best?.reps ?? 0))
    ) {
      best = s;
      bestKg = kg;
    }
  }
  return best;
}

/** Sum of (weight_kg × reps) across all sets. Sets without both fields are ignored. */
export function volumeForExercise(sets: LoggedSet[]): number {
  let total = 0;
  for (const s of sets) {
    if (s.weight == null || s.reps == null) continue;
    const unit = (s.unit ?? "kg") as WeightUnit;
    total += toKg(s.weight, unit) * s.reps;
  }
  return total;
}

/** Epley estimated 1RM. Returns null for sets that lack data. */
export function epley1RM(weight_kg: number, reps: number): number {
  if (!Number.isFinite(weight_kg) || weight_kg <= 0 || reps <= 0) return 0;
  return weight_kg * (1 + reps / 30);
}

/**
 * Raw row shape produced by the server-side join in
 * /api/fitness/exercise-history. One row per session that contains the
 * exercise, joined with its sets and the parent session's metadata.
 */
export type RawExerciseSessionRow = {
  session_exercise_id: string;
  session_id: string;
  date: string;
  slot: string;
  comment: string | null;
  notes: string | null;
  sets: LoggedSet[];
};

/**
 * Reduce a list of (session × sets) rows into one summary entry per session,
 * sorted most-recent first. PR flags are filled in by a second pass via
 * findPRs() so the caller stays in control.
 */
export function exerciseHistorySummary(
  rows: RawExerciseSessionRow[]
): ExerciseHistoryEntry[] {
  const out: ExerciseHistoryEntry[] = rows.map((r) => {
    const top = topSetForExercise(r.sets);
    const volume = volumeForExercise(r.sets);
    let topKg = 0;
    if (top?.weight != null) {
      topKg = toKg(top.weight, (top.unit ?? "kg") as WeightUnit);
    }
    return {
      id: r.session_exercise_id,
      session_id: r.session_id,
      date: r.date,
      slot: r.slot as ExerciseHistoryEntry["slot"],
      sets_logged: r.sets.filter((s) => s.completed_at).length,
      top_set:
        top && top.weight != null
          ? {
              weight: top.weight,
              reps: top.reps ?? 0,
              unit: (top.unit ?? "kg") as WeightUnit,
            }
          : null,
      volume_kg: volume,
      est_1rm_kg:
        top && top.weight != null && top.reps && top.reps > 0
          ? epley1RM(topKg, top.reps)
          : null,
      comment: r.comment,
      notes: r.notes,
      is_peak_weight_pr: false,
      is_volume_pr: false,
    };
  });
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

/** Walk history (in any order) and return the all-time peak weight + volume PRs. */
export function findPRs(history: ExerciseHistoryEntry[]): ExercisePRs {
  let peak: ExercisePRs["peak"] = null;
  let peakKg = -Infinity;
  let volume: ExercisePRs["volume"] = null;
  let volMax = -Infinity;
  for (const h of history) {
    if (h.top_set) {
      const kg = toKg(h.top_set.weight, h.top_set.unit);
      if (kg > peakKg) {
        peakKg = kg;
        peak = {
          weight_kg: kg,
          weight: h.top_set.weight,
          unit: h.top_set.unit,
          reps: h.top_set.reps,
          session_id: h.session_id,
          date: h.date,
        };
      }
    }
    if (h.volume_kg > volMax) {
      volMax = h.volume_kg;
      volume = {
        volume_kg: h.volume_kg,
        set_count: h.sets_logged,
        session_id: h.session_id,
        date: h.date,
      };
    }
  }
  return { peak, volume };
}

/**
 * Pick the "modal unit" — the unit the user uses most often. Used for axis
 * labels when sets span multiple units. Tie → kg.
 */
export function modalUnit(history: ExerciseHistoryEntry[]): WeightUnit {
  const counts: Record<WeightUnit, number> = { kg: 0, lbs: 0, stone: 0 };
  // Last 3 sessions, as the spec asks
  for (const h of history.slice(0, 3)) {
    if (!h.top_set) continue;
    counts[h.top_set.unit] += 1;
  }
  let best: WeightUnit = "kg";
  let bestN = -1;
  (["kg", "lbs", "stone"] as WeightUnit[]).forEach((u) => {
    if (counts[u] > bestN) {
      best = u;
      bestN = counts[u];
    }
  });
  return best;
}
