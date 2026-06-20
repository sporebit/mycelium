import { createServerClient } from "@/lib/supabase/server";

type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "create_task",
    description:
      "Create a task in Mycelium Organisation. Use when the user asks you to create, add, or remember something as a task. Always confirm with the user before calling this.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        notes: { type: "string", description: "Additional notes or context" },
        urgency: {
          type: "string",
          enum: ["today", "this_week", "this_month", "someday"],
          description: "Task urgency level",
        },
        due_date: { type: "string", description: "Due date YYYY-MM-DD (optional)" },
        scheduled_at: {
          type: "string",
          description: "Scheduled datetime in ISO format (optional)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "create_subtasks",
    description:
      "Create multiple subtasks under an existing task. Call this after create_task to add subtasks to the created task.",
    input_schema: {
      type: "object",
      properties: {
        parent_task_id: { type: "string", description: "UUID of the parent task" },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              notes: { type: "string" },
            },
            required: ["title"],
          },
        },
      },
      required: ["parent_task_id", "subtasks"],
    },
  },
];

export const FINANCE_TOOLS: ToolDef[] = [
  {
    name: "create_account",
    description:
      "Add a new account/subscription to the Mycelium accounts register. Use when the user mentions opening, signing up for, or adding a service.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service/account name e.g. Monzo, Netflix" },
        category: {
          type: "string",
          enum: [
            "Entertainment",
            "Productivity",
            "Infrastructure",
            "Finance",
            "Health",
            "Shopping",
            "Other",
          ],
        },
        status: {
          type: "string",
          enum: ["active", "trial", "paused", "cancelled"],
        },
        cost_amount: { type: "number", description: "Monthly or annual cost" },
        cost_period: { type: "string", enum: ["monthly", "annual", "one_off"] },
        email: { type: "string", description: "Email used to sign up" },
        url: { type: "string", description: "Website URL" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_account_status",
    description: "Update the status of an existing account e.g. mark as cancelled.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Account name to search for" },
        status: { type: "string", enum: ["active", "trial", "paused", "cancelled"] },
      },
      required: ["name", "status"],
    },
  },
];

export function toolsForAgent(agentId: string): ToolDef[] {
  switch (agentId) {
    case "da_boi":
      return [...AGENT_TOOLS, ...FINANCE_TOOLS];
    case "tasks":
      return [...AGENT_TOOLS];
    case "finance":
      return [...AGENT_TOOLS, ...FINANCE_TOOLS];
    case "fitness":
      return [AGENT_TOOLS[0]];
    default:
      return [];
  }
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<{ ok: boolean; result: unknown; summary: string }> {
  const supabase = createServerClient();
  const uid = process.env.USER_ID;

  if (toolName === "create_task") {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: uid,
        title: toolInput.title as string,
        description: (toolInput.notes as string) || null,
        urgency: (toolInput.urgency as string) || "someday",
        due_date: (toolInput.due_date as string) || null,
        scheduled_at: (toolInput.scheduled_at as string) || null,
        status: "new",
      })
      .select("id, title")
      .single();
    if (error) return { ok: false, result: error.message, summary: "Task creation failed" };
    return { ok: true, result: data, summary: `Created task: ${data.title}` };
  }

  if (toolName === "create_subtasks") {
    const parentId = toolInput.parent_task_id as string;
    const subs = toolInput.subtasks as { title: string; notes?: string }[];
    const rows = subs.map((s) => ({
      user_id: uid,
      title: s.title,
      description: s.notes || null,
      parent_task_id: parentId,
      status: "new",
      urgency: "someday",
    }));
    const { data, error } = await supabase.from("tasks").insert(rows).select("id, title");
    if (error) return { ok: false, result: error.message, summary: "Subtask creation failed" };
    return {
      ok: true,
      result: data,
      summary: `Created ${data.length} subtask${data.length === 1 ? "" : "s"}`,
    };
  }

  if (toolName === "create_account") {
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        name: toolInput.name as string,
        category: (toolInput.category as string) || "Other",
        status: (toolInput.status as string) || "active",
        cost_amount: toolInput.cost_amount ?? null,
        cost_currency: "GBP",
        cost_period: (toolInput.cost_period as string) || null,
        email: (toolInput.email as string) || null,
        url: (toolInput.url as string) || null,
        notes: (toolInput.notes as string) || null,
      })
      .select("id, name")
      .single();
    if (error) return { ok: false, result: error.message, summary: "Account creation failed" };
    return { ok: true, result: data, summary: `Added account: ${data.name}` };
  }

  if (toolName === "update_account_status") {
    const { data, error } = await supabase
      .from("accounts")
      .update({
        status: toolInput.status as string,
        updated_at: new Date().toISOString(),
      })
      .ilike("name", `%${toolInput.name}%`)
      .select("id, name, status");
    if (error || !data?.length) {
      return {
        ok: false,
        result: error?.message ?? "Account not found",
        summary: `No account matching "${toolInput.name}" found`,
      };
    }
    return {
      ok: true,
      result: data,
      summary: `Updated ${data[0].name} to ${data[0].status}`,
    };
  }

  return { ok: false, result: "Unknown tool", summary: "Unknown tool" };
}
