/** Project status — widened by 0116 (`completed` → `done`, `paused` added). `completed` is kept for old client payloads. */
export type ProjectStatus = "active" | "paused" | "done" | "archived" | "completed";

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "paused",
  "done",
  "archived",
  "completed",
];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "ACTIVE",
  paused: "PAUSED",
  done: "DONE",
  archived: "ARCHIVED",
  completed: "COMPLETED",
};

export type Project = {
  id: string;
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
  // ---- Tickets (0116) ----
  /** Per-project key prefix (`MYC`); null on sub-projects, which inherit the root's. */
  prefix?: string | null;
  area_id?: string | null;
  parent_id?: string | null;
  workflow_id?: string | null;
  /** `owner/name` for the GitHub webhook and opt-in Issues sync. */
  github_repo?: string | null;
  github_issues_sync?: boolean;
  sort_order?: number;
};
