import { callClaudeJSON } from "@/lib/ai/anthropic";
import { buildFitnessRulesBlock } from "@/lib/router/rules";
import { matchExerciseName } from "./match-exercise";
import type {
  FeelRating,
  MatchConfidence,
  ParsedCardio,
  ParsedExercise,
  ParsedExerciseComment,
  ParsedPainIntent,
  ParsedSet,
  ParsedWorkout,
  SessionIntent,
  WeightUnit,
} from "./types";

/** Live context that helps the parser route to the right session. */
export type VoiceContext = {
  today_date: string;
  /** Sessions for "today" already known about — planned + in-progress. */
  sessions: Array<{
    session_id: string | null; // null when only template/planned (not yet started)
    programme_session_id: string | null;
    slot: string;
    kind: string;
    name: string | null;
    state: "active" | "planned" | "completed";
    /** Names of exercises this session knows about (template + ad-hoc). */
    exercise_names: string[];
  }>;
  /** Baseline exercise names — the user's seeded list. */
  baseline_names: string[];
};

/** Base prompt. The user's enabled fitness routing rules are prepended
 *  at call time via buildFitnessRulesBlock — they override the static
 *  defaults below when they conflict. */
const BASE_SYSTEM_PROMPT = `You parse a single voice transcription about a workout into structured JSON.

Output ONLY a single JSON object. No prose, no markdown. Schema:
{
  "session_intent": "active" | "planned" | "ambiguous" | "create_extra",
  "candidate_session_ids": [<uuid>...],
  "parsed_exercises": [
    {
      "raw_phrase": "<the user's wording>",
      "matched_exercise_name": "<canonical exercise from the candidate list, or null>",
      "match_confidence": "high" | "medium" | "low" | null,
      "sets": [
        {"set_number": 1, "weight": 80, "unit": "kg" | "lbs" | "stone" | null, "reps": 5}
      ]
    }
  ],
  "cardio_entries": [
    {
      "raw_phrase": "<wording>",
      "matched_exercise_name": "<canonical or null>",
      "duration_min": <number or null>,
      "distance_km": <number or null>,
      "intensity": "easy" | "moderate" | "hard" | "intervals" | null
    }
  ],
  "pain_intents": [
    {
      "raw_phrase": "<wording>",
      "matched_exercise_name": "<canonical or null when general>",
      "severity": <0..10 or null>,
      "pain_regions": ["left_knee", "lower_back", ...],
      "feel_rating": "great" | "good" | "ok" | "mild" | "moderate" | "painful" | "stopped" | null
    }
  ],
  "session_notes": "<short overall comment or null>",
  "exercise_comments": [
    {"matched_exercise_name": "<canonical>", "comment": "<short>"}
  ],
  "uncertainty_notes": ["<things you weren't sure about>"]
}

Routing rules for "session_intent" — apply in this order, stop at first match:

1. PLANNED MATCH (highest priority):
   If the user describes an activity whose kind keywords match exactly ONE
   planned/active session for today, that's session_intent="planned"
   (or "active" if state=active). Put that session's id in
   candidate_session_ids.

   Example: planned evening Mobility today. User says "did some stretching
   this evening" → session_intent="planned", candidate_session_ids=[<that id>].
   The user is reporting they completed the planned thing. They don't have
   to say its name.

   Example: planned morning Conditioning. User says "KB EMOM this morning"
   → planned, with that session's id.

2. AMBIGUOUS:
   If kind keywords match 2+ planned/active sessions today (e.g. two
   mobility sessions in the evening slot), session_intent="ambiguous",
   candidate_session_ids = all matching ids.

3. ACTIVE:
   If a session is already state=active and the text reads as additions
   to it (no slot/kind mismatch), session_intent="active".

4. CREATE_EXTRA:
   Only when none of the above hold. Specifically:
     - The activity's kind doesn't match any planned session today (e.g.
       user did yoga but there's no mobility planned), OR
     - The activity is genuinely off-programme (tennis, hiking, swimming).

5. Otherwise → ambiguous.

CRITICAL: do not pick create_extra just because the user used casual
language ("did some stretching" vs "did my mobility session"). If a
planned session today matches by kind, that's planned.

When "ambiguous", populate candidate_session_ids with every plausible candidate's session_id (or programme_session_id when not yet started — use the *_id you'd pass back to resolve later). Prefer empty list over guessing.

Pain regions vocabulary (use snake_case, exactly these or close variants):
left_shoulder right_shoulder left_scapula right_scapula left_elbow right_elbow left_wrist right_wrist left_forearm right_forearm left_bicep right_bicep left_trap right_trap lower_back upper_back both_knees left_knee right_knee left_ankle right_ankle it_band hamstring hip_flexor core neck other

Tone-of-voice rules:
- "felt pumped", "great pump", "felt strong" → positive vibes, NOT pain. Treat as exercise_comments or session_notes, not pain_intents.
- "twinged", "ached", "sore", "hurt", "flared", "stiff", "tight" → pain. Severity word → feel_rating: twinge/tight → mild; ache/sore → moderate; sharp/stabbing/hurt → painful; "had to stop" → stopped.
- Numbers attached to pain ("about a 5", "like a 7/10") → severity.
- Bilateral words ("both knees") → both_knees. Unspecified side ("shoulder feeling sore") → leave pain_regions empty if you can't infer side from context.

Set-parsing rules:
- "5x5 at 80kg" → 5 sets of 5 reps at 80 kg. Emit set_number 1..5, each with weight=80, reps=5.
- "3 sets of 8" without weight → emit 3 sets with weight=null, reps=8.
- "bench 80kg 5x5" → exercise=bench/Barbell Bench Press, 5 sets × 5 reps @ 80kg.
- "did 3 sets" (no weight or reps) → emit ONE set with set_number=1, weight=null, reps=null, then note in uncertainty_notes that set details were incomplete.
- "PR at 100" without further detail → log as one set, weight=100. Don't claim it's a PR yourself.
- "actually that was 75 not 80" → set the corrected value; flag in uncertainty_notes that this is a correction (server will figure out which set).

Cardio rules:
- "ran 5km" → duration null, distance 5, intensity null.
- "ran for 30 minutes" → duration 30, distance null.
- "hiked Snowdon" → duration null, distance null, intensity hard (it's Snowdon), matched_exercise_name = "Hiking" if in the list.

Kind/slot disambiguation:
- The candidate sessions list shows kind (cardio/conditioning/resistance/mobility/other) and slot (morning/afternoon/evening/extra). Use them to pick the right candidate when the user names a slot or kind explicitly.
- Kind keywords:
  - cardio: run, jog, walk, cycle, row, treadmill, zone 2, easy pace, steady, conversational.
  - conditioning: EMOM, HIIT, intervals, circuit, AMRAP, complex, kettlebell flow, KB EMOM, burpees, metabolic.
  - resistance: bench, deadlift, squat, press, row, curl, lift, hypertrophy, sets/reps with weight.
  - mobility: stretch, mobility, foam roll, opener, dynamic warmup, cat-cow, dislocates, Y/W/I raise, dead bug.
- Slot keywords: "this morning" → morning, "this afternoon" → afternoon, "this evening" / "tonight" → evening, "extra" / "bonus session" → extra.
- When the user names a slot AND a kind that exactly matches one planned session, that's the candidate (intent: planned or active depending on its state).

Comments vs notes:
- session_notes = vibe/feel about the whole session ("felt strong today", "tired going in").
- exercise_comments = something about one exercise ("PR on bench", "form felt off on RDL").
- Pain mentions go in pain_intents, not comments — even if conversational ("knee was angry").
`;

function clampStr(s: unknown): string | null {
  return typeof s === "string" ? s : null;
}

function clampNum(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) {
    return Number(n);
  }
  return null;
}

const UNITS: WeightUnit[] = ["kg", "lbs", "stone"];
const FEEL_RATINGS: FeelRating[] = [
  "great",
  "good",
  "ok",
  "mild",
  "moderate",
  "painful",
  "stopped",
];
const INTENTS: SessionIntent[] = ["active", "planned", "ambiguous", "create_extra"];
const CONFIDENCES: MatchConfidence[] = ["high", "medium", "low"];

function clampUnit(u: unknown): WeightUnit | null {
  return typeof u === "string" && (UNITS as string[]).includes(u)
    ? (u as WeightUnit)
    : null;
}
function clampFeel(f: unknown): FeelRating | null {
  return typeof f === "string" && (FEEL_RATINGS as string[]).includes(f)
    ? (f as FeelRating)
    : null;
}
function clampIntent(s: unknown): SessionIntent {
  return typeof s === "string" && (INTENTS as string[]).includes(s)
    ? (s as SessionIntent)
    : "ambiguous";
}
function clampConfidence(c: unknown): MatchConfidence | null {
  return typeof c === "string" && (CONFIDENCES as string[]).includes(c)
    ? (c as MatchConfidence)
    : null;
}

function validate(obj: unknown): ParsedWorkout | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const intent = clampIntent(o.session_intent);
  const candidateIds = Array.isArray(o.candidate_session_ids)
    ? (o.candidate_session_ids as unknown[])
        .map(clampStr)
        .filter((x): x is string => !!x)
    : [];

  const parsedExercises: ParsedExercise[] = Array.isArray(o.parsed_exercises)
    ? (o.parsed_exercises as unknown[]).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const setsIn = Array.isArray(r.sets) ? (r.sets as unknown[]) : [];
        const sets: ParsedSet[] = setsIn.map((s, i) => {
          const sr = (s ?? {}) as Record<string, unknown>;
          return {
            set_number:
              clampNum(sr.set_number) != null
                ? Math.max(1, Math.floor(clampNum(sr.set_number) as number))
                : i + 1,
            weight: clampNum(sr.weight),
            unit: clampUnit(sr.unit),
            reps:
              clampNum(sr.reps) != null
                ? Math.max(0, Math.floor(clampNum(sr.reps) as number))
                : null,
          };
        });
        return {
          raw_phrase: clampStr(r.raw_phrase) ?? "",
          matched_exercise_name: clampStr(r.matched_exercise_name),
          match_confidence: clampConfidence(r.match_confidence),
          sets,
        };
      })
    : [];

  const cardio: ParsedCardio[] = Array.isArray(o.cardio_entries)
    ? (o.cardio_entries as unknown[]).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        return {
          raw_phrase: clampStr(r.raw_phrase) ?? "",
          matched_exercise_name: clampStr(r.matched_exercise_name),
          duration_min: clampNum(r.duration_min),
          distance_km: clampNum(r.distance_km),
          intensity: clampStr(r.intensity),
        };
      })
    : [];

  const pain: ParsedPainIntent[] = Array.isArray(o.pain_intents)
    ? (o.pain_intents as unknown[]).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const regions = Array.isArray(r.pain_regions)
          ? (r.pain_regions as unknown[]).map(clampStr).filter((x): x is string => !!x)
          : [];
        return {
          raw_phrase: clampStr(r.raw_phrase) ?? "",
          matched_exercise_name: clampStr(r.matched_exercise_name),
          severity: (() => {
            const n = clampNum(r.severity);
            if (n == null) return null;
            return Math.max(0, Math.min(10, Math.round(n)));
          })(),
          pain_regions: regions,
          feel_rating: clampFeel(r.feel_rating),
        };
      })
    : [];

  const comments: ParsedExerciseComment[] = Array.isArray(o.exercise_comments)
    ? (o.exercise_comments as unknown[]).map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        return {
          matched_exercise_name: clampStr(r.matched_exercise_name) ?? "",
          comment: clampStr(r.comment) ?? "",
        };
      }).filter((c) => c.matched_exercise_name && c.comment)
    : [];

  const uncertain = Array.isArray(o.uncertainty_notes)
    ? (o.uncertainty_notes as unknown[]).map(clampStr).filter((x): x is string => !!x)
    : [];

  return {
    session_intent: intent,
    candidate_session_ids: candidateIds,
    parsed_exercises: parsedExercises,
    cardio_entries: cardio,
    pain_intents: pain,
    session_notes: clampStr(o.session_notes),
    exercise_comments: comments,
    uncertainty_notes: uncertain,
  };
}

/**
 * Post-process LLM output by re-running fuzzy matching locally. This catches
 * cases where the LLM emitted a name that wasn't on the candidate list — we
 * either snap to a candidate or null it out so downstream knows to create
 * ad-hoc.
 */
function reconcileMatches(
  parsed: ParsedWorkout,
  candidates: string[]
): ParsedWorkout {
  function reconcile(
    name: string | null
  ): { matched_exercise_name: string | null; match_confidence: MatchConfidence | null } {
    if (!name) return { matched_exercise_name: null, match_confidence: null };
    // Already on the list?
    if (candidates.some((c) => c.toLowerCase() === name.toLowerCase())) {
      return { matched_exercise_name: name, match_confidence: "high" };
    }
    const m = matchExerciseName(name, candidates);
    if (m) {
      return { matched_exercise_name: m.name, match_confidence: m.confidence };
    }
    return { matched_exercise_name: null, match_confidence: null };
  }

  return {
    ...parsed,
    parsed_exercises: parsed.parsed_exercises.map((e) => ({
      ...e,
      ...reconcile(e.matched_exercise_name ?? e.raw_phrase ?? null),
    })),
    cardio_entries: parsed.cardio_entries.map((c) => {
      const rec = reconcile(c.matched_exercise_name ?? c.raw_phrase ?? null);
      return { ...c, matched_exercise_name: rec.matched_exercise_name };
    }),
    pain_intents: parsed.pain_intents.map((p) => {
      if (!p.matched_exercise_name) return p;
      const rec = reconcile(p.matched_exercise_name);
      return { ...p, matched_exercise_name: rec.matched_exercise_name };
    }),
    exercise_comments: parsed.exercise_comments
      .map((c) => {
        const rec = reconcile(c.matched_exercise_name);
        return rec.matched_exercise_name
          ? { ...c, matched_exercise_name: rec.matched_exercise_name }
          : null;
      })
      .filter((x): x is ParsedExerciseComment => x !== null),
  };
}

export async function parseWorkoutVoice(
  rawText: string,
  context: VoiceContext,
  /** Pass through so we can pull user-defined fitness routing rules
   *  and prepend them to the system prompt. Optional so legacy/test
   *  call sites that don't have a user id keep working with the
   *  baseline prompt. */
  userId?: string,
): Promise<ParsedWorkout> {
  const userPrompt = [
    `Date: ${context.today_date}`,
    "",
    "Today's candidate sessions:",
    context.sessions.length === 0
      ? "  (none — no programme active or rest day)"
      : context.sessions
          .map(
            (s) =>
              `  - id=${s.session_id ?? s.programme_session_id} state=${s.state} slot=${s.slot} kind=${s.kind} name=${s.name ?? "?"} | exercises: ${s.exercise_names.slice(0, 12).join(", ") || "(none)"}`
          )
          .join("\n"),
    "",
    "User's full exercise vocabulary (canonical names):",
    `  ${context.baseline_names.slice(0, 80).join(", ")}`,
    "",
    "User voice transcription:",
    rawText.trim(),
  ].join("\n");

  const rulesBlock = userId ? await buildFitnessRulesBlock(userId) : "";
  const systemPrompt = rulesBlock
    ? `${rulesBlock}\n\n${BASE_SYSTEM_PROMPT}`
    : BASE_SYSTEM_PROMPT;

  const out = await callClaudeJSON<ParsedWorkout>({
    systemPrompt,
    userMessage: userPrompt,
    validate,
    maxTokens: 2048,
    timeoutMs: 30_000,
  });

  // Build the candidate list for local reconciliation: today's exercises +
  // baselines, deduped.
  const candidateSet = new Set<string>();
  for (const s of context.sessions) for (const n of s.exercise_names) candidateSet.add(n);
  for (const n of context.baseline_names) candidateSet.add(n);
  const candidates = Array.from(candidateSet);

  if (out) return reconcileMatches(out, candidates);

  // Fallback: empty parse with text preserved as a session note.
  return {
    session_intent: "ambiguous",
    candidate_session_ids: [],
    parsed_exercises: [],
    cardio_entries: [],
    pain_intents: [],
    session_notes: rawText.trim() || null,
    exercise_comments: [],
    uncertainty_notes: ["Parser returned no structured output."],
  };
}
