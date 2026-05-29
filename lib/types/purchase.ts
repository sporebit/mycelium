export type PurchaseUrgency =
  | "today"
  | "this_week"
  | "this_month"
  | "someday";

export const PURCHASE_URGENCIES: readonly PurchaseUrgency[] = [
  "today",
  "this_week",
  "this_month",
  "someday",
];

export type PurchaseWantOrNeed = "want" | "need" | "unclear";

export const PURCHASE_WANT_OR_NEED: readonly PurchaseWantOrNeed[] = [
  "want",
  "need",
  "unclear",
];

export type PurchaseListType = "shopping" | "wishlist";

export const PURCHASE_LIST_TYPES: readonly PurchaseListType[] = [
  "shopping",
  "wishlist",
];

export type Purchase = {
  id: string;
  user_id: string;
  title: string;
  amount: number | null;
  currency: string;
  want_or_need: PurchaseWantOrNeed | null;
  urgency: PurchaseUrgency;
  list_type: PurchaseListType;
  project_id: string | null;
  /** Populated server-side by the API GET when joining `projects.name`. */
  project_name?: string | null;
  completed_at: string | null;
  raw_capture_id: string | null;
  created_at: string;
  updated_at: string;
};

export function currencySymbol(code: string | null | undefined): string {
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  return "£";
}
