/**
 * The payments the model was not sure about (master run §10: "only
 * low-confidence ones become swipe cards in the evening close"). Read as
 * the caller from the finance tables, which are theirs alone. Answering a
 * card goes through POST /api/finance/transactions/[id]/category, which
 * locks the category: the memory then counts it as the person's own word.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { UNSURE_BELOW } from "./merchantMemory";
import { merchantName } from "./recurring";

export type UnsureCard = {
  id: string;
  /** The merchant as a person would read it. */
  name: string;
  /** The day it was paid. */
  on: string;
  amount_pence: number;
  /** The model's best guess, offered for a yes. */
  guess: string;
};

/** The unsure payments, dearest first; never more than asked for. */
export async function unsureCards(db: SupabaseClient, limit: number): Promise<UnsureCard[]> {
  if (limit <= 0) return [];
  const { data, error } = await db
    .from("transactions")
    .select("id, txn_date, description, enriched_merchant, amount, category, ai_confidence")
    .eq("category_source", "ai")
    .eq("category_locked", false)
    .lt("ai_confidence", UNSURE_BELOW)
    .lt("amount", 0)
    .order("amount", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; txn_date: string; description: string | null; enriched_merchant: string | null; amount: number; category: string | null }>).map((t) => ({
    id: t.id,
    name: merchantName(t.description, t.enriched_merchant),
    on: t.txn_date,
    amount_pence: Math.round(-Number(t.amount) * 100),
    guess: t.category ?? "Uncategorised",
  }));
}
