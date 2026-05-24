import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { TASK_SELECT, serializeTask } from "@/lib/tasks";
import type { Task } from "@/lib/types/task";

export const runtime = "nodejs";

const TIMEOUT_MS = 15000;
const TASK_FETCH_LIMIT = 200;

const SYSTEM_PROMPT = `You are a task-search assistant. The user is searching their personal task list with a natural-language query.

You will receive:
- The user's query.
- A JSON array of their open tasks. Each task has: id, title, description, urgency, key (critical flag), tags, entity_name (person/org), due_date, priority_score, parent_task_id (uuid if it's a sub-task, null otherwise), parent_title (the title of the parent task if applicable).

Some tasks have parent_task_id pointing to a parent task — those are sub-tasks broken out of a larger piece of work. When returning a relevant sub-task, the explanation should mention the parent ("Book restaurant, part of Plan party").

Your job: return JSON in this exact shape:
{ "task_ids": string[], "explanation": string }

- "task_ids" is an array of task IDs (UUID strings) ordered by relevance, max 20 items. Only include real ids from the list.
- "explanation" is one short sentence summarising your interpretation; reference parent context when matches are sub-tasks.

Respond ONLY with the JSON. No markdown, no preface.`;

type SmartTask = Pick<
  Task,
  | "id"
  | "title"
  | "description"
  | "urgency"
  | "key"
  | "tags"
  | "entity_name"
  | "due_date"
  | "priority_score"
  | "parent_task_id"
> & { parent_title: string | null };

function buildPickForLLM(
  titleById: Map<string, string>
): (t: Task) => SmartTask {
  return (t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    urgency: t.urgency,
    key: t.key,
    tags: t.tags,
    entity_name: t.entity_name,
    due_date: t.due_date,
    priority_score: t.priority_score,
    parent_task_id: t.parent_task_id,
    parent_title: t.parent_task_id
      ? (titleById.get(t.parent_task_id) ?? null)
      : null,
  });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateLLM(obj: unknown): { task_ids: string[]; explanation: string } | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const ids = o.task_ids;
  const explanation = o.explanation;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) return null;
  if (typeof explanation !== "string") return null;
  return { task_ids: ids as string[], explanation };
}

function textSearch(tasks: Task[], query: string): { ids: string[]; explanation: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { ids: [], explanation: "Empty query." };
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = tasks
    .map((t) => {
      const hay = [
        t.title,
        t.description ?? "",
        t.entity_name ?? "",
        ...(t.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const tk of tokens) {
        if (hay.includes(tk)) score++;
      }
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  return {
    ids: scored.map((x) => x.t.id),
    explanation: `Fell back to plain text search; matched ${scored.length} task${scored.length === 1 ? "" : "s"}.`,
  };
}

async function callClaude(
  query: string,
  tasks: Task[]
): Promise<{ task_ids: string[]; explanation: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;

  const titleById = new Map<string, string>();
  for (const t of tasks) titleById.set(t.id, t.title);
  const pickForLLM = buildPickForLLM(titleById);
  const userMessage = `Query: ${query}\n\nTasks (JSON):\n${JSON.stringify(tasks.map(pickForLLM))}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = json.content?.find((b) => b.type === "text")?.text;
    if (!text) return null;
    return validateLLM(extractJson(text));
  } catch (err) {
    console.error("[/api/tasks/smart] claude failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: { query?: unknown };
  try {
    body = (await req.json()) as { query?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", uid)
      .is("completed_at", null)
      .order("updated_at", { ascending: false })
      .limit(TASK_FETCH_LIMIT);
    if (error) throw error;

    const tasks: Task[] = (data ?? []).map((row) =>
      serializeTask(row as Parameters<typeof serializeTask>[0])
    );
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    let result = await callClaude(query, tasks);
    let fallback = false;
    if (!result) {
      result = { ...textSearch(tasks, query), task_ids: [] };
      const fallbackResult = textSearch(tasks, query);
      result.task_ids = fallbackResult.ids;
      fallback = true;
    }

    const orderedTasks = result.task_ids
      .map((id) => taskById.get(id))
      .filter((t): t is Task => !!t);

    return NextResponse.json({
      tasks: orderedTasks,
      explanation: result.explanation,
      fallback,
    });
  } catch (err) {
    console.error("[/api/tasks/smart POST]", err);
    return NextResponse.json({ error: "smart search failed" }, { status: 500 });
  }
}
