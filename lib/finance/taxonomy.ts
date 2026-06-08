export const TAXONOMY = [
  "Groceries",
  "Eating Out / Takeaway",
  "Fuel",
  "Transport",
  "Shopping",
  "Subscriptions & Software",
  "Bills & Utilities",
  "Housing",
  "Health & Fitness",
  "Entertainment",
  "Travel / Holidays",
  "Cash",
  "Income",
  "Fees & Charges",
  "Transfer (internal)",
  "Uncategorised",
] as const;

export type Category = (typeof TAXONOMY)[number];

const TAXONOMY_SET = new Set<string>(TAXONOMY);

export function isValidCategory(v: string): v is Category {
  return TAXONOMY_SET.has(v);
}

export const CATEGORY_COLOURS: Record<string, string> = {
  "Groceries": "#84f5b8",
  "Eating Out / Takeaway": "#5de8e0",
  "Fuel": "#f5b56d",
  "Transport": "#f5c98a",
  "Shopping": "#f5e06d",
  "Subscriptions & Software": "#6db8f5",
  "Bills & Utilities": "#4a8fd4",
  "Housing": "#3a6fb5",
  "Health & Fitness": "#6df0d0",
  "Entertainment": "#b56df5",
  "Travel / Holidays": "#84b4f5",
  "Cash": "#a0a090",
  "Income": "#84f5b8",
  "Fees & Charges": "#e05555",
  "Uncategorised": "#4d4b43",
};
