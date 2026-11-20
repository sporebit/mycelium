/**
 * The Sunday digest: one Telegram message a week, inside the day's three,
 * naming the week's count and the few worth a look, with a link to the
 * week's page. The words are in ./week.ts (pure); this is the sending.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { bannedIn } from "@/lib/daily/words";
import { interrupt } from "@/lib/nudges/interrupt";
import type { FindRow } from "./types";
import { digestText, isSundayEvening, weekStart } from "./week";

export const DIGEST_KIND = "finds_digest";
export const DIGEST_PATH = "/studio/finds";

export { digestText, isSundayEvening, weekStart } from "./week";

/** Already sent for the week holding `now`? Read from the interruptions ledger, which is what counts. */
export async function digestSentThisWeek(db: SupabaseClient, uid: string, now: Date): Promise<boolean> {
  const { data } = await db.from("interruptions").select("id").eq("created_by", uid).eq("kind", DIGEST_KIND).gte("day", weekStart(now)).limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Send the week's digest on Telegram, once, on Sunday evening. Returns
 * what happened: sent, nothing to say, already sent, not the time, held
 * for wording, or the budget's reason.
 */
export async function sendDigest(db: SupabaseClient, uid: string, rows: readonly FindRow[], now: Date): Promise<string> {
  if (!isSundayEvening(now)) return "not_time";
  if (await digestSentThisWeek(db, uid, now)) return "already";
  const text = digestText(rows);
  if (!text) return "nothing";
  const banned = bannedIn(`${text.title} ${text.body}`);
  if (banned) {
    console.error(`[finds] digest held back for wording: ${banned}`);
    return "wording";
  }
  const res = await interrupt(db, uid, { kind: DIGEST_KIND, title: text.title, body: text.body, url: DIGEST_PATH, channels: ["telegram"], origin: "app" }, now);
  return res.sent ? "sent" : res.reason;
}
