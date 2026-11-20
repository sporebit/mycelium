/**
 * The one door through which the app reaches for a person (0161; research
 * rules 26, 27, 29; Phil, 2026-11-20: one budget of three a day across
 * push, Telegram and wall speech).
 *
 * Anything that wants to send a push, a Telegram message or have the wall
 * speak calls interrupt(). It decides (lib/nudges/budget.ts), sends on one
 * channel, and writes the ledger row the budget is counted from. A refused
 * interruption is not lost: the caller is told why, and the thing it was
 * about is still on the person's Today when they next look.
 *
 * `db` acts as the RECIPIENT (their subscriptions, their settings, their
 * ledger), a request client or one from withUser().
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan, timerRunning } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { sendToUser } from "@/lib/push";
import { londonNow } from "@/lib/tickets/categories";
import { sendToPhil } from "@/lib/tickets/notify";
import { todayLondon } from "@/lib/tickets/when";
import { type Channel, decide, type Origin, wordingKey } from "./budget";

export type InterruptInput = {
  /** What it is: "morning", "evening", "chase", "capture_filed", "nudge", … */
  kind: string;
  origin?: Origin;
  title: string;
  body?: string;
  /** Path or URL the tap opens. */
  url?: string;
  ticketId?: string | null;
  /** Morning pick and evening close: the loop itself. See budget.ts. */
  essential?: boolean;
  /**
   * Channels to try, in order; the first that delivers is the one used.
   * Default: push, then Telegram. The wall is added by the caller when the
   * thing is worth saying aloud.
   */
  channels?: Channel[];
  /** Also say it on the wall (twelve words or fewer; the caller supplies them). */
  speak?: string | null;
  /** Sent at a time the person set themselves; see budget.ts. */
  atChosenTime?: boolean;
  /** A notice before a scheduled switch: goes while a timer runs; see budget.ts. */
  switchNotice?: boolean;
  /**
   * The caller sends the message itself (a Telegram message with buttons or
   * its own layout) and says whether it went. The decision and the ledger
   * row are still made here, so it is weighed and counted like any other.
   * `channels` should name the one channel it uses.
   */
  deliver?: () => Promise<boolean>;
};

export type InterruptResult =
  | { sent: true; channel: Channel; counted: boolean; spoken: boolean }
  | { sent: false; reason: "quiet" | "focus" | "budget" | "repeat" | "no_channel" };

type LedgerRow = { counted: boolean; wording: string | null; acted_at: string | null; at: string; day: string };

async function ledger(db: SupabaseClient, uid: string, day: string): Promise<{ countedToday: number; recentUnanswered: string[] }> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await db.from("interruptions").select("counted, wording, acted_at, at, day").eq("created_by", uid).gte("at", since).limit(400);
  const rows = (data ?? []) as LedgerRow[];
  return {
    countedToday: rows.filter((r) => r.day === day && r.counted).length,
    recentUnanswered: rows.filter((r) => r.wording && !r.acted_at).map((r) => r.wording as string),
  };
}

async function deliver(db: SupabaseClient, channel: Channel, input: InterruptInput, isOwner: boolean): Promise<boolean> {
  if (channel === "push") {
    const res = await sendToUser(db, { title: input.title, body: input.body ?? "", url: input.url });
    return res.sent > 0;
  }
  if (channel === "telegram") {
    // Telegram is the owner's only (P12: other users get web and push).
    if (!isOwner) return false;
    const text = [input.title, input.body, input.url ? absolute(input.url) : null].filter(Boolean).join("\n");
    return sendToPhil(text);
  }
  // The wall has no transport of its own: the wall page reads the ledger and speaks rows addressed to it.
  return true;
}

function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = process.env.PUBLIC_BASE_URL?.startsWith("https://mycelium") ? process.env.PUBLIC_BASE_URL : "https://mycelium.sporebit.com";
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function interrupt(db: SupabaseClient, uid: string, input: InterruptInput, now: Date = new Date()): Promise<InterruptResult> {
  const origin = input.origin ?? "app";
  const day = todayLondon(now);
  const [settings, led, plan, profile] = await Promise.all([
    dailySettings(db),
    ledger(db, uid, day),
    origin === "app" ? getPlan(db, uid, day, now).catch(() => null) : Promise.resolve(null),
    db.from("profiles").select("is_instance_owner").eq("id", uid).maybeSingle(),
  ]);
  const wording = wordingKey(input.kind, `${input.title} ${input.body ?? ""}`, input.ticketId);
  const decision = decide({
    origin,
    minutesNow: londonNow(now).minutes,
    quietFrom: settings.quiet_from,
    quietTo: settings.quiet_to,
    timerRunning: timerRunning(plan, now),
    countedToday: led.countedToday,
    budget: settings.interruption_budget,
    recentUnanswered: led.recentUnanswered,
    wording,
    essential: input.essential,
    atChosenTime: input.atChosenTime,
    switchNotice: input.switchNotice,
  });
  if (!decision.allow) return { sent: false, reason: decision.reason };

  const isOwner = profile.data?.is_instance_owner === true;
  let used: Channel | null = null;
  for (const channel of input.channels ?? ["push", "telegram"]) {
    try {
      if (input.deliver ? await input.deliver() : await deliver(db, channel, input, isOwner)) {
        used = channel;
        break;
      }
    } catch (err) {
      console.error(`[interrupt] ${channel} failed:`, err);
    }
  }
  if (!used) return { sent: false, reason: "no_channel" };

  const row = {
    day,
    channel: used,
    kind: input.kind,
    origin,
    counted: decision.counted,
    title: input.title.slice(0, 200),
    body: input.body?.slice(0, 600) ?? null,
    url: input.url ?? null,
    ticket_id: input.ticketId ?? null,
    wording,
  };
  const { error } = await db.from("interruptions").insert(row);
  if (error) console.error("[interrupt] ledger write failed:", error.message);

  // Saying it aloud is the same interruption, not a second one: recorded, never counted twice.
  let spoken = false;
  if (input.speak && used !== "wall") {
    const { error: wallError } = await db.from("interruptions").insert({ ...row, channel: "wall", counted: false, title: input.speak.slice(0, 200), body: null });
    spoken = !wallError;
  }
  return { sent: true, channel: used, counted: decision.counted, spoken };
}

/** Mark the latest unanswered interruption about a ticket (or of a kind) as acted on: the "nudge response" measure reads this. */
export async function markActed(db: SupabaseClient, uid: string, match: { ticketId?: string | null; kind?: string }, action: string, now: Date = new Date()): Promise<void> {
  let q = db.from("interruptions").select("id").eq("created_by", uid).is("acted_at", null).order("at", { ascending: false }).limit(1);
  if (match.ticketId) q = q.eq("ticket_id", match.ticketId);
  if (match.kind) q = q.eq("kind", match.kind);
  const { data } = await q;
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (id) await db.from("interruptions").update({ acted_at: now.toISOString(), action }).eq("id", id);
}
