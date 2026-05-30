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
