import type { WeightUnit } from "./types";

const LBS_PER_KG = 2.20462262;
const KG_PER_LB = 0.453592;
const KG_PER_STONE = 6.35029;

export function toKg(weight: number, unit: WeightUnit): number {
  if (unit === "kg") return weight;
  if (unit === "lbs") return weight * KG_PER_LB;
  if (unit === "stone") return weight * KG_PER_STONE;
  return weight;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  if (unit === "kg") return kg;
  if (unit === "lbs") return kg * LBS_PER_KG;
  if (unit === "stone") return kg / KG_PER_STONE;
  return kg;
}

export function formatWeight(kg: number, displayUnit: WeightUnit): string {
  if (!Number.isFinite(kg)) return "—";
  if (displayUnit === "kg") return `${kg.toFixed(1)} kg`;
  if (displayUnit === "lbs") {
    return `${Math.round(kg * LBS_PER_KG)} lbs`;
  }
  // stone: convert to total lbs, then split into stones + remainder lbs.
  const totalLbs = kg * LBS_PER_KG;
  const stones = Math.floor(totalLbs / 14);
  const remainder = Math.round(totalLbs - stones * 14);
  return `${stones}st ${remainder}lb`;
}

/**
 * Format a raw weight already in a known unit (no conversion). Used when the
 * stored value's unit matches the displayed unit and we just want a label.
 */
export function formatWeightInUnit(weight: number, unit: WeightUnit): string {
  if (!Number.isFinite(weight)) return "—";
  if (unit === "kg") return `${weight.toFixed(1)} kg`;
  if (unit === "lbs") return `${Math.round(weight)} lbs`;
  if (unit === "stone") {
    const totalLbs = weight * 14;
    const stones = Math.floor(totalLbs / 14);
    const remainder = Math.round(totalLbs - stones * 14);
    return `${stones}st ${remainder}lb`;
  }
  return String(weight);
}
