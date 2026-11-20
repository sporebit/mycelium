/**
 * Convert to purchase, pure (spec §8). One-way: a shortlisted gift becomes
 * a shopping-list purchase carrying title, price, currency, want/need,
 * category and the link; the gift keeps the record of who and why and
 * moves to bought. Column names checked against the purchases table
 * (0017/0018/0029/0030/0085): title, amount, currency, want_or_need,
 * urgency, list_type, category, context_tag.
 */
import { PURCHASE_CATEGORIES, type PurchaseCategory } from "@/lib/types/purchase";
import type { GiftRow } from "./types";

export type PurchaseInsert = {
  title: string;
  amount: number | null;
  currency: string;
  want_or_need: "want" | "need" | "unclear";
  urgency: "someday" | "this_month" | "this_week" | "today";
  list_type: "shopping";
  category: PurchaseCategory | null;
  context_tag: string | null;
};

const GIFT_CATEGORY: PurchaseCategory | null = (PURCHASE_CATEGORIES as readonly string[]).includes("gifts") ? ("gifts" as PurchaseCategory) : null;

/** The purchases row a gift becomes. `today` decides the urgency from `needed_by`. */
export function purchaseFromGift(g: Pick<GiftRow, "title" | "target_price" | "currency" | "category" | "needed_by" | "url" | "retailer">, today: string): PurchaseInsert {
  const price = g.target_price === null || g.target_price === undefined ? null : Number(g.target_price);
  const category = g.category && (PURCHASE_CATEGORIES as readonly string[]).includes(g.category) ? (g.category as PurchaseCategory) : GIFT_CATEGORY;
  return {
    title: g.retailer ? `${g.title} (${g.retailer})` : g.title,
    amount: price !== null && Number.isFinite(price) ? price : null,
    currency: g.currency || "GBP",
    // a gift is for someone else: a want on the list, not a need of the buyer's
    want_or_need: "want",
    urgency: urgencyFor(g.needed_by, today),
    list_type: "shopping",
    category,
    context_tag: "gift",
  };
}

export function urgencyFor(neededBy: string | null | undefined, today: string): PurchaseInsert["urgency"] {
  if (!neededBy) return "someday";
  const days = Math.round((Date.parse(`${neededBy}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days <= 1) return "today";
  if (days <= 7) return "this_week";
  if (days <= 31) return "this_month";
  return "someday";
}

/** Only a shortlisted gift can be bought through the action (spec §8); an idea is shortlisted first. */
export function canConvert(g: Pick<GiftRow, "status" | "purchase_id">): string | null {
  if (g.purchase_id) return "This gift already has a purchase.";
  if (g.status === "bought" || g.status === "given") return "This gift is already bought.";
  if (g.status === "rejected") return "A rejected gift is not bought.";
  if (g.status !== "shortlisted") return "Shortlist it first.";
  return null;
}
