/**
 * The ledger for the 2026-11-28 run (plan step T4): hours and pounds per
 * epic against the evenings Phil has before June 2027.
 *
 *   node scripts/run-ledger.ts            prints the markdown table
 *
 * Reads docs/run/2026-11-28/tickets/*.json. Points become hours by who does
 * the work (see RATES); pounds come from each ticket's "## Cost" section
 * where it names a figure, otherwise from the plan's own notes. The
 * assumptions are printed with the table so the reader can disagree with
 * them in one place.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "docs/run/2026-11-28/tickets");

type Ticket = { sid: string; title: string; kind: string; points: number; due: string | null; who?: string; description: string };
type EpicFile = { epic: { sid: string; project: string; title: string }; tickets: Ticket[] };

/** Hours of Phil's own time per point, by who does the ticket. */
const RATES: Record<string, Record<number, number>> = {
  // Phil at the keyboard or in the house: a point is a 15-minute sitting at 1 and 2, then evenings
  P: { 1: 0.25, 2: 0.5, 3: 1.5, 5: 4, 8: 8, 13: 16 },
  PK: { 1: 0.25, 2: 0.5, 3: 1.5, 5: 4, 8: 8, 13: 16 },
  K: { 1: 0.1, 2: 0.2, 3: 0.5, 5: 1, 8: 2, 13: 4 },
  // Claude prepares, Phil approves or signs in: his share is the sitting plus a look
  PC: { 1: 0.25, 2: 0.5, 3: 1, 5: 2, 8: 3, 13: 5 },
  // Claude's work: Phil's share is review, approval and the live check
  C: { 1: 0.1, 2: 0.2, 3: 0.5, 5: 1, 8: 2, 13: 4 },
};
/** Claude's own working hours per point (for the "Claude hours" column; free on his plan, but it is still elapsed time). */
const CLAUDE: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 1.5, 5: 4, 8: 10, 13: 20 };

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const rows: Array<{ epic: string; project: string; tickets: number; phil: number; claude: number; pounds: string[]; dated: number; sittings: number }> = [];

const poundRe = /£\s?([\d,]+(?:\.\d+)?)(?:\s*(?:to|-)\s*£?\s?([\d,]+(?:\.\d+)?))?/g;

for (const f of files) {
  const data = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as EpicFile;
  let phil = 0;
  let claude = 0;
  let sittings = 0;
  let dated = 0;
  const pounds: string[] = [];
  for (const t of data.tickets) {
    const who = (t.who ?? "C").toUpperCase();
    const rate = RATES[who] ?? RATES.C;
    phil += rate[t.points] ?? t.points;
    if (who.includes("C")) claude += CLAUDE[t.points] ?? t.points;
    if (who.startsWith("P") && t.points <= 2) sittings += t.points;
    if (t.due) dated += 1;
    const cost = t.description.split(/\n## /).find((s) => s.startsWith("Cost"));
    if (cost) {
      const found = Array.from(cost.matchAll(poundRe)).map((m) => (m[2] ? `£${m[1]} to £${m[2]}` : `£${m[1]}`));
      if (found.length) pounds.push(`${t.sid}: ${found.join(", ")}`);
      else if (/to be priced|not yet priced|priced later/i.test(cost)) pounds.push(`${t.sid}: to be priced`);
    }
  }
  rows.push({ epic: data.epic.title, project: data.epic.project, tickets: data.tickets.length, phil, claude, pounds, dated, sittings });
}

const totalPhil = rows.reduce((n, r) => n + r.phil, 0);
const totalClaude = rows.reduce((n, r) => n + r.claude, 0);
const totalTickets = rows.reduce((n, r) => n + r.tickets, 0);

// The evenings: 2026-12-01 to 2027-05-15 (everything essential a month before the due date)
const weeks = Math.round((Date.UTC(2027, 4, 15) - Date.UTC(2026, 11, 1)) / (7 * 86_400_000));
const EVENINGS_A_WEEK = 4;
const HOURS_AN_EVENING = 1.5;
const FIXFORWARD_HOURS_A_WEEK = 3.5; // the middle of "2 to 5"
const capacity = weeks * EVENINGS_A_WEEK * HOURS_AN_EVENING;
const fixfHours = weeks * FIXFORWARD_HOURS_A_WEEK;

const fmt = (n: number) => (Math.round(n * 2) / 2).toFixed(1);
console.log(`| Epic | Project | Tickets | Dated | Phil's sittings (1 to 2 pt) | Phil's hours | Claude's hours | Pounds named |`);
console.log(`|---|---|---|---|---|---|---|---|`);
for (const r of rows.sort((a, b) => b.phil - a.phil)) {
  console.log(`| ${r.epic} | ${r.project} | ${r.tickets} | ${r.dated} | ${r.sittings} | ${fmt(r.phil)} | ${fmt(r.claude)} | ${r.pounds.length ? r.pounds.join("; ") : "none named"} |`);
}
console.log(`| **Total** | | **${totalTickets}** | | | **${fmt(totalPhil)}** | **${fmt(totalClaude)}** | |`);
console.log();
console.log(`Weeks from 2026-12-01 to 2027-05-15: ${weeks}. Evenings a week: ${EVENINGS_A_WEEK} of ${HOURS_AN_EVENING} h = ${fmt(capacity)} h of evenings, plus FixForward's own ${FIXFORWARD_HOURS_A_WEEK} h a week = ${fmt(fixfHours)} h.`);
console.log(`Phil's hours in the plan: ${fmt(totalPhil)} h = ${(totalPhil / (EVENINGS_A_WEEK * HOURS_AN_EVENING)).toFixed(1)} weeks of evenings = ${(totalPhil / (EVENINGS_A_WEEK * HOURS_AN_EVENING) / 4.33).toFixed(1)} months of evenings, against ${(weeks / 4.33).toFixed(1)} months available.`);
