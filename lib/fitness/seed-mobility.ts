import type { ExerciseDataShape } from "./types";

/**
 * Mobility exercises seeded into every newly-created evening template
 * session. Order matters — position is the array index.
 */
export type MobilitySeedRow = {
  name: string;
  notes: string;
  data_shape: ExerciseDataShape;
  default_sets: number | null;
  default_reps: string | null;
  default_duration_min: number | null;
  default_hold_seconds: number | null;
  default_intensity: string | null;
  with_weight: boolean;
  rest_seconds: number | null;
};

export const MOBILITY_SEED: MobilitySeedRow[] = [
  {
    name: "Cat-cow",
    notes:
      "Slow flow on hands and knees, focus on spine articulation",
    data_shape: "duration",
    default_sets: null,
    default_reps: null,
    default_duration_min: 2,
    default_hold_seconds: null,
    default_intensity: "easy",
    with_weight: false,
    rest_seconds: null,
  },
  {
    name: "World's Greatest Stretch",
    notes:
      "Step forward into lunge, rotate torso open, full body opener",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "5 each side",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: null,
  },
  {
    name: "Deep Squat Hold",
    notes: "Sit in the bottom, drive knees out, chest up",
    data_shape: "hold",
    default_sets: 2,
    default_reps: null,
    default_duration_min: null,
    default_hold_seconds: 60,
    default_intensity: null,
    with_weight: false,
    rest_seconds: 60,
  },
  {
    name: "Shoulder Dislocates",
    notes: "Band or PVC pipe, slow controlled arcs over the head",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "10",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: 60,
  },
  {
    name: "Dead Bug",
    notes: "Core anti-extension, slow tempo",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "8 each side",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: null,
  },
  {
    name: "Adductor Stretch",
    notes: "Each side. Half-kneeling, hips back",
    data_shape: "hold",
    default_sets: 2,
    default_reps: null,
    default_duration_min: null,
    default_hold_seconds: 30,
    default_intensity: null,
    with_weight: false,
    rest_seconds: 30,
  },
  {
    name: "Y Raise",
    notes: "Prone or wall-supported, shoulder activation",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "12",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: 45,
  },
  {
    name: "W Raise",
    notes: "Same setup as Y, scapular squeeze",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "12",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: 45,
  },
  {
    name: "I Raise",
    notes: "Arms overhead, shoulder finisher",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "12",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: 45,
  },
  {
    name: "Mini Band Lateral Squat Walk",
    notes: "Glute med activation, knees out",
    data_shape: "sets_reps",
    default_sets: 2,
    default_reps: "10 each side",
    default_duration_min: null,
    default_hold_seconds: null,
    default_intensity: null,
    with_weight: false,
    rest_seconds: null,
  },
];
