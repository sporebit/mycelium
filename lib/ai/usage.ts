/**
 * api_usage — per-call LLM cost rows (0119). Tagged by feature so a monthly
 * cap can be enforced per tag (tickets spec §9.1: `tickets.rundown`, £10 /
 * month, alert at 80 %, stop at 100 %). Prices are list prices in USD per
 * million tokens, converted at a fixed rate like /api/other/api-usage does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const USD_TO_GBP = 0.79;

/** USD per MTok [input, output]; unknown models fall back to Sonnet pricing. */
const PRICE: Array<[RegExp, [number, number]]> = [
  [/haiku/i, [1, 5]],
  [/sonnet/i, [3, 15]],
  [/opus/i, [15, 75]],
];

export function costPence(model: string | null | undefined, inputTokens: number, outputTokens: number, extraUsd = 0): number {
  const [pin, pout] = PRICE.find(([re]) => re.test(model ?? ""))?.[1] ?? [3, 15];
  const usd = (inputTokens / 1_000_000) * pin + (outputTokens / 1_000_000) * pout + extraUsd;
  return Math.round(usd * USD_TO_GBP * 100 * 1000) / 1000;
}

export async function recordUsage(
  db: SupabaseClient,
  row: { tag: string; model: string | null; input_tokens: number; output_tokens: number; cost_pence: number; meta?: Record<string, unknown>; provider?: string },
): Promise<void> {
  const { error } = await db.from("api_usage").insert({ provider: "anthropic", ...row });
  if (error) console.error("[api_usage] insert failed:", error.message);
}

/** Spend this calendar month (London) for a tag prefix, in pence. */
export async function monthSpendPence(db: SupabaseClient, tagPrefix: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await db.from("api_usage").select("cost_pence").like("tag", `${tagPrefix}%`).gte("at", monthStart).limit(5000);
  return (data ?? []).reduce((s, r) => s + Number((r as { cost_pence: number }).cost_pence || 0), 0);
}

export type CapCheck = { allowed: boolean; spent_pence: number; cap_pence: number; warn: boolean };

/** Stop at 100 %, warn at 80 % (the caller sends the alert once). */
export async function checkCap(db: SupabaseClient, tagPrefix: string, capPence: number): Promise<CapCheck> {
  const spent = await monthSpendPence(db, tagPrefix);
  return { allowed: spent < capPence, spent_pence: spent, cap_pence: capPence, warn: spent >= capPence * 0.8 };
}
