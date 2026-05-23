export const CATEGORY_TAGS = [
  "liquid",
  "equities",
  "crypto",
  "private",
  "liability",
  "receivable",
  "personal_debt",
] as const;

export type CategoryTag = (typeof CATEGORY_TAGS)[number];

export type FinanceCategory = {
  name: string;
  value: number;
  tag: CategoryTag;
};

export type FinanceSnapshot = {
  net_worth: number;
  currency: string;
  as_of: string; // YYYY-MM-DD
  categories: FinanceCategory[];
  notes: string;
};

export type FinanceData = {
  snapshot: FinanceSnapshot;
  last_refreshed_at: string; // ISO
  source: "manual" | "cron";
};

export type FinanceHistoryPoint = {
  date: string; // YYYY-MM-DD (the daily_logs row date)
  snapshot: FinanceSnapshot;
  last_refreshed_at: string;
  source: "manual" | "cron";
};
