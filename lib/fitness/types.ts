export type WeightUnit = "kg" | "lbs" | "stone";
export type Slot = "morning" | "afternoon" | "extra";
export type TemplateSlot = "morning" | "afternoon";
export type SessionKind = "cardio" | "resistance" | "other";
export type TemplateKind = "cardio" | "resistance";
export type Intensity = "easy" | "moderate" | "hard" | "intervals";

export type Programme = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgrammePhase = {
  id: string;
  user_id: string;
  programme_id: string;
  start_week_iso: string; // YYYY-Www
  end_week_iso: string | null;
  created_at: string;
};

export type TemplateExercise = {
  id: string;
  programme_session_id: string;
  position: number;
  name: string;
  notes: string | null;
  default_sets: number | null;
  default_reps: string | null;
  default_weight: number | null;
  default_weight_unit: WeightUnit | null;
  rest_seconds: number | null;
  default_duration_min: number | null;
  default_distance_km: number | null;
  default_intensity: string | null;
};

export type TemplateSession = {
  id: string;
  programme_id: string;
  day_of_week: number; // 0=Mon ... 6=Sun
  slot: TemplateSlot;
  kind: TemplateKind;
  name: string;
  notes: string | null;
  exercises?: TemplateExercise[];
};

export type ProgrammeDetail = Programme & {
  sessions: TemplateSession[];
};

export type LoggedSession = {
  id: string;
  user_id: string;
  date: string;
  slot: Slot;
  kind: SessionKind;
  name: string | null;
  programme_session_id: string | null;
  calories: number | null;
  notes: string | null;
  free_form_text: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BodyMetric = {
  id: string;
  user_id: string;
  date: string;
  weight: number | null;
  weight_unit: WeightUnit;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  waist_cm: number | null;
  notes: string | null;
  created_at: string;
};

export type TodayResponse = {
  date: string;
  programme_name: string | null;
  sessions: Array<{
    slot: Slot;
    kind: SessionKind;
    name: string;
    programme_session_id: string | null;
    exercises: TemplateExercise[];
    logged: boolean;
    logged_session_id: string | null;
  }>;
};

export const DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_SHORT = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
