import type { TemplateKind, Slot } from "./types";

export type WorkoutKind = "cardio" | "conditioning" | "resistance" | "mobility";
export const WORKOUT_KINDS: readonly WorkoutKind[] = [
  "cardio",
  "conditioning",
  "resistance",
  "mobility",
];

export type WorkoutSlot = "morning" | "afternoon" | "evening" | "extra";
export const WORKOUT_SLOTS: readonly WorkoutSlot[] = [
  "morning",
  "afternoon",
  "evening",
  "extra",
];

export type Workout = {
  id: string;
  user_id: string;
  name: string;
  default_kind: WorkoutKind | null;
  default_slot: WorkoutSlot | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Lightweight counters populated on list endpoint. */
  exercise_count?: number;
  programme_use_count?: number;
  last_performed?: string | null;
  times_performed?: number;
  recent_volumes?: number[];
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  name: string;
  sets: number;
  reps_per_set: string;
  rest_seconds: number | null;
  weight_kg: number | null;
  is_bodyweight: boolean;
  position: number;
  notes: string | null;
  created_at: string;
};

export type WorkoutDetail = Workout & {
  exercises: WorkoutExercise[];
  /** Programmes that schedule this workout. */
  used_in?: Array<{
    programme_id: string;
    programme_name: string;
    programme_session_id: string;
    day_of_week: number;
    slot: string;
  }>;
};

export type WorkoutSessionSummary = {
  session_id: string;
  date: string;
  status: string;
  total_volume_kg: number;
  set_count: number;
  duration_minutes: number | null;
};

export type WorkoutWithStats = Workout & {
  last_performed: string | null;
  times_performed: number;
  recent_volumes: number[];
};

export const WORKOUT_SELECT =
  "id, user_id, name, default_kind, default_slot, notes, created_at, updated_at, archived_at";
export const WORKOUT_EX_SELECT =
  "id, workout_id, name, sets, reps_per_set, rest_seconds, weight_kg, is_bodyweight, position, notes, created_at";

export const KIND_LABEL: Record<WorkoutKind, string> = {
  cardio: "Cardio",
  conditioning: "Conditioning",
  resistance: "Resistance",
  mobility: "Mobility",
};

export const KIND_ICON: Record<WorkoutKind, string> = {
  cardio: "🏃",
  conditioning: "🔥",
  resistance: "🏋️",
  mobility: "🧘",
};

export const SLOT_LABEL: Record<WorkoutSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  extra: "Extra",
};

/** Render shape compat — programme session's kind override falls back
 *  to the workout's default kind, then to the legacy session.kind. */
export function effectiveKind(
  override: TemplateKind | null,
  workoutDefault: WorkoutKind | null,
  legacyKind: TemplateKind | null,
): WorkoutKind | TemplateKind | null {
  return override ?? workoutDefault ?? legacyKind;
}

export function effectiveSlot(
  workoutDefault: WorkoutSlot | null,
  legacySlot: Slot | null,
): WorkoutSlot | Slot | null {
  return workoutDefault ?? legacySlot;
}
