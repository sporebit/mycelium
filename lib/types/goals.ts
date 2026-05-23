export type GoalScope = "week" | "month";

export type GoalItem = {
  id: string;
  text: string;
  done: boolean;
  created_at: string;
};

export const GOALS_SENTINEL_DATE = "2000-01-01";

export function isGoalItem(x: unknown): x is GoalItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.text === "string" &&
    typeof o.done === "boolean" &&
    typeof o.created_at === "string"
  );
}
