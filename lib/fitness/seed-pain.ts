/**
 * Seed data + parser for the user's injury_tracker spreadsheet.
 *
 * Format (one record per line, pipe-delimited):
 *   <exercise name> | <issues Y/N/?> | <severity> | <region> | <comments>
 *
 * Severity grammar:
 *   ""        → null/null
 *   "7"       → 7/7
 *   "4/5"     → 4/5     (the slash means "either 4 or 5")
 *   "2-5"     → 2/5     (range)
 *
 * Regions are normalised via REGION_MAP — anything not on the map produces
 * a snake_case best-effort key and a console warning at seed time.
 */

export type PainSeedRow = {
  exercise_name: string;
  has_known_issues: boolean | null;
  typical_severity_min: number | null;
  typical_severity_max: number | null;
  pain_regions: string[];
  conditional_notes: string | null;
};

const RAW = `
Treadmill Walk | N | | |
Mini Band Lateral Squat Walk | N | | |
Bench Single Leg Hip Thrust | N | | |
Dumbbell Reverse Lunge | Y | 7 | Both Knees | Pain at the front of both knees when adding weight.
Leg Press | N | | |
Romanian Deadlift — Barbell | Y | 4 | Lower Back | Lower back takes strain when lifting heavy.
Seated Leg Curl Machine | N | | |
Leg Extension | N | | |
Seated Calf Raise | N | | |
Reverse Incline Treadmill Walking | Y | 2 | N/A | Not comfortable doing these.
Band External Shoulder Rotation | Y | 3 | Left Shoulder | Bearable, but strain in left shoulder at full extension.
Machine Seated Parallel Grip Shoulder Press | Y | 3 | Left Forearm / Bicep | Forearm and lower bicep gets very tight during the exercise.
Machine Kelso Shrug | ? | | | Not yet attempted — only seen demonstrated in first session.
Barbell Bench Press | Y | 4/5 | Left Shoulder | Inconsistent — usually fine, but left shoulder front can flare depending on what was done earlier in the session.
Dumbbell Incline Bench Press | Y | 4/5 | Left Shoulder | Inconsistent — usually fine, but left shoulder front can flare depending on what was done earlier in the session.
Cable Lateral Raise | Y | 5 | Left Shoulder | Severity depends on how the shoulder feels going into the exercise.
Tricep Dips — Bodyweight | N | | |
Cable Tricep Pushdown — Straight Bar | N | | |
Cable Rope Overhead Tricep Extension | N | | |
Barbell Deadlift | Y | 4 | Lower Back | Lower back takes strain when lifting heavy.
Wide Grip Pull-up / Lat Pulldown | N | | |
Dumbbell Bent-Over Row — Single Arm | Y | 3 | Left Shoulder / Scapula | Rarely done in the gym now. Likely manageable at current shoulder condition.
T-Bar Row | Y | 0 | | Issue is with the machine setup, not the movement. No problem with seated cable rows using V-grip.
Face Pulls — Cable Rope | Y | 2-5 | Left Shoulder / Trap | Usually fine. Severity depends on shoulder going into the exercise.
Cable Rear Delt Fly | Y | 2-5 | Left Shoulder | Tend to shrug to compensate. Usually manageable.
EZ Bar Curl | Y | 3 | Left Shoulder | Usually fine. Left shoulder becomes an issue with heavier weights later in the set if it is already fatigued.
Dumbbell Hammer Curl | Y | 2 | Left Shoulder | Usually fine. Left shoulder becomes an issue with heavier weights later in the set if it is already fatigued.
Hanging Straight Leg Raise | Y | 0 | Core | Struggle to avoid swinging, so currently avoided.
Lying Abs Band | N | | |
Front Squats KB | N | | | Currently only done at 10kg. May cause issues at higher weights.
Close-Grip Push-Up | Y | 0-6 | Left Shoulder | Usually fine, but significantly aggravates left shoulder if it is already feeling it.
Arnold Press DB | Y | 2 | Left Shoulder | Usually fine. Issues arise when rushing reps with poor form.
Bulgarian Split Squat | Y | 8 | Both Knees | Worst exercise for the knees. Sharp pain at the front of both knees.
Concentration Curls DB | N | | |
DB Tricep Kickback | N | | |
Bicycle Crunches | N | | |
KB Good Mornings | N | | |
Hanging Leg Hip Raise | N | | |
Military Press | Y | 5 | Left Shoulder | Front of left shoulder hurts the most.
Barbell Bent-over Row | Y | 4 | Lower Back | Struggle to maintain a flat back and correct lean angle.
Barbell Squat | Y | 6 | Both Knees | Fine at lighter weights. Pain starts around 40-50kg.
Smith Machine Leg Press | N | | |
Smith Machine Calf Raise | N | | |
Walking Lunge | N | | |
DB Shoulder Press | N | | |
Chest Dip | N | | |
Cable Front Raise | Y | 2 | Left Shoulder | Mild pain at the back of the left shoulder.
EZ-Bar Skull Crushers | N | | |
Barbell Upright Row | Y | 3 | Left Shoulder | Usually fine. Issues arise when lifting heavier with poor form.
Cable Curl | N | | |
Hack Squat | ? | | |
Standing Calf Raise | N | | |
Goblet Squat | N | | |
Alternate Arm Leg Plank Hold | Y | 4 | Left Shoulder | Struggle to support weight on the left side.
Adductor Stretch | N | | |
90 Degree Heel Touch | N | | |
Alternate Heel Touches | N | | |
Y Raise | Y | 2 | Left Scapula | Left shoulder feels tight and clicks.
W Raise | Y | 2 | Left Scapula | Left shoulder feels tight and clicks.
I Raise | Y | 2 | Left Scapula | Left shoulder feels tight and clicks.
Scapula Row | N | | |
Plank | Y | 3 | Left Shoulder |
Push-up | N | | |
Jogging / Running | Y | 6 | Both Knees / IT Band | Shin splints after ~1km. IT band flares after ~2km, risk of injury beyond that.
Hiking | Y | 6-10 | Both Knees / IT Band | Uphill is fine. Descents are painful, especially on longer hikes with more elevation. Severe soreness for a couple of days after big hikes (e.g. Snowdon).
`;

/** Display strings (from the spreadsheet) → normalised region key(s). */
const REGION_MAP: Record<string, string[]> = {
  "left shoulder": ["left_shoulder"],
  "right shoulder": ["right_shoulder"],
  "both shoulders": ["left_shoulder", "right_shoulder"],
  "left scapula": ["left_scapula"],
  "right scapula": ["right_scapula"],
  "both knees": ["both_knees"],
  "left knee": ["left_knee"],
  "right knee": ["right_knee"],
  "lower back": ["lower_back"],
  "upper back": ["upper_back"],
  "left shoulder / scapula": ["left_shoulder", "left_scapula"],
  "left forearm / bicep": ["left_forearm", "left_bicep"],
  "left shoulder / trap": ["left_shoulder", "left_trap"],
  "both knees / it band": ["both_knees", "it_band"],
  "core": ["core"],
  "neck": ["neck"],
  "hamstring": ["hamstring"],
  "hip flexor": ["hip_flexor"],
  "it band": ["it_band"],
  "n/a": [],
};

function parseSeverity(raw: string): { min: number | null; max: number | null } {
  const v = raw.trim();
  if (!v) return { min: null, max: null };
  // Range "N-N" — but watch for the digit-only "0" or single integers below
  const dashMatch = v.match(/^(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    return { min: Number(dashMatch[1]), max: Number(dashMatch[2]) };
  }
  const slashMatch = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    return { min: Number(slashMatch[1]), max: Number(slashMatch[2]) };
  }
  const single = v.match(/^(\d{1,2})$/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  return { min: null, max: null };
}

function normaliseRegion(raw: string): string[] {
  const key = raw.trim().toLowerCase();
  if (!key) return [];
  if (REGION_MAP[key]) return REGION_MAP[key];
  // Best-effort fallback for anything not on the explicit map: split on " / "
  // and snake_case each fragment so the data isn't lost.
  return key.split(/\s*\/\s*/).map((frag) =>
    frag.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  );
}

export function parseSeedRows(raw: string = RAW): PainSeedRow[] {
  const out: PainSeedRow[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 2) continue;
    const [name, issuesRaw, severityRaw = "", regionRaw = "", commentsRaw = ""] = parts;
    if (!name) continue;
    let has: boolean | null;
    if (issuesRaw === "Y") has = true;
    else if (issuesRaw === "N") has = false;
    else if (issuesRaw === "?") has = null;
    else has = false;

    const sev = parseSeverity(severityRaw);
    const regions = has === true ? normaliseRegion(regionRaw) : [];
    out.push({
      exercise_name: name,
      has_known_issues: has,
      typical_severity_min: has === true ? sev.min : null,
      typical_severity_max: has === true ? sev.max : null,
      pain_regions: regions,
      conditional_notes: commentsRaw || null,
    });
  }
  return out;
}

export const PAIN_SEED_ROWS = parseSeedRows();
