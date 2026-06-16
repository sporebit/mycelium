export type WeightUnit = "kg" | "lbs" | "stone";
/** A workout_sessions row can land in any of four slots. Programme sessions
 *  only use the three time-of-day slots (no "extra" template). */
export type Slot = "morning" | "afternoon" | "evening" | "extra";
export type TemplateSlot = "morning" | "afternoon" | "evening";
/** Logged sessions can additionally be "other" (free-form: tennis, hiking). */
export type SessionKind =
  | "cardio"
  | "conditioning"
  | "resistance"
  | "mobility"
  | "other";
export type TemplateKind = "cardio" | "conditioning" | "resistance" | "mobility";
export type Intensity = "easy" | "moderate" | "hard" | "intervals";
/** Render mode for an exercise — drives the logger's input layout. */
export type ExerciseDataShape =
  | "sets_reps"
  | "hold"
  | "duration"
  | "distance";

export type Programme = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
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
  data_shape: ExerciseDataShape;
  with_weight: boolean;
  default_hold_seconds: number | null;
  /** Bodyweight flag — added by migration 0031. When true the logger
   *  renders the weight column as "+ KG" (added weight on top of body)
   *  and empty values display as "BW". */
  is_bodyweight?: boolean;
};

export type TemplateSession = {
  id: string;
  programme_id: string;
  day_of_week: number; // 0=Mon ... 6=Sun
  slot: TemplateSlot;
  kind: TemplateKind;
  name: string;
  notes: string | null;
  position: number;
  exercises?: TemplateExercise[];
};

export type ProgrammeDetail = Programme & {
  sessions: TemplateSession[];
};

export type SessionStatus =
  | "active"
  | "completed"
  | "attempted"
  | "abandoned";

export const SESSION_STATUSES: readonly SessionStatus[] = [
  "active",
  "completed",
  "attempted",
  "abandoned",
];

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
  /** Lifecycle state — see migration 0016. */
  status: SessionStatus;
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

export type BodyMetricSource = "apple_health" | "manual" | "scale_ble";

export type BodyMetric = {
  id: string;
  user_id: string;
  date: string;
  weight: number | null;
  weight_unit: WeightUnit;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  bone_mass_kg: number | null;
  water_percent: number | null;
  waist_cm: number | null;
  arms_in: number | null;
  thorax_in: number | null;
  thighs_in: number | null;
  notes: string | null;
  source: BodyMetricSource;
  recorded_at: string | null;
  created_at: string;
};

/** One slot card on /fitness today. May represent a planned template
 *  session (no logged_session_id) or a live session (with one). */
export type TodaySlotEntry = {
  slot: Slot;
  position: number;
  kind: SessionKind;
  name: string;
  programme_session_id: string | null;
  logged_session_id: string | null;
  session_type: string | null;
  swapped_from_programme_session_id: string | null;
  exercises: TemplateExercise[];
  completed: boolean;
  in_progress: boolean;
  /** Lifecycle status mirrored from workout_sessions.status. Null for
   *  planned-only template entries that don't have a logged row yet. */
  status: SessionStatus | null;
  summary: { sets: number; minutes: number | null } | null;
  known_issues_count: number;
};

export type TodayResponse = {
  date: string;
  /** False when the response is for a day other than the user's real
   *  today (set when called with ?date=YYYY-MM-DD). Drives past/
   *  future banner + disables START/RESUME on planned-only entries. */
  is_today: boolean;
  programme_name: string | null;
  programme_id: string | null;
  programme_sessions: Array<{
    id: string;
    day_of_week: number;
    slot: TemplateSlot;
    kind: TemplateKind;
    name: string;
    position: number;
  }>;
  /** One array per slot, ordered by position. Empty arrays kept so the UI
   *  always renders all four slot headers. */
  slots: Record<Slot, TodaySlotEntry[]>;
};

export type LoggedSet = {
  set_number: number;
  reps: number | null;
  weight: number | null;
  unit: WeightUnit | null;
  completed_at: string | null;
  hold_seconds?: number | null;
  duration_min?: number | null;
  distance_km?: number | null;
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
  data_shape: ExerciseDataShape;
  with_weight: boolean;
  /** Bodyweight flag — added by migration 0031. Set by the voice parser
   *  for canonically-bodyweight movements (pullups, dips, push-ups) and
   *  toggleable from the BW chip in the session-log header. */
  is_bodyweight?: boolean;
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
  /** True when any recent session_exercise row for this name is flagged
   *  as bodyweight. The history UI relabels the "Weight" axis as
   *  "Added weight" so PRs read correctly for weighted pullups etc. */
  is_bodyweight: boolean;
};

export type HistorySessionCard = {
  id: string;
  date: string;
  slot: Slot;
  kind: SessionKind;
  session_type: string | null;
  name: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: SessionStatus;
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
  /** Total completed-session count per session_type (across the whole user
   *  history, not just this page). Used to build the type-filter chip row. */
  type_counts?: Record<string, number>;
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
  session_id: string;
  /** Null when the row is a session-level pain note rather than a
   *  log against a specific exercise. */
  session_exercise_id: string | null;
  /** Denormalised name of the exercise; for session-level rows this
   *  is the sentinel string "session". */
  exercise_name: string;
  /** NOT NULL per migration 0022; preserved as number for the chart
   *  colour scale. */
  severity: number;
  feel_rating: FeelRating | null;
  /** NOT NULL DEFAULT '{}' per migration 0022. */
  pain_regions: string[];
  notes: string | null;
  logged_at: string;
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
  /** True when the LLM identifies this as a bodyweight movement —
   *  pull-ups, dips, push-ups, etc. — or when the user explicitly
   *  says "bodyweight" / "BW" in the transcription. */
  bodyweight?: boolean;
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
  short_id?: string;
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
