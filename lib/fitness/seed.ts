import type { TemplateKind, TemplateSlot } from "./types";

type SeedExercise = {
  position: number;
  name: string;
  notes?: string;
  default_sets?: number;
  default_reps?: string;
  default_weight?: number;
  default_weight_unit?: "kg" | "lbs" | "stone";
  rest_seconds?: number;
  default_duration_min?: number;
  default_distance_km?: number;
  default_intensity?: string;
};

type SeedSession = {
  day_of_week: number; // 0=Mon ... 6=Sun
  slot: TemplateSlot;
  kind: TemplateKind;
  name: string;
  notes?: string;
  exercises: SeedExercise[];
};

export const PHIL_PROGRAMME_NAME =
  "Phil's Training Programme (Rehab Phase)";

const PHIL_PROGRAMME_DESC =
  "Five active days, weekend rest. Rehab-focused on knees + shoulder while building strength.";

// ─── Morning cardio sessions ────────────────────────────────────────────────

const KB_EMOM_AM: SeedExercise[] = [
  {
    position: 1,
    name: "Skip warm-up",
    default_duration_min: 10,
    default_intensity: "moderate",
    notes: "Mix of paces",
  },
  {
    position: 2,
    name: "KB EMOM",
    default_duration_min: 20,
    default_intensity: "intervals",
    notes: "Odd: KB swing 12 reps 10kg. Even: DB renegade row 6 each side",
  },
];

const HIIT_AM: SeedExercise[] = [
  {
    position: 1,
    name: "Skip warm-up",
    default_duration_min: 10,
    default_intensity: "moderate",
  },
  {
    position: 2,
    name: "HIIT circuit",
    default_duration_min: 20,
    default_intensity: "hard",
    notes: "3 rounds × 6 exercises",
  },
];

const FRIDAY_AM: SeedExercise[] = [
  {
    position: 1,
    name: "KB EMOM",
    default_duration_min: 15,
    default_intensity: "intervals",
    notes: "Slightly shorter — programme winds down",
  },
];

// ─── Afternoon resistance sessions ──────────────────────────────────────────

const MON_PM: SeedExercise[] = [
  {
    position: 1,
    name: "Treadmill walk",
    default_duration_min: 5,
    default_sets: 0,
    notes: "5 mins warm-up",
  },
  {
    position: 2,
    name: "Mini band lateral squat walk",
    default_sets: 3,
    default_reps: "10-15 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 3,
    name: "Bench single leg hip thrust",
    default_sets: 3,
    default_reps: "8-14 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 4,
    name: "Dumbbell reverse lunge",
    default_sets: 3,
    default_reps: "8-14 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 5,
    name: "Leg press — feet high and wide",
    default_sets: 4,
    default_reps: "10-15",
    default_weight_unit: "kg",
    rest_seconds: 120,
    notes: "Main leg exercise",
  },
  {
    position: 6,
    name: "Romanian deadlift — barbell",
    default_sets: 3,
    default_reps: "10-12",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 7,
    name: "Seated leg curl machine",
    default_sets: 3,
    default_reps: "12-15",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 8,
    name: "Leg extension (light, pain-free range)",
    default_sets: 3,
    default_reps: "15-20",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 9,
    name: "Seated calf raise",
    default_sets: 4,
    default_reps: "15-20",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 10,
    name: "Reverse incline treadmill walking",
    default_duration_min: 10,
    default_sets: 0,
    notes: "Finisher",
  },
];

const TUE_PM: SeedExercise[] = [
  {
    position: 1,
    name: "Mini band lateral squat walk — knees",
    default_sets: 3,
    default_reps: "5 each ×2",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 2,
    name: "Bench single leg hip thrust",
    default_sets: 3,
    default_reps: "8-14 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 3,
    name: "Dumbbell reverse lunge",
    default_sets: 3,
    default_reps: "8-14 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 4,
    name: "Band external shoulder rotation",
    default_sets: 2,
    default_reps: "10-16 each arm",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 5,
    name: "Machine seated parallel grip shoulder press",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 6,
    name: "Machine Kelso shrug",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 7,
    name: "Reverse incline treadmill walking",
    default_duration_min: 10,
    default_sets: 0,
    notes: "Finisher",
  },
];

const WED_PM: SeedExercise[] = [
  {
    position: 1,
    name: "Treadmill walk",
    default_duration_min: 5,
    default_sets: 0,
    notes: "5 min warm-up",
  },
  {
    position: 2,
    name: "Band external shoulder rotation",
    default_sets: 3,
    default_reps: "10-15 each arm",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 3,
    name: "Machine seated parallel grip shoulder press",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 90,
    notes: "Low weight, activation",
  },
  {
    position: 4,
    name: "Machine Kelso shrug",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 5,
    name: "Barbell bench press",
    default_sets: 4,
    default_reps: "8-12",
    default_weight_unit: "kg",
    rest_seconds: 120,
    notes: "Primary lift",
  },
  {
    position: 6,
    name: "Dumbbell incline bench press",
    default_sets: 3,
    default_reps: "8-12",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 7,
    name: "Cable lateral raise",
    default_sets: 3,
    default_reps: "12-15",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 8,
    name: "Tricep dips — bodyweight",
    default_sets: 3,
    default_reps: "10-12",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 9,
    name: "Cable tricep pushdown — straight bar",
    default_sets: 3,
    default_reps: "12-15",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 10,
    name: "Cable rope overhead tricep extension",
    default_sets: 3,
    default_reps: "12-15",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
];

const THU_PM: SeedExercise[] = [
  {
    position: 1,
    name: "Mini band lateral squat walk — knees",
    default_sets: 3,
    default_reps: "10-15 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 2,
    name: "Bench single leg hip thrust",
    default_sets: 3,
    default_reps: "8-14 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 3,
    name: "Dumbbell reverse lunge",
    default_sets: 3,
    default_reps: "8-14 each side",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 4,
    name: "Band external shoulder rotation",
    default_sets: 3,
    default_reps: "10-15 each arm",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 5,
    name: "Machine seated parallel grip shoulder press",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 6,
    name: "Machine Kelso shrug",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
];

const FRI_PM: SeedExercise[] = [
  {
    position: 1,
    name: "Barbell deadlift",
    default_sets: 4,
    default_reps: "6-8",
    default_weight_unit: "kg",
    rest_seconds: 150,
    notes: "Most important lift of week",
  },
  {
    position: 2,
    name: "Wide grip pull-up or lat pulldown",
    default_sets: 3,
    default_reps: "8-12",
    default_weight_unit: "kg",
    rest_seconds: 120,
  },
  {
    position: 3,
    name: "Dumbbell bent-over row — single arm",
    default_sets: 3,
    default_reps: "8-12",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 4,
    name: "T-bar row",
    default_sets: 3,
    default_reps: "8-12",
    default_weight_unit: "kg",
    rest_seconds: 90,
  },
  {
    position: 5,
    name: "Face pulls — cable rope",
    default_sets: 3,
    default_reps: "15-20",
    default_weight_unit: "kg",
    rest_seconds: 60,
    notes: "Best shoulder exercise",
  },
  {
    position: 6,
    name: "Machine Kelso shrug",
    default_sets: 3,
    default_reps: "8-14",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 7,
    name: "Cable rear delt fly",
    default_sets: 3,
    default_reps: "12-15",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 8,
    name: "EZ bar curl",
    default_sets: 3,
    default_reps: "10-12",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 9,
    name: "Dumbbell hammer curl",
    default_sets: 3,
    default_reps: "12-15",
    default_weight_unit: "kg",
    rest_seconds: 60,
  },
  {
    position: 10,
    name: "Skip rope",
    default_duration_min: 10,
    default_sets: 0,
    notes: "Finisher",
  },
];

// ─── Sessions catalogue ─────────────────────────────────────────────────────

export const PHIL_PROGRAMME_SESSIONS: SeedSession[] = [
  // Monday
  {
    day_of_week: 0,
    slot: "morning",
    kind: "cardio",
    name: "Skip warm-up + KB EMOM",
    exercises: KB_EMOM_AM,
  },
  {
    day_of_week: 0,
    slot: "afternoon",
    kind: "resistance",
    name: "Legs (rehab focus)",
    exercises: MON_PM,
  },
  // Tuesday
  {
    day_of_week: 1,
    slot: "morning",
    kind: "cardio",
    name: "Skip warm-up + HIIT circuit",
    exercises: HIIT_AM,
  },
  {
    day_of_week: 1,
    slot: "afternoon",
    kind: "resistance",
    name: "Knees + Shoulder rehab",
    exercises: TUE_PM,
  },
  // Wednesday
  {
    day_of_week: 2,
    slot: "morning",
    kind: "cardio",
    name: "Skip warm-up + KB EMOM",
    exercises: KB_EMOM_AM,
  },
  {
    day_of_week: 2,
    slot: "afternoon",
    kind: "resistance",
    name: "Chest + Shoulders + Triceps",
    exercises: WED_PM,
  },
  // Thursday
  {
    day_of_week: 3,
    slot: "morning",
    kind: "cardio",
    name: "Skip warm-up + HIIT circuit",
    exercises: HIIT_AM,
  },
  {
    day_of_week: 3,
    slot: "afternoon",
    kind: "resistance",
    name: "Knee rehab + Shoulder rehab",
    exercises: THU_PM,
  },
  // Friday
  {
    day_of_week: 4,
    slot: "morning",
    kind: "cardio",
    name: "Skip warm-up + KB EMOM",
    exercises: FRIDAY_AM,
  },
  {
    day_of_week: 4,
    slot: "afternoon",
    kind: "resistance",
    name: "Back + Shoulder health + Biceps",
    exercises: FRI_PM,
  },
  // Sat + Sun: rest, no sessions.
];

export const PHIL_PROGRAMME_SEED = {
  name: PHIL_PROGRAMME_NAME,
  description: PHIL_PROGRAMME_DESC,
  sessions: PHIL_PROGRAMME_SESSIONS,
};
