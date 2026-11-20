/**
 * Every sentence the daily loop says, in one place (research §3 "Wording").
 *
 * State facts and offer options. No "should", "must", "need to", "just" or
 * "only"; no "overdue", "missed", "failed", "late", "don't forget", "you
 * still haven't". Literal language, no idioms. Buttons say what they do.
 * `words.test.ts` reads every string here and every sentence these
 * functions can produce, and fails on a banned word, so a new line cannot
 * slip one in.
 */

export const BUTTONS = {
  start: "Start",
  notNow: "Not now",
  swap: "Swap",
  done: "Done",
  moreTime: "10 more minutes",
  park: "Park",
  looksRight: "Looks right",
  closeDay: "Close the day",
  finish: "Finish",
  goodEnough: "Good enough — close as is",
  drop: "Drop",
  reDate: "Re-date",
  someday: "Someday",
  tomorrow: "Tomorrow",
  keep: "Keep for tomorrow",
} as const;

export const LABELS = {
  win: "Today's one thing",
  extra: "If there's time",
  then: "Then",
  firstStep: "First step",
  leftOff: "Where I left off",
  nothingToday: "Nothing is lined up for today.",
  nothingTodayHint: "Capture something, or pick from Next.",
  welcomeBack: "Welcome back. Nothing's been lost. Here's one thing.",
  dayWon: "That was today's one thing. The day is won.",
  dayClosed: "Day closed.",
  parkOneFirst: "Park one of these to start this.",
  timerDone: "Time is up.",
  slipped: "This has had a date for a while. What now?",
} as const;

/** "About 30 min" / "About 1 h 15 min". */
export function about(minutes: number): string {
  const m = Math.max(5, Math.round(minutes / 5) * 5);
  if (m < 60) return `About ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `About ${h} h ${rest} min` : `About ${h} h`;
}

/** A fallback first step when the ticket has none: concrete, five minutes, no pressure. */
export function defaultFirstStep(title: string): string {
  return `Open "${trimTitle(title, 60)}" and write down the very next action.`;
}

export function trimTitle(title: string, max = 80): string {
  const t = title.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export type CardWords = { title: string; firstStep: string; minutes: number; then?: string | null };

/** The focus card as one line, for a push, Telegram or the wall: "Next up: boiler quote. First step: find the email. About 5 min." */
export function nextUp(c: CardWords): string {
  return `Next up: ${trimTitle(c.title, 70)}. First step: ${stripStop(c.firstStep)}. ${about(c.minutes)}.`;
}

/** The morning prompt. One tap or none: it applies itself. */
export function morningPrompt(c: CardWords | null, extras: number): { title: string; body: string } {
  if (!c) return { title: "Today", body: `${LABELS.nothingToday} ${LABELS.nothingTodayHint}` };
  const more = extras > 0 ? ` Then ${extras} more if there's time.` : "";
  return { title: `Today: ${trimTitle(c.title, 60)}`, body: `First step: ${stripStop(c.firstStep)}. ${about(c.minutes)}.${more}` };
}

/** The evening prompt. Opens with what got done (rule 18). */
export function eveningPrompt(done: number, left: number): { title: string; body: string } {
  const got = done === 0 ? "Nothing finished today, and that is fine." : `${done} finished today.`;
  const rest = left > 0 ? ` ${left} to move or drop.` : "";
  return { title: "Close the day", body: `${got}${rest} About 2 minutes.` };
}

/** "Boiler quote moved to tomorrow." */
export function moved(title: string, to: "tomorrow" | string): string {
  return `${trimTitle(title, 60)} moved to ${to}.`;
}

/** What the wall says aloud: twelve words or fewer (rule 29). */
export function spoken(c: CardWords): string {
  const words = `Next up: ${trimTitle(c.title, 40)}. ${about(c.minutes)}.`.split(/\s+/);
  return words.slice(0, 12).join(" ");
}

/** "It's 14:10. This takes about 20 min." — time made visible, never a warning. */
export function timeCheck(hhmm: string, minutes: number): string {
  return `It's ${hhmm}. This takes ${about(minutes).toLowerCase()}.`;
}

/** "Two steps left on the shed. Next: order the hinges." */
export function finishLine(title: string, stepsLeft: number, next: string | null): string {
  const steps = stepsLeft === 1 ? "One step left" : `${numberWord(stepsLeft)} steps left`;
  return `${steps} on ${trimTitle(title, 50)}.${next ? ` Next: ${stripStop(next)}.` : ""}`;
}

function numberWord(n: number): string {
  return ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][n] ?? String(n);
}

function stripStop(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[.!?…]+$/, "");
}

/* ------------------------------------------------------------------ */
/* The weekly close-out (research rules 23, 25, 32) and the notices  */
/* before a scheduled switch (rule 27).                                */
/* ------------------------------------------------------------------ */

export const CLOSEOUT = {
  title: "The week, closed",
  planAsk: "What will these forty-five minutes do? One line.",
  planHint: "Said at the start, reported at the end. The box closes either way.",
  begin: "Begin",
  reportAsk: "How did it go? One line.",
  finish: "Close the week",
  closed: "Week closed.",
  boxOver: "The forty-five minutes are up. Close the week whenever you're ready.",
  fill: "This week",
  lifetime: "Lifetime",
  section: "Gone quiet",
  keep: "Keep",
  pause: "Pause",
  retire: "Retire",
  whyAsk: "Why?",
  whyHint: "A sentence is plenty.",
  screenAsk: "Screen Time this week, from the phone (minutes).",
  partnerOne: "Are the nudges helping him?",
  partnerTwo: "Are they costing her?",
  measuresTitle: "The month, measured",
  measuresHint: "Computed from what happened, once a month, kept so months compare. Not on the home screen.",
  nothingQuiet: "Everything is in use. Nothing to raise.",
  notYet: "The close-out is on",
} as const;

/** "4 win days. 11 finished of 14 started." — the week's fill as one line (rule 25: filled, never broken). */
export function fillLine(fill: { win_days: number; finished: number; started: number }): string {
  const days = `${fill.win_days} win ${fill.win_days === 1 ? "day" : "days"}`;
  if (!fill.started) return `${days}. Nothing started yet this week.`;
  return `${days}. ${fill.finished} finished of ${fill.started} started.`;
}

/** "212 win days, 1,480 things finished, 51 weeks closed." — totals that can grow and never reset. */
export function lifetimeLine(t: { win_days: number; finished: number; weeks_closed: number }): string {
  const n = (v: number) => v.toLocaleString("en-GB");
  return `${n(t.win_days)} win ${t.win_days === 1 ? "day" : "days"}, ${n(t.finished)} ${t.finished === 1 ? "thing" : "things"} finished, ${n(t.weeks_closed)} ${t.weeks_closed === 1 ? "week" : "weeks"} closed.`;
}

/** The notice before a scheduled switch: what is next and how long until it. Never "hurry", never "late". */
export function switchNotice(title: string, minutes: number): { title: string; body: string } {
  const when = minutes <= 1 ? "in a minute" : `in ${minutes} min`;
  return { title: `${trimTitle(title, 60)} ${when}.`, body: minutes > 5 ? "Time to find a stopping place." : "Time to stop and switch." };
}

/** The close-out's own notice, the same slot each week. */
export function closeoutNotice(minutes: number): { title: string; body: string } {
  return { title: `The week's close-out starts in ${minutes} min.`, body: "Forty-five minutes. Say what it will do at the start." };
}

/** The timer's own countdown, said on the screen it is already on. */
export function timerNotice(minutesLeft: number): string | null {
  if (minutesLeft === 10) return "Ten minutes left.";
  if (minutesLeft === 2) return "Two minutes left. Find a stopping place.";
  return null;
}

/**
 * Words the app never says to a person about their own work. Checked by the
 * test against everything above; exported so other features can check
 * their own copy the same way.
 */
export const NEVER_SAY: readonly RegExp[] = [
  /\boverdue\b/i,
  /\bmissed\b/i,
  /\bfail(ed|ure|ing)?\b/i,
  /\blate\b/i,
  /\bbehind\b/i,
  /don'?t forget/i,
  /still haven'?t/i,
  /\bshould\b/i,
  /\bmust\b/i,
  /\bneed(s)? to\b/i,
  /\bjust\b/i,
  /\bonly\b/i,
  /\bhurry\b/i,
  /\bstreak (lost|broken)\b/i,
  /you'?ve been away/i,
  /don'?t give up/i,
  /\bwhy haven'?t\b/i,
];

export function bannedIn(text: string): string | null {
  for (const re of NEVER_SAY) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}
