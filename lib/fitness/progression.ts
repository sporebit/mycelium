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

/**
 * True if this exercise should be treated as a "heavy" lift for rounding.
 * Heuristic: prescribed weight in template ≥ 20 kg. Falls back to the
 * suggested next weight (also in kg) if there's no template default.
 */
export function isHeavyLift(
  template: TemplateExercise | null | undefined,
  suggestionKg: number | null
): boolean {
  if (template?.default_weight != null) {
    const unit = (template.default_weight_unit ?? "kg") as WeightUnit;
    return toKg(template.default_weight, unit) >= 20;
  }
  if (suggestionKg != null) return suggestionKg >= 20;
  return false;
}

/**
 * Round a target weight for display in the chosen unit:
 *   - kg/lbs heavy → nearest 2.5 (5 lb)
 *   - kg/lbs light → nearest 1
 *   - stone        → leave as-is (rare unit, hard to round meaningfully)
 */
export function roundTargetForDisplay(
  weight: number,
  unit: WeightUnit,
  heavy: boolean
): number {
  if (unit === "stone") return weight;
  if (unit === "kg") {
    return heavy ? Math.round(weight / 2.5) * 2.5 : Math.round(weight);
  }
  if (unit === "lbs") {
    return heavy ? Math.round(weight / 5) * 5 : Math.round(weight);
  }
  return weight;
}

/**
 * Returns the rounded target in the *display unit*, plus the kg delta from
 * last for the hint copy. Returns null if there's no suggestion to make.
 */
export function targetForDisplay(
  template: TemplateExercise | null | undefined,
  last: LastSession | null | undefined,
  displayUnit: WeightUnit
): { weight: number; unit: WeightUnit; delta_kg: number } | null {
  const sug = suggestNextWeight(template, last);
  if (!sug) return null;
  const sugKg = toKg(sug.weight, sug.unit);
  const heavy = isHeavyLift(template, sugKg);
  const inUnit = fromKg(sugKg, displayUnit);
  const rounded = roundTargetForDisplay(inUnit, displayUnit, heavy);
  return { weight: rounded, unit: displayUnit, delta_kg: sug.delta_kg };
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
