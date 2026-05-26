export type CaptureKind =
  | "task"
  | "note"
  | "decision"
  | "journal"
  | "capture"
  | "workout";
export type CaptureUrgency = "today" | "this_week" | "this_month" | "someday";
export type CaptureMood =
  | "energised"
  | "calm"
  | "anxious"
  | "frustrated"
  | "reflective"
  | "grateful"
  | "tired"
  | "neutral";

export type ClassificationMention = {
  raw: string;
  name_hint: string;
};

export type Classification = {
  kind: CaptureKind;
  urgency: CaptureUrgency;
  key: boolean;
  entity_name: string | null;
  tags: string[];
  summary: string;
  title: string;
  mood: CaptureMood | null; // only meaningful for journal entries
  mentions: ClassificationMention[];
};

export type ClassifyResult = {
  classification: Classification;
  llm_source: "anthropic" | "openai" | "regex";
};

const KINDS: readonly CaptureKind[] = [
  "task",
  "note",
  "decision",
  "journal",
  "capture",
  "workout",
];
const URGENCIES: readonly CaptureUrgency[] = [
  "today",
  "this_week",
  "this_month",
  "someday",
];
const MOODS: readonly CaptureMood[] = [
  "energised",
  "calm",
  "anxious",
  "frustrated",
  "reflective",
  "grateful",
  "tired",
  "neutral",
];

export const CLASSIFIER_SYSTEM_PROMPT = `You classify short personal capture messages into structured JSON.

Rules:
- "kind" is one of: task, note, decision, journal, capture, workout.
  - task = an action the user needs to do.
  - decision = a choice the user wants to record.
  - note = a fact or piece of info to remember.
  - journal = reflection, feeling, or observation about themselves or their day; longer-form expressive content; the kind of thing they'd want to re-read in a year.
  - workout = a description of exercise the user just did, is doing, or is reporting on. Signals: set/rep patterns ("5x5", "3 sets of 8"), weights in kg/lbs ("80kg", "100lbs"), named exercises (bench press, squat, deadlift, RDL, lunges, etc.), cardio terms ("ran 5km", "10 mins on treadmill"), pain or feel words paired with body parts ("shoulder twinged", "left knee sore", "felt pumped"), session-shaped sentences ("did push day", "morning workout", "just finished legs").
  - capture = catch-all when none of the above clearly applies.

Heuristics for journal (guidance, not strict):
  - First-person reflection ("I felt", "today was", "I've been thinking").
  - Sensory or experiential detail.
  - Emotional content.
  - Over ~30 words of expressive content tends toward journal unless it's clearly a task list.

Heuristics for workout (guidance):
  - Concrete numbers (weights, reps, sets, distances, durations) about physical training.
  - Body part + sensation, e.g. "left knee twinged on lunges, about a 5".
  - Past-tense reporting of physical activity ("did", "just finished", "hit", "got through").
  - Pure reflection about a workout WITHOUT concrete logging data ("the gym was hard today and I felt drained") is still journal, not workout.

Examples:
  - "Remind me to call Sarah tomorrow" -> task
  - "We decided to go with the React 19 upgrade after all" -> decision
  - "Stoic gym this morning was brutal but I noticed I'm finally enjoying the back-squat day. Body's adapting." -> journal
  - "Beautiful walk through Sandall Park, the geese are back" -> journal
  - "Need to remember Dad's birthday is on the 14th" -> note
  - "Did push day. Bench 80kg 5x5, OHP 50kg 3x8, dips bodyweight 3x10. Left shoulder twinged on the last set, about a 5." -> workout
  - "Ran 5km, felt good, around 28 minutes" -> workout

Other fields:
- "urgency" is one of: today, this_week, this_month, someday. For journal entries this is unused — pick "someday".
- "key" is true if the item is critical or important, otherwise false. False for journal entries unless emphatic.
- "entity_name" is the single person or organisation mentioned, or null.
- "tags" is an array of short lowercase tag strings (may be empty).
- "summary" is one short sentence summarising the message. For journal entries keep it under 40 characters — a glanceable one-liner.
- "title" is a 3-7 word title (use even for non-tasks).
- "mood" is ONLY set for journal entries, otherwise null. One of: energised, calm, anxious, frustrated, reflective, grateful, tired, neutral.
- "mentions" is an array of person mentions detected in the text. Each entry: { "raw": <exact substring>, "name_hint": <normalised name> }.
  Detect: first names ("Luke", "Sarah"), relationship references ("Mum", "Dad", "my brother" → name_hint "Mum"/"Dad"/etc), first + last ("Luke Henderson").
  Skip: company/brand names, place names, bare pronouns, generic roles ("the doctor") unless capitalised or named.
  Output [] if none.

Respond ONLY with a single JSON object matching this schema. No markdown, no preface.`;

function validate(obj: unknown): Classification | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const kind = o.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as CaptureKind))
    return null;

  const urgency = o.urgency;
  if (
    typeof urgency !== "string" ||
    !URGENCIES.includes(urgency as CaptureUrgency)
  ) {
    return null;
  }

  if (typeof o.key !== "boolean") return null;

  const entity_name = o.entity_name;
  if (entity_name !== null && typeof entity_name !== "string") return null;

  const tags = o.tags;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))
    return null;

  if (typeof o.summary !== "string" || typeof o.title !== "string")
    return null;

  // mood is optional; accept null, undefined, or a known string.
  let mood: CaptureMood | null = null;
  if (o.mood !== undefined && o.mood !== null) {
    if (typeof o.mood !== "string") return null;
    if (!MOODS.includes(o.mood as CaptureMood)) return null;
    mood = o.mood as CaptureMood;
  }

  // mentions are optional — older prompts won't return them. Coerce to [].
  const mentions: ClassificationMention[] = [];
  if (Array.isArray(o.mentions)) {
    for (const m of o.mentions as unknown[]) {
      if (!m || typeof m !== "object") continue;
      const mo = m as Record<string, unknown>;
      const raw = typeof mo.raw === "string" ? mo.raw.trim() : "";
      const hint =
        typeof mo.name_hint === "string" ? mo.name_hint.trim() : raw;
      if (!raw || !hint) continue;
      mentions.push({ raw, name_hint: hint });
    }
  }

  return {
    kind: kind as CaptureKind,
    urgency: urgency as CaptureUrgency,
    key: o.key,
    entity_name: entity_name as string | null,
    tags: tags as string[],
    summary: o.summary,
    title: o.title,
    mood,
    mentions,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function classifyAnthropic(
  text: string
): Promise<Classification | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const block = json.content?.find((c) => c.type === "text");
  const raw = block?.text;
  if (!raw) return null;

  return validate(extractJson(raw));
}

async function classifyOpenAI(
  text: string
): Promise<Classification | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CLASSIFIER_MODEL;
  if (!apiKey || !model) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) return null;

  return validate(extractJson(raw));
}

function classifyRegex(text: string): Classification {
  const lower = text.toLowerCase();
  const wordCount = text.trim().split(/\s+/).length;
  const hasTaskWords =
    /\b(todo|remind|task|need to|must|deadline|due)\b/.test(lower);
  const firstPerson =
    /\b(i|i'm|i've|i'll|today|felt|feeling|noticed)\b/.test(lower);
  const reflective =
    /\b(beautiful|amazing|lovely|grateful|tired|frustrated|reflect|walk|morning|evening|noticed|the geese|sky|weather|sunset|sunrise|loved|enjoyed|brutal|peaceful)\b/.test(
      lower
    );

  // Order matters: note / decision win over task when both could apply
  // (so "need to remember Dad's birthday" lands as note, not task).
  const workoutSignals =
    /\b(\d+\s*x\s*\d+|\d+\s*(sets?|reps?)\b|\d+\s*(kg|lbs?|pounds))\b/i.test(text) ||
    /\b(bench|squat|deadlift|press|curl|row|pull[- ]?up|push[- ]?up|lunge|rdl|ohp|bss|emom|dips|cardio|treadmill)\b/i.test(
      lower
    ) ||
    /\b(ran|jogged|hiked|walked)\s+\d+\s*(k|km|mile)/i.test(lower) ||
    /\b(push day|pull day|leg day|workout|gym session|squat day|bench day)\b/i.test(
      lower
    );

  let kind: CaptureKind = "capture";
  if (/\b(decided|decision|chose|choosing)\b/.test(lower)) {
    kind = "decision";
  } else if (/\b(idea|thought|remember)\b/.test(lower)) {
    kind = "note";
  } else if (workoutSignals) {
    kind = "workout";
  } else if (hasTaskWords) {
    kind = "task";
  } else if (
    (reflective && !hasTaskWords) ||
    (firstPerson && wordCount > 25)
  ) {
    kind = "journal";
  }

  let urgency: CaptureUrgency = "someday";
  if (/\btoday\b|\btonight\b|\bnow\b/.test(lower)) urgency = "today";
  else if (/\bthis week\b|\btomorrow\b/.test(lower)) urgency = "this_week";
  else if (/\bthis month\b/.test(lower)) urgency = "this_month";

  const key = /\b(urgent|important|critical|asap)\b/.test(lower);

  const firstLine = text.split(/\n/)[0]?.trim() ?? text.trim();
  const title = firstLine.split(/\s+/).slice(0, 7).join(" ").slice(0, 80);
  const summary =
    kind === "journal" ? firstLine.slice(0, 40) : firstLine.slice(0, 140);

  return {
    kind,
    urgency,
    key,
    entity_name: null,
    tags: [],
    summary,
    title: title || "Capture",
    mood: null,
    mentions: [],
  };
}

export async function classifyCapture(text: string): Promise<ClassifyResult> {
  try {
    const anthropic = await classifyAnthropic(text);
    if (anthropic) return { classification: anthropic, llm_source: "anthropic" };
  } catch (err) {
    console.error("[classifier] anthropic error:", err);
  }

  try {
    const openai = await classifyOpenAI(text);
    if (openai) return { classification: openai, llm_source: "openai" };
  } catch (err) {
    console.error("[classifier] openai error:", err);
  }

  return { classification: classifyRegex(text), llm_source: "regex" };
}
