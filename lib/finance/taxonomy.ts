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
