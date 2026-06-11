export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "core"
  | "full-body"
  | "cardio";

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "core",
  "full-body",
  "cardio",
];

export const MUSCLE_GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  legs: "Legs",
  core: "Core",
  "full-body": "Full Body",
  cardio: "Cardio",
};

type MuscleDetail = {
  primary: MuscleGroup;
  muscles: string[];
  secondary?: string[];
};

const EXERCISE_MAP: Record<string, MuscleDetail> = {
  // Chest
  "bench press": { primary: "chest", muscles: ["chest"], secondary: ["triceps", "shoulders-front"] },
  "incline bench press": { primary: "chest", muscles: ["chest"], secondary: ["shoulders-front"] },
  "dumbbell bench press": { primary: "chest", muscles: ["chest"], secondary: ["triceps"] },
  "incline dumbbell press": { primary: "chest", muscles: ["chest"], secondary: ["shoulders-front"] },
  "cable fly": { primary: "chest", muscles: ["chest"] },
  "chest fly": { primary: "chest", muscles: ["chest"] },
  "push ups": { primary: "chest", muscles: ["chest"], secondary: ["triceps", "shoulders-front"] },
  "push-ups": { primary: "chest", muscles: ["chest"], secondary: ["triceps", "shoulders-front"] },
  "dips": { primary: "chest", muscles: ["chest"], secondary: ["triceps", "shoulders-front"] },

  // Back
  "pull ups": { primary: "back", muscles: ["back-upper", "biceps"] },
  "pull-ups": { primary: "back", muscles: ["back-upper", "biceps"] },
  "chin ups": { primary: "back", muscles: ["back-upper", "biceps"] },
  "chin-ups": { primary: "back", muscles: ["back-upper", "biceps"] },
  "lat pulldown": { primary: "back", muscles: ["back-upper"] },
  "barbell row": { primary: "back", muscles: ["back-upper", "back-lower"] },
  "bent over row": { primary: "back", muscles: ["back-upper", "back-lower"] },
  "dumbbell row": { primary: "back", muscles: ["back-upper"] },
  "cable row": { primary: "back", muscles: ["back-upper"] },
  "seated row": { primary: "back", muscles: ["back-upper"] },
  "face pull": { primary: "back", muscles: ["back-upper", "shoulders-rear"] },
  "deadlift": { primary: "back", muscles: ["back-lower", "hamstrings", "glutes"] },
  "rack pull": { primary: "back", muscles: ["back-upper", "back-lower"] },

  // Shoulders
  "overhead press": { primary: "shoulders", muscles: ["shoulders-front", "shoulders-side"] },
  "military press": { primary: "shoulders", muscles: ["shoulders-front"] },
  "shoulder press": { primary: "shoulders", muscles: ["shoulders-front", "shoulders-side"] },
  "dumbbell shoulder press": { primary: "shoulders", muscles: ["shoulders-front"] },
  "lateral raise": { primary: "shoulders", muscles: ["shoulders-side"] },
  "front raise": { primary: "shoulders", muscles: ["shoulders-front"] },
  "rear delt fly": { primary: "shoulders", muscles: ["shoulders-rear"] },
  "upright row": { primary: "shoulders", muscles: ["shoulders-side"], secondary: ["biceps"] },
  "arnold press": { primary: "shoulders", muscles: ["shoulders-front", "shoulders-side"] },
  "shrugs": { primary: "shoulders", muscles: ["shoulders-side"] },

  // Arms
  "bicep curl": { primary: "arms", muscles: ["biceps"] },
  "hammer curl": { primary: "arms", muscles: ["biceps", "forearms"] },
  "barbell curl": { primary: "arms", muscles: ["biceps"] },
  "preacher curl": { primary: "arms", muscles: ["biceps"] },
  "tricep pushdown": { primary: "arms", muscles: ["triceps"] },
  "tricep extension": { primary: "arms", muscles: ["triceps"] },
  "skull crusher": { primary: "arms", muscles: ["triceps"] },
  "close grip bench press": { primary: "arms", muscles: ["triceps"], secondary: ["chest"] },
  "wrist curl": { primary: "arms", muscles: ["forearms"] },

  // Legs
  "squat": { primary: "legs", muscles: ["quads", "glutes"] },
  "back squat": { primary: "legs", muscles: ["quads", "glutes", "hamstrings"] },
  "front squat": { primary: "legs", muscles: ["quads"] },
  "leg press": { primary: "legs", muscles: ["quads", "glutes"] },
  "leg extension": { primary: "legs", muscles: ["quads"] },
  "leg curl": { primary: "legs", muscles: ["hamstrings"] },
  "romanian deadlift": { primary: "legs", muscles: ["hamstrings", "glutes"] },
  "rdl": { primary: "legs", muscles: ["hamstrings", "glutes"] },
  "lunge": { primary: "legs", muscles: ["quads", "glutes"] },
  "bulgarian split squat": { primary: "legs", muscles: ["quads", "glutes"] },
  "hip thrust": { primary: "legs", muscles: ["glutes", "hamstrings"] },
  "calf raise": { primary: "legs", muscles: ["calves"] },
  "glute bridge": { primary: "legs", muscles: ["glutes"] },
  "step up": { primary: "legs", muscles: ["quads", "glutes"] },

  // Core
  "plank": { primary: "core", muscles: ["abs"] },
  "crunch": { primary: "core", muscles: ["abs"] },
  "sit up": { primary: "core", muscles: ["abs"] },
  "russian twist": { primary: "core", muscles: ["obliques"] },
  "leg raise": { primary: "core", muscles: ["abs"] },
  "hanging leg raise": { primary: "core", muscles: ["abs"] },
  "ab wheel": { primary: "core", muscles: ["abs"] },
  "cable woodchop": { primary: "core", muscles: ["obliques"] },
  "dead bug": { primary: "core", muscles: ["abs"] },
  "bird dog": { primary: "core", muscles: ["abs", "back-lower"] },
  "pallof press": { primary: "core", muscles: ["abs", "obliques"] },

  // Cardio
  "running": { primary: "cardio", muscles: [] },
  "cycling": { primary: "cardio", muscles: [] },
  "rowing": { primary: "cardio", muscles: ["back-upper"] },
  "swimming": { primary: "cardio", muscles: [] },
  "jump rope": { primary: "cardio", muscles: ["calves"] },
  "stairmaster": { primary: "cardio", muscles: ["quads", "glutes"] },
  "walking": { primary: "cardio", muscles: [] },
  "treadmill": { primary: "cardio", muscles: [] },
  "elliptical": { primary: "cardio", muscles: [] },
  "assault bike": { primary: "cardio", muscles: [] },
  "ski erg": { primary: "cardio", muscles: ["back-upper", "shoulders-front"] },

  // Full body / compound
  "clean": { primary: "full-body", muscles: ["quads", "back-upper", "shoulders-front"] },
  "snatch": { primary: "full-body", muscles: ["quads", "back-upper", "shoulders-front"] },
  "thruster": { primary: "full-body", muscles: ["quads", "shoulders-front"] },
  "burpee": { primary: "full-body", muscles: ["chest", "quads"] },
  "kettlebell swing": { primary: "full-body", muscles: ["glutes", "hamstrings", "back-lower"] },
  "turkish get up": { primary: "full-body", muscles: ["shoulders-front", "abs", "quads"] },
  "farmer's walk": { primary: "full-body", muscles: ["forearms", "shoulders-side"] },
  "farmer carry": { primary: "full-body", muscles: ["forearms", "shoulders-side"] },
};

export function getExerciseMuscles(name: string): MuscleDetail {
  const key = name.toLowerCase().trim();
  if (EXERCISE_MAP[key]) return EXERCISE_MAP[key];
  for (const [pattern, detail] of Object.entries(EXERCISE_MAP)) {
    if (key.includes(pattern)) return detail;
  }
  return { primary: "full-body", muscles: [] };
}

export function getExerciseMuscleGroup(name: string): MuscleGroup {
  return getExerciseMuscles(name).primary;
}
