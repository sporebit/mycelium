export type ProjectStatus = "active" | "archived" | "completed";

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "archived",
  "completed",
];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "ACTIVE",
  archived: "ARCHIVED",
  completed: "COMPLETED",
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  colour: string | null;
  created_at: string;
  updated_at: string;
  task_count?: number;
  /** Sum of `purchases.amount` for every purchase linked to this project,
   *  completed or not. Computed server-side on GET /api/projects/[id]. */
  estimated_cost?: number;
  /** Sum of `purchases.amount` for completed purchases only. */
  actual_cost?: number;
  /** Most common currency among linked purchases; defaults to GBP. */
  cost_currency?: string;
  linked_purchase_count?: number;
};
