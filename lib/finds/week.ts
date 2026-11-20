/**
 * The week's shape and the Sunday digest's words. Pure: no database, no
 * transport, so the wording can be tested against the words the app never
 * says (lib/daily/words.ts) without loading the interruption door.
 */
import { londonClock } from "@/lib/daylog/day";
import type { FindRow } from "./types";

/** London minutes after which the Sunday digest may go. */
export const DIGEST_FROM_MINUTES = 17 * 60;

/** The Monday (London date) that starts the week holding `now`. */
export function weekStart(now: Date): string {
  const { date } = londonClock(now);
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function isSundayEvening(now: Date): boolean {
  const { date, minutes } = londonClock(now);
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 0 && minutes >= DIGEST_FROM_MINUTES;
}

const trim = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** The message. Null when there is nothing to say. */
export function digestText(rows: readonly FindRow[]): { title: string; body: string } | null {
  if (!rows.length) return null;
  const useNow = rows.filter((r) => r.verdict?.verdict === "use_now");
  const maybe = rows.filter((r) => r.verdict?.verdict === "maybe_later");
  const advisories = rows.filter((r) => r.kind === "advisory");
  const lines: string[] = [];
  lines.push(`${rows.length} find${rows.length === 1 ? "" : "s"} this week, ${rows.filter((r) => r.verdict).length} with a verdict.`);
  if (useNow.length) {
    lines.push("", `Worth a look now (${useNow.length}):`);
    for (const r of useNow.slice(0, 5)) lines.push(`• ${trim(r.title, 60)} — ${trim(r.verdict?.summary ?? "", 90)}`);
  }
  if (maybe.length) lines.push("", `Maybe later: ${maybe.length} (${maybe.slice(0, 3).map((r) => trim(r.title, 40)).join(", ")}${maybe.length > 3 ? ", …" : ""}).`);
  if (advisories.length) lines.push("", `${advisories.length} security advisor${advisories.length === 1 ? "y" : "ies"} for the stack; the page has the fixed versions.`);
  lines.push("", "Keep or skip each on the week's page.");
  return { title: "This week's finds", body: lines.join("\n") };
}
