/**
 * May the app interrupt now? (research rules 26 and 27; Phil, 2026-11-20:
 * one budget of three a day across push, Telegram and wall speech.)
 *
 * Pure: the facts in, a decision out. The four reasons to stay quiet, in
 * the order they are checked:
 *   quiet   it is inside quiet hours
 *   focus   a focus timer is running; nothing fires until it ends
 *   budget  today's app-started interruptions are used up
 *   repeat  the same nudge in the same words went out recently and was
 *           not acted on; saying it again is nagging
 * Only what the APP starts is weighed. A nudge from a person, and a reply
 * to something the person started themselves ("Saved", "Filed as …"), always
 * go through and never count.
 */

export type Origin = "app" | "person" | "reply";
export type Channel = "push" | "telegram" | "wall";

export type Decision =
  | { allow: true; counted: boolean }
  | { allow: false; reason: "quiet" | "focus" | "budget" | "repeat" };

export type DecideInput = {
  origin: Origin;
  /** Minutes since midnight, London. */
  minutesNow: number;
  quietFrom: string;
  quietTo: string;
  timerRunning: boolean;
  /** App-started interruptions already counted today. */
  countedToday: number;
  budget: number;
  /** Wordings sent in the last week that were not acted on. */
  recentUnanswered: readonly string[];
  wording?: string | null;
  /**
   * The two prompts the loop itself is built on (morning pick, evening
   * close) are sent even when the budget is spent by other things, because
   * without them there is no loop; they still count, still respect quiet
   * hours and still wait for a focus timer.
   */
  essential?: boolean;
};

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True inside the quiet window, which may run over midnight ("22:00" → "07:00"). */
export function isQuietAt(minutesNow: number, from: string, to: string): boolean {
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a === b) return false;
  return a < b ? minutesNow >= a && minutesNow < b : minutesNow >= a || minutesNow < b;
}

export function decide(input: DecideInput): Decision {
  if (input.origin !== "app") return { allow: true, counted: false };
  if (isQuietAt(input.minutesNow, input.quietFrom, input.quietTo)) return { allow: false, reason: "quiet" };
  if (input.timerRunning) return { allow: false, reason: "focus" };
  if (!input.essential && input.countedToday >= input.budget) return { allow: false, reason: "budget" };
  if (input.wording && input.recentUnanswered.includes(input.wording)) return { allow: false, reason: "repeat" };
  return { allow: true, counted: true };
}

/** A stable key for "the same nudge in the same words": what was said, about what. */
export function wordingKey(kind: string, text: string, ticketId?: string | null): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
  return `${kind}|${ticketId ?? ""}|${norm}`;
}
