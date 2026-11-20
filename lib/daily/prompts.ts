/**
 * The two prompts of the day (master run §6): the morning pick and the
 * evening close. Each is sent at most once a day, whoever asks: the iPhone
 * automation (alarm stopped, charger connected) or the fallback tick when
 * neither happened.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { interrupt } from "@/lib/nudges/interrupt";
import { isQuietAt } from "@/lib/nudges/budget";
import { ensurePlan, markPrompted, type Plan, summarise } from "./server";
import { type DailySettings, dailySettings } from "./settings";
import { type TodayView, viewOf } from "./view";
import { eveningPrompt, morningPrompt, spoken } from "./words";

export type PromptResult = { prompted: boolean; say: string };

/** Make sure today has a plan, and send the morning prompt if it has not gone out. */
export async function sendMorningPrompt(db: SupabaseClient, uid: string, settings?: DailySettings): Promise<PromptResult & { today: TodayView }> {
  const s = settings ?? (await dailySettings(db));
  const plan = await ensurePlan(db, uid, undefined, { freeMinutes: s.free_minutes });
  const view = await viewOf(db, plan);
  const card = view.current ? { title: view.current.title, firstStep: view.current.first_step, minutes: view.current.minutes } : null;
  const words = morningPrompt(card, Math.max(0, view.counts.left - 1));
  let prompted = false;
  if (!plan.prompted_at && plan.status !== "closed") {
    await markPrompted(db, plan.id);
    const res = await interrupt(db, uid, {
      kind: "morning",
      essential: true,
      title: words.title,
      body: words.body,
      url: "/today",
      ticketId: view.current?.ticket_id ?? null,
      speak: card ? spoken(card) : null,
    });
    prompted = res.sent;
  }
  return { prompted, say: `${words.title}. ${words.body}`, today: view };
}

async function eveningAlreadySent(db: SupabaseClient, uid: string, day: string): Promise<boolean> {
  const { data } = await db.from("interruptions").select("id").eq("created_by", uid).eq("kind", "evening").eq("day", day).limit(1);
  return !!data?.length;
}

/** Offer the evening close, once. A closed day is not offered again. */
export async function sendEveningPrompt(db: SupabaseClient, uid: string, plan: Plan): Promise<PromptResult> {
  if (plan.status === "closed") return { prompted: false, say: "Day closed." };
  const done = summarise(plan).done;
  const left = plan.items.filter((i) => i.state === "planned" || i.state === "started").length;
  const words = eveningPrompt(done, left);
  const say = `${words.title}. ${words.body}`;
  // Once a day: the charger and the fallback time may both fire.
  if (await eveningAlreadySent(db, uid, plan.day)) return { prompted: false, say };
  const res = await interrupt(db, uid, { kind: "evening", essential: true, title: words.title, body: words.body, url: "/close" });
  return { prompted: res.sent, say };
}

export type FallbackState = {
  /** London wall-clock time, "HH:MM". */
  time: string;
  morningSent: boolean;
  eveningSent: boolean;
  closed: boolean;
  /** Is there anything on today's card? An empty day is not announced. */
  hasCard: boolean;
  /** Anything for the close to show: something planned, something done, or a capture waiting. */
  hasSomethingToClose: boolean;
};

/** The morning fallback stops mattering at midday: a prompt after that is not a morning pick. */
export const MORNING_FALLBACK_UNTIL = "12:00";

/**
 * Which fallback prompts are due now. Pure.
 *
 * The automations are the real triggers; these are for the day the alarm
 * was not used or the phone never went on charge. "HH:MM" strings compare
 * correctly as text.
 */
export function dueFallbacks(settings: Pick<DailySettings, "morning_fallback" | "evening_fallback">, s: FallbackState): { morning: boolean; evening: boolean } {
  const morning = !s.morningSent && !s.closed && s.hasCard && s.time >= settings.morning_fallback && s.time < MORNING_FALLBACK_UNTIL;
  const evening = !s.eveningSent && !s.closed && s.hasSomethingToClose && s.time >= settings.evening_fallback;
  return { morning, evening };
}

/** Run the fallbacks for one person, as that person. Returns what was sent. */
export async function runFallbacks(db: SupabaseClient, uid: string, time: string): Promise<{ morning: boolean; evening: boolean }> {
  const settings = await dailySettings(db);
  // Cheap exits: nothing can be due before the earlier of the two times, and nothing app-started is sent in quiet hours.
  if (time < settings.morning_fallback) return { morning: false, evening: false };
  const [hh, mm] = time.split(":").map(Number);
  if (isQuietAt(hh * 60 + mm, settings.quiet_from, settings.quiet_to)) return { morning: false, evening: false };
  const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
  const open = plan.items.filter((i) => i.state === "planned" || i.state === "started").length;
  const done = summarise(plan).done;
  const { count: waiting } = await db
    .from("raw_captures")
    .select("id", { count: "exact", head: true })
    .eq("created_by", uid)
    .is("reviewed_at", null)
    .is("discarded_at", null)
    .is("deleted_at", null)
    .is("auto_filed_at", null)
    .eq("status", "processed");
  const due = dueFallbacks(settings, {
    time,
    morningSent: !!plan.prompted_at,
    eveningSent: time >= settings.evening_fallback ? await eveningAlreadySent(db, uid, plan.day) : true,
    closed: plan.status === "closed",
    hasCard: open > 0,
    hasSomethingToClose: open > 0 || done > 0 || (waiting ?? 0) > 0,
  });
  const out = { morning: false, evening: false };
  if (due.morning) out.morning = (await sendMorningPrompt(db, uid, settings)).prompted;
  if (due.evening) out.evening = (await sendEveningPrompt(db, uid, plan)).prompted;
  return out;
}
