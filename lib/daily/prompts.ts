/**
 * The two prompts of the day (master run §6): the morning pick and the
 * evening close. Each is offered once a day, by whichever of these comes
 * first:
 *
 *   morning   the phone's alarm-stopped automation (it shows the line itself)
 *             · the morning briefing (the pick is its first line)
 *             · the fallback push at the person's morning time
 *   evening   the phone's charger automation (it shows the line itself)
 *             · the Day log's evening message (the close is its first line)
 *             · the fallback push at the person's evening time
 *
 * So the day has three app-started moments at most (morning, the afternoon
 * check-in, evening), which is the interruption budget. When the phone asks,
 * the phone is already showing the answer: no push is sent on top of it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isQuietAt } from "@/lib/nudges/budget";
import { interrupt } from "@/lib/nudges/interrupt";
import { ensurePlan, markEveningPrompted, markPrompted, type Plan, summarise } from "./server";
import { type DailySettings, dailySettings } from "./settings";
import { type TodayView, viewOf } from "./view";
import { eveningPrompt, morningPrompt, spoken } from "./words";

export type PromptResult = { prompted: boolean; say: string };

type MorningWords = { title: string; body: string; say: string; view: TodayView; plan: Plan; card: { title: string; firstStep: string; minutes: number } | null };

export async function morningWords(db: SupabaseClient, uid: string, settings?: DailySettings): Promise<MorningWords> {
  const s = settings ?? (await dailySettings(db));
  const plan = await ensurePlan(db, uid, undefined, { freeMinutes: s.free_minutes });
  const view = await viewOf(db, plan);
  const card = view.current ? { title: view.current.title, firstStep: view.current.first_step, minutes: view.current.minutes } : null;
  const words = morningPrompt(card, Math.max(0, view.counts.left - 1));
  return { ...words, say: `${words.title}. ${words.body}`, view, plan, card };
}

/**
 * Make sure today has a plan and offer the morning pick, if it has not
 * been offered.
 *
 * `push: false` is the phone's own automation asking: it shows `say`
 * itself, so the server only starts the 45-minute clock. `push: true` is
 * the fallback: one push (or Telegram), counted against the budget.
 */
export async function sendMorningPrompt(db: SupabaseClient, uid: string, opts: { settings?: DailySettings; push: boolean }): Promise<PromptResult & { today: TodayView }> {
  const m = await morningWords(db, uid, opts.settings);
  let prompted = false;
  if (!m.plan.prompted_at && m.plan.status !== "closed") {
    await markPrompted(db, m.plan.id);
    if (opts.push) {
      const res = await interrupt(db, uid, {
        kind: "morning",
        essential: true,
        title: m.title,
        body: m.body,
        url: "/today",
        ticketId: m.view.current?.ticket_id ?? null,
        speak: m.card ? spoken(m.card) : null,
      });
      prompted = res.sent;
    } else {
      prompted = true;
    }
  }
  return { prompted, say: m.say, today: m.view };
}

/**
 * The morning pick as a line for another morning message to carry (the
 * briefing). Null when the pick was already offered today or there is
 * nothing on the card. `taken()` records that it was carried: the fallback
 * then says nothing, and the 45-minute clock starts.
 */
export async function morningLineToCarry(db: SupabaseClient, uid: string): Promise<{ line: string; ticketId: string | null; taken: () => Promise<void> } | null> {
  const m = await morningWords(db, uid);
  if (m.plan.prompted_at || m.plan.status === "closed" || !m.card) return null;
  return { line: m.say, ticketId: m.view.current?.ticket_id ?? null, taken: () => markPrompted(db, m.plan.id) };
}

function eveningWords(plan: Plan): { title: string; body: string; say: string } {
  const done = summarise(plan).done;
  const left = plan.items.filter((i) => i.state === "planned" || i.state === "started").length;
  const words = eveningPrompt(done, left);
  return { ...words, say: `${words.title}. ${words.body}` };
}

/** Offer the evening close, once. A closed day is not offered again. `push` as for the morning. */
export async function sendEveningPrompt(db: SupabaseClient, uid: string, plan: Plan, opts: { push: boolean }): Promise<PromptResult> {
  if (plan.status === "closed") return { prompted: false, say: "Day closed." };
  const words = eveningWords(plan);
  if (plan.evening_prompted_at) return { prompted: false, say: words.say };
  // Claim the moment first: the charger, the Day log message and the fallback may all arrive within the same minute.
  if (!(await markEveningPrompted(db, plan.id))) return { prompted: false, say: words.say };
  if (!opts.push) return { prompted: true, say: words.say };
  const res = await interrupt(db, uid, { kind: "evening", essential: true, title: words.title, body: words.body, url: "/close" });
  return { prompted: res.sent, say: words.say };
}

/**
 * The evening close as a line for the Day log's evening message to carry.
 * Null when it was already offered, the day is closed, or there is nothing
 * for the close to show. `taken()` claims the moment.
 */
export async function eveningLineToCarry(db: SupabaseClient, uid: string): Promise<{ line: string; taken: () => Promise<boolean> } | null> {
  const settings = await dailySettings(db);
  const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
  if (plan.status === "closed" || plan.evening_prompted_at) return null;
  if (!(await somethingToClose(db, uid, plan))) return null;
  return { line: eveningWords(plan).say, taken: () => markEveningPrompted(db, plan.id) };
}

async function somethingToClose(db: SupabaseClient, uid: string, plan: Plan): Promise<boolean> {
  const open = plan.items.filter((i) => i.state === "planned" || i.state === "started").length;
  if (open > 0 || summarise(plan).done > 0) return true;
  const { count } = await db
    .from("raw_captures")
    .select("id", { count: "exact", head: true })
    .eq("created_by", uid)
    .is("reviewed_at", null)
    .is("discarded_at", null)
    .is("deleted_at", null)
    .is("auto_filed_at", null)
    .eq("status", "processed");
  return (count ?? 0) > 0;
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
  const due = dueFallbacks(settings, {
    time,
    morningSent: !!plan.prompted_at,
    eveningSent: !!plan.evening_prompted_at,
    closed: plan.status === "closed",
    hasCard: open > 0,
    hasSomethingToClose: time >= settings.evening_fallback ? await somethingToClose(db, uid, plan) : false,
  });
  const out = { morning: false, evening: false };
  if (due.morning) out.morning = (await sendMorningPrompt(db, uid, { settings, push: true })).prompted;
  if (due.evening) out.evening = (await sendEveningPrompt(db, uid, plan, { push: true })).prompted;
  return out;
}
