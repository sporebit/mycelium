export type CaptureKind = "task" | "note" | "decision" | "capture";
export type CaptureUrgency = "today" | "this_week" | "this_month" | "someday";

export type Classification = {
  kind: CaptureKind;
  urgency: CaptureUrgency;
  key: boolean;
  entity_name: string | null;
  tags: string[];
  summary: string;
  title: string;
};

export type ClassifyResult = {
  classification: Classification;
  llm_source: "anthropic" | "openai" | "regex";
};

const KINDS: readonly CaptureKind[] = ["task", "note", "decision", "capture"];
const URGENCIES: readonly CaptureUrgency[] = [
  "today",
  "this_week",
  "this_month",
  "someday",
];

const SYSTEM_PROMPT = `You classify short personal capture messages into structured JSON.

Rules:
- "kind" is one of: task, note, decision, capture.
  - task = something to do.
  - note = an idea, thought, or piece of information to remember.
  - decision = a choice made.
  - capture = anything else.
- "urgency" is one of: today, this_week, this_month, someday.
- "key" is true if the item is critical or important, otherwise false.
- "entity_name" is the single person or organisation mentioned, or null.
- "tags" is an array of short lowercase tag strings (may be empty).
- "summary" is one short sentence summarising the message.
- "title" is a 3-7 word title (use even for non-tasks).

Respond ONLY with a single JSON object matching this schema. No markdown, no preface.`;

function validate(obj: unknown): Classification | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const kind = o.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as CaptureKind)) return null;

  const urgency = o.urgency;
  if (typeof urgency !== "string" || !URGENCIES.includes(urgency as CaptureUrgency))
    return null;

  if (typeof o.key !== "boolean") return null;

  const entity_name = o.entity_name;
  if (entity_name !== null && typeof entity_name !== "string") return null;

  const tags = o.tags;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string")) return null;

  if (typeof o.summary !== "string" || typeof o.title !== "string") return null;

  return {
    kind: kind as CaptureKind,
    urgency: urgency as CaptureUrgency,
    key: o.key,
    entity_name: entity_name as string | null,
    tags: tags as string[],
    summary: o.summary,
    title: o.title,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract first {...} block
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

async function classifyAnthropic(text: string): Promise<Classification | null> {
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
      system: SYSTEM_PROMPT,
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

async function classifyOpenAI(text: string): Promise<Classification | null> {
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
        { role: "system", content: SYSTEM_PROMPT },
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
  let kind: CaptureKind = "capture";
  if (/\b(todo|remind|task)\b/.test(lower)) kind = "task";
  else if (/\b(idea|thought)\b/.test(lower)) kind = "note";

  let urgency: CaptureUrgency = "someday";
  if (/\btoday\b|\btonight\b|\bnow\b/.test(lower)) urgency = "today";
  else if (/\bthis week\b|\btomorrow\b/.test(lower)) urgency = "this_week";
  else if (/\bthis month\b/.test(lower)) urgency = "this_month";

  const key = /\b(urgent|important|critical|asap)\b/.test(lower);

  const firstLine = text.split(/\n/)[0]?.trim() ?? text.trim();
  const title = firstLine.split(/\s+/).slice(0, 7).join(" ").slice(0, 80);
  const summary = firstLine.slice(0, 140);

  return {
    kind,
    urgency,
    key,
    entity_name: null,
    tags: [],
    summary,
    title: title || "Capture",
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
