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
};
