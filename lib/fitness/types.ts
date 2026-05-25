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
  session_type: string | null;
  swapped_from_programme_session_id: string | null;
  calories: number | null;
  notes: string | null;
  free_form_text: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionTypeLoggingMode = "full" | "simple";

export type WorkoutSessionType = {
  id: string;
  user_id: string;
  type_key: string;
  label: string;
  is_builtin: boolean;
  typical_logging_mode: SessionTypeLoggingMode;
  created_at: string;
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
  programme_id: string | null;
  /** Every session in the active programme — used by the day-swap dropdown. */
  programme_sessions: Array<{
    id: string;
    day_of_week: number;
    slot: TemplateSlot;
    kind: TemplateKind;
    name: string;
  }>;
  sessions: Array<{
    slot: Slot;
    kind: SessionKind;
    name: string;
    programme_session_id: string | null;
    /** Type assigned to the live session, or inferred for the planned one. */
    session_type: string | null;
    /** Set when the active session was swapped from a different template. */
    swapped_from_programme_session_id: string | null;
    exercises: TemplateExercise[];
    /** Live workout_session for today/slot, if any. */
    logged_session_id: string | null;
    /** True if a session exists AND has completed_at set. */
    completed: boolean;
    /** True if a session exists, regardless of completion (drives RESUME). */
    in_progress: boolean;
    /** Summary numbers for completed sessions (otherwise null). */
    summary: { sets: number; minutes: number | null } | null;
    /** How many of this session's exercises have a known-pain-issues baseline. */
    known_issues_count: number;
  }>;
  /** Extra sessions logged today (kind=other or any session with slot=extra). */
  extras: Array<{
    session_id: string;
    name: string | null;
    session_type: string | null;
    kind: SessionKind;
    completed: boolean;
    summary: { sets: number; minutes: number | null } | null;
  }>;
};

export type LoggedSet = {
  set_number: number;
  reps: number | null;
  weight: number | null;
  unit: WeightUnit | null;
  completed_at: string | null;
};

export type SessionExercise = {
  id: string;
  session_id: string;
  position: number;
  name: string;
  notes: string | null;
  comment: string | null;
  rest_seconds: number | null;
  duration_min: number | null;
  distance_km: number | null;
  intensity: string | null;
  programme_exercise_id: string | null;
  save_to_template: boolean;
  skipped: boolean;
  completed_at: string | null;
  added_at: string;
  /** Snapshot of the template prescription, copied at session start. */
  template?: TemplateExercise | null;
  sets?: LoggedSet[];
};

export type SessionDetail = LoggedSession & {
  exercises: SessionExercise[];
};

export type LastSession = {
  session_date: string;
  sets: LoggedSet[];
} | null;

/** Per-session summary row for the exercise-history page. */
export type ExerciseHistoryEntry = {
  id: string;
  session_id: string;
  date: string;
  slot: Slot;
  sets_logged: number;
  top_set: { weight: number; reps: number; unit: WeightUnit } | null;
  volume_kg: number;
  est_1rm_kg: number | null;
  comment: string | null;
  notes: string | null;
  is_peak_weight_pr: boolean;
  is_volume_pr: boolean;
};

export type ExercisePRs = {
  peak: {
    weight_kg: number;
    weight: number;
    unit: WeightUnit;
    reps: number;
    session_id: string;
    date: string;
  } | null;
  volume: {
    volume_kg: number;
    set_count: number;
    session_id: string;
    date: string;
  } | null;
};

export type ExerciseHistoryResponse = {
  exercise_name: string;
  template_notes: string | null;
  modal_unit: WeightUnit;
  sessions: ExerciseHistoryEntry[];
  peak_weight: ExercisePRs["peak"];
  volume_pr: ExercisePRs["volume"];
};

export type HistorySessionCard = {
  id: string;
  date: string;
  slot: Slot;
  kind: SessionKind;
  name: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  exercise_count: number;
  set_count: number;
  total_volume_kg: number;
  duration_minutes: number | null;
  distance_km: number | null;
  duration_active_min: number | null;
};

export type HistoryResponse = {
  sessions: HistorySessionCard[];
  next_cursor: string | null;
};

export type FeelRating =
  | "great"
  | "good"
  | "ok"
  | "mild"
  | "moderate"
  | "painful"
  | "stopped";

export type ExerciseBaseline = {
  id: string;
  user_id: string;
  exercise_name: string;
  has_known_issues: boolean | null;
  typical_severity_min: number | null;
  typical_severity_max: number | null;
  pain_regions: string[] | null;
  conditional_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ExercisePainLog = {
  id: string;
  user_id: string;
  session_exercise_id: string;
  severity: number | null;
  feel_rating: FeelRating | null;
  pain_regions: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchConfidence = "high" | "medium" | "low";
export type SessionIntent = "active" | "planned" | "ambiguous" | "create_extra";

export type ParsedSet = {
  set_number: number;
  weight: number | null;
  unit: WeightUnit | null;
  reps: number | null;
};

export type ParsedExercise = {
  raw_phrase: string;
  matched_exercise_name: string | null;
  match_confidence: MatchConfidence | null;
  sets: ParsedSet[];
};

export type ParsedCardio = {
  raw_phrase: string;
  matched_exercise_name: string | null;
  duration_min: number | null;
  distance_km: number | null;
  intensity: string | null;
};

export type ParsedPainIntent = {
  raw_phrase: string;
  matched_exercise_name: string | null;
  severity: number | null;
  pain_regions: string[];
  feel_rating: FeelRating | null;
};

export type ParsedExerciseComment = {
  matched_exercise_name: string;
  comment: string;
};

export type ParsedWorkout = {
  session_intent: SessionIntent;
  candidate_session_ids: string[];
  parsed_exercises: ParsedExercise[];
  cardio_entries: ParsedCardio[];
  pain_intents: ParsedPainIntent[];
  session_notes: string | null;
  exercise_comments: ParsedExerciseComment[];
  uncertainty_notes: string[];
};

export type PendingButtonOption = {
  session_id: string;
  /** "active" | "planned" | "extra" — describes how to interpret session_id. */
  state: "active" | "planned" | "extra";
  name: string | null;
  slot: string;
  kind: string;
};

export type PendingWorkoutRoute = {
  id: string;
  user_id: string;
  raw_text: string;
  parsed_payload: ParsedWorkout;
  button_options: PendingButtonOption[];
  expires_at: string;
  created_at: string;
};

export type VoiceRouteResult = {
  session_id: string | null;
  session_name: string | null;
  exercises_logged: number;
  sets_logged: number;
  pain_logs: number;
  cardio_logged: number;
  summary: string;
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
