import type { SupabaseClient } from "@supabase/supabase-js";
import { nudgeCounts } from "./reminders";
import { listOccasions } from "./server";
import type { GiftStatus } from "./types";

/** The briefing's gifts fact (spec §6): counts only, so the morning line never names a person. */
export type GiftsBlock = { occasions: number; nothing_bought: number; horizon_days: number };

const HORIZON_DAYS = 30;

export async function upcomingGiftOccasions(db: SupabaseClient, today: string): Promise<GiftsBlock> {
  const rows = await listOccasions(db, { today });
  if (rows.length === 0) return { occasions: 0, nothing_bought: 0, horizon_days: HORIZON_DAYS };
  const { data } = await db.from("gifts").select("occasion_id, status").in("occasion_id", rows.map((r) => r.id)).limit(5000);
  const by = new Map<string, Array<{ status: GiftStatus }>>();
  for (const g of (data ?? []) as Array<{ occasion_id: string; status: GiftStatus }>) by.set(g.occasion_id, [...(by.get(g.occasion_id) ?? []), g]);
  const counts = nudgeCounts(rows.map((o) => ({ occasion: o, gifts: by.get(o.id) ?? [] })), today, HORIZON_DAYS);
  return { occasions: counts.occasions, nothing_bought: counts.nothing_bought, horizon_days: HORIZON_DAYS };
}
