import type { ExerciseBaseline, FeelRating } from "./types";

/**
 * Bucketed severity → colour mapping. Returns a CSS colour value (hex)
 * because chart libraries take strings, not Tailwind classes. Mapped to
 * the Loam + Glow palette: glow-0 → warn → mid-burnt → error.
 */
export function severityToColor(severity: number | null | undefined): string {
  if (severity == null) return "#84f5b8"; // glow-0 — "no log" assumed fine
  if (severity <= 1) return "#84f5b8";    // glow-0
  if (severity <= 4) return "#f5b56d";    // warn
  if (severity <= 7) return "#e08a5f";    // between warn and error
  return "#e07a5f";                       // error
}

/** Approximate severity for charts when only a feel rating was logged. */
export function feelRatingToSeverity(rating: FeelRating | null): number {
  switch (rating) {
    case "great":
      return 0;
    case "good":
      return 1;
    case "ok":
      return 2;
    case "mild":
      return 4;
    case "moderate":
      return 6;
    case "painful":
      return 8;
    case "stopped":
      return 10;
    default:
      return 0;
  }
}

/** Pretty-print a region key as the user would say it. */
export function formatRegion(key: string): string {
  return key
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .replace(/\bIt\b/g, "IT");
}

/** Format the typical severity field. Single value if min===max. */
export function formatSeverity(b: ExerciseBaseline): string | null {
  const { typical_severity_min: lo, typical_severity_max: hi } = b;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) {
    return lo === hi ? `${lo}/10` : `${lo}-${hi}/10`;
  }
  return `${lo ?? hi}/10`;
}

/** Short one-line summary, e.g. "left shoulder, typical 4-5/10". */
export function summarizeBaseline(b: ExerciseBaseline): string {
  const parts: string[] = [];
  if (b.pain_regions && b.pain_regions.length > 0) {
    parts.push(b.pain_regions.map(formatRegion).join(", ").toLowerCase());
  }
  const sev = formatSeverity(b);
  if (sev) parts.push(`typical ${sev}`);
  return parts.join(" · ");
}

export const FEEL_OPTIONS: { value: FeelRating; emoji: string; label: string }[] = [
  { value: "great", emoji: "😀", label: "Great" },
  { value: "good", emoji: "🙂", label: "Good" },
  { value: "ok", emoji: "😐", label: "OK" },
  { value: "mild", emoji: "😬", label: "Mild" },
  { value: "moderate", emoji: "😣", label: "Moderate" },
  { value: "painful", emoji: "😖", label: "Painful" },
  { value: "stopped", emoji: "🛑", label: "Stopped" },
];

export const FEEL_EMOJI: Record<FeelRating, string> = Object.fromEntries(
  FEEL_OPTIONS.map((o) => [o.value, o.emoji])
) as Record<FeelRating, string>;

/** True when the feel rating implies discomfort the user might want to grade. */
export function feelRatingNeedsSeverity(rating: FeelRating | null): boolean {
  return rating === "mild" || rating === "moderate" || rating === "painful" || rating === "stopped";
}

/** All pain regions selectable in the modal (in display order). */
export const PAIN_REGION_OPTIONS: { key: string; label: string }[] = [
  { key: "left_shoulder", label: "Left shoulder" },
  { key: "right_shoulder", label: "Right shoulder" },
  { key: "left_scapula", label: "Left scapula" },
  { key: "right_scapula", label: "Right scapula" },
  { key: "left_elbow", label: "Left elbow" },
  { key: "right_elbow", label: "Right elbow" },
  { key: "left_wrist", label: "Left wrist" },
  { key: "right_wrist", label: "Right wrist" },
  { key: "left_forearm", label: "Left forearm" },
  { key: "right_forearm", label: "Right forearm" },
  { key: "left_bicep", label: "Left bicep" },
  { key: "right_bicep", label: "Right bicep" },
  { key: "left_trap", label: "Left trap" },
  { key: "right_trap", label: "Right trap" },
  { key: "lower_back", label: "Lower back" },
  { key: "upper_back", label: "Upper back" },
  { key: "both_knees", label: "Both knees" },
  { key: "left_knee", label: "Left knee" },
  { key: "right_knee", label: "Right knee" },
  { key: "left_ankle", label: "Left ankle" },
  { key: "right_ankle", label: "Right ankle" },
  { key: "it_band", label: "IT band" },
  { key: "hamstring", label: "Hamstring" },
  { key: "hip_flexor", label: "Hip flexor" },
  { key: "core", label: "Core" },
  { key: "neck", label: "Neck" },
  { key: "other", label: "Other" },
];
