import { fromKg, toKg } from "./units";
import type { LastSession, TemplateExercise, WeightUnit } from "./types";

/**
 * Suggest the weight to use for the next session of a given exercise.
 *
 * Rules (matches spec):
 *   - Heavy lift (top set ≥ 10kg AND prescribed rest > 60s) → add 2.5 kg
 *   - Otherwise (light/rehab/short-rest) → match last
 *   - No prior history → return template default (if any)
 *
 * Returns null if we have no opinion (no last + no template default).
 * The returned weight is in the unit the *last set* used (or the template's
 * unit if last is null), so the UI can display it without secondary conversion.
 */
export function suggestNextWeight(
  template: TemplateExercise | null | undefined,
  last: LastSession | null | undefined
): { weight: number; unit: WeightUnit; delta_kg: number } | null {
  if (last && last.sets.length > 0) {
    const top = last.sets
      .filter((s) => typeof s.weight === "number" && s.weight !== null)
      .reduce<{ weight: number; unit: WeightUnit } | null>((acc, s) => {
        if (s.weight === null || s.weight === undefined) return acc;
        const unit: WeightUnit = (s.unit ?? "kg") as WeightUnit;
        const kg = toKg(s.weight, unit);
        if (!acc) return { weight: s.weight, unit };
        const accKg = toKg(acc.weight, acc.unit);
        return kg > accKg ? { weight: s.weight, unit } : acc;
      }, null);
    if (!top) return null;
    const topKg = toKg(top.weight, top.unit);
    const restSec = template?.rest_seconds ?? 90;
    const isHeavy = topKg >= 10 && restSec > 60;
    const deltaKg = isHeavy ? 2.5 : 0;
    const nextKg = topKg + deltaKg;
    return {
      weight: Number(fromKg(nextKg, top.unit).toFixed(2)),
      unit: top.unit,
      delta_kg: deltaKg,
    };
  }
  if (template?.default_weight != null) {
    const unit = (template.default_weight_unit ?? "kg") as WeightUnit;
    return { weight: template.default_weight, unit, delta_kg: 0 };
  }
  return null;
}

export function topSet(last: LastSession | null | undefined): {
  weight: number;
  unit: WeightUnit;
  reps: number;
} | null {
  if (!last || last.sets.length === 0) return null;
  let best: { weight: number; unit: WeightUnit; reps: number } | null = null;
  let bestKg = -Infinity;
  for (const s of last.sets) {
    if (s.weight === null || s.weight === undefined) continue;
    const unit: WeightUnit = (s.unit ?? "kg") as WeightUnit;
    const kg = toKg(s.weight, unit);
    if (kg > bestKg) {
      bestKg = kg;
      best = { weight: s.weight, unit, reps: s.reps ?? 0 };
    }
  }
  return best;
}
