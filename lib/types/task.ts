export type TaskUrgency = "today" | "this_week" | "this_month" | "someday";

export const URGENCIES: readonly TaskUrgency[] = [
  "today",
  "this_week",
  "this_month",
  "someday",
];

export const URGENCY_LABEL: Record<TaskUrgency, string> = {
  today: "TODAY",
  this_week: "THIS WEEK",
  this_month: "THIS MONTH",
  someday: "SOMEDAY",
};

export type TaskStatus =
  | "new"
  | "in_progress"
  | "blocked"
  | "on_hold"
  | "waiting_third_party"
  | "review"
  | "pending_review"
  | "testing"
  | "completed"
  | "cancelled";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "new",
  "in_progress",
  "blocked",
  "on_hold",
  "waiting_third_party",
  "review",
  "pending_review",
  "testing",
  "completed",
  "cancelled",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  new: "NEW",
  in_progress: "IN PROGRESS",
  blocked: "BLOCKED",
  on_hold: "ON HOLD",
  waiting_third_party: "WAITING FOR 3RD PARTY",
  review: "REVIEW",
  pending_review: "PENDING REVIEW",
  testing: "TESTING",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  urgency: TaskUrgency | null;
  status: TaskStatus;
  key: boolean;
  priority_score: number | null;
  time_estimate_min: number | null;
  tags: string[] | null;
  due_date: string | null;
  owner: string | null;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string | null;
  project_name: string | null;
  /** Project colour swatch — populated on serializeTask via the projects join. */
  project_colour?: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  parent_task_id: string | null;
  // Populated by callers that want the nested view (e.g. include_children=true
  // on /api/tasks, or client-side attachment).
  sub_tasks?: Task[];
};

export type Entity = {
  id: string;
  user_id: string;
  name: string;
  kind: string | null;
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type TaskActivity = {
  id: string;
  task_id: string;
  user_id: string;
  action: string;
  field: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
};

export type LinkedCapture = {
  id: string;
  source: string;
  raw_text: string | null;
  created_at: string;
};

export type TaskDetail = {
  task: Task;
  comments: TaskComment[];
  activity: TaskActivity[];
  subtasks: Task[];
  linked_captures: LinkedCapture[];
};

export function midpointScore(
  above: number | null,
  below: number | null
): number {
  // Convention: HIGHER score = top of list.
  if (above === null && below === null) return 0.5;
  if (above === null) return ((below ?? 0) + 1.0) / 2;
  if (below === null) return (above ?? 0) / 2;
  return (above + below) / 2;
}

export function isOverdue(task: Task, now: Date = new Date()): boolean {
  if (!task.due_date || task.completed_at) return false;
  // due_date is YYYY-MM-DD; compare to local date
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return task.due_date < today;
}

export function isDueToday(task: Task, now: Date = new Date()): boolean {
  if (!task.due_date || task.completed_at) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return task.due_date === today;
}

export const TASK_STATUS_TONE: Record<TaskStatus, { fg: string; bg: string; border: string }> = {
  new: { fg: "text-ink-3", bg: "bg-ink-2/40", border: "border-ink-2" },
  in_progress: { fg: "text-accent", bg: "bg-accent/15", border: "border-accent/40" },
  blocked: { fg: "text-danger", bg: "bg-danger/15", border: "border-danger/40" },
  on_hold: { fg: "text-ink-3", bg: "bg-ink-2/40", border: "border-ink-2" },
  waiting_third_party: { fg: "text-warn", bg: "bg-warn/15", border: "border-warn/40" },
  review: { fg: "text-glow-2", bg: "bg-glow-2/15", border: "border-glow-2/40" },
  pending_review: { fg: "text-glow-2", bg: "bg-glow-2/10", border: "border-glow-2/30" },
  testing: { fg: "text-accent", bg: "bg-accent/10", border: "border-accent/30" },
  completed: { fg: "text-ok", bg: "bg-ok/15", border: "border-ok/40" },
  cancelled: { fg: "text-ink-3", bg: "bg-ink-2/40", border: "border-ink-2" },
};
