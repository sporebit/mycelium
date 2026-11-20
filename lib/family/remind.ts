/**
 * What the family space says unprompted (master run §8), and when:
 *
 *   - an appointment: the evening before (from 18:00) and two hours before.
 *     They put it in the calendar themselves, so it is sent whatever the
 *     hour and whatever else has been sent today: a scan that is forgotten
 *     costs more than an interruption.
 *   - the week's letter question: Sunday evening, once, to anyone who has
 *     not answered it. That one is the app speaking, so it takes its place
 *     in the day's budget of three like everything else.
 *
 * Each person is reminded for themselves. Which reminders have gone is
 * kept on the appointment (`reminded`, a key per reminder per person) and
 * claimed BEFORE sending, so two knocks in the same minute send one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { londonClock, shiftDate } from "@/lib/daylog/day";
import { interrupt } from "@/lib/nudges/interrupt";
import { monthlyBillsDue, type BillRow } from "./bills";
import { offsetFor, questionFor } from "./letters";
import { familyCtx } from "./server";

export type Appointment = { id: string; title: string; starts_at: string; place: string | null; reminded: Record<string, unknown>; created_at: string };
export type ReminderKey = "day_before" | "two_hours";
export type DueReminder = { entry: Appointment; which: ReminderKey; key: string };

const TWO_HOURS = 2 * 3_600_000;
const EVENING = 18 * 60;
export const reminderKey = (which: ReminderKey, uid: string) => `${which}_${uid.replace(/-/g, "")}`;

/**
 * The reminders due for one person right now. Pure. A reminder whose
 * moment had already come when the appointment was written down is not
 * sent: someone who books a scan an hour ahead does not need telling.
 */
export function dueReminders(entries: readonly Appointment[], now: Date, uid: string): DueReminder[] {
  const clock = londonClock(now);
  const tomorrow = shiftDate(clock.date, 1);
  const out: DueReminder[] = [];
  for (const entry of entries) {
    const starts = Date.parse(entry.starts_at);
    const toGo = starts - now.getTime();
    if (Number.isNaN(starts) || toGo <= 0) continue;
    const made = Date.parse(entry.created_at);
    const day = londonClock(new Date(starts)).date;

    if (toGo <= TWO_HOURS && made < starts - TWO_HOURS) {
      const key = reminderKey("two_hours", uid);
      if (!entry.reminded[key]) out.push({ entry, which: "two_hours", key });
      continue; // inside two hours the evening-before one has had its day
    }
    if (day === tomorrow && clock.minutes >= EVENING) {
      const madeAt = londonClock(new Date(made));
      const before = madeAt.date < clock.date || (madeAt.date === clock.date && madeAt.minutes < EVENING);
      const key = reminderKey("day_before", uid);
      if (before && !entry.reminded[key]) out.push({ entry, which: "day_before", key });
    }
  }
  return out;
}

const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(iso));

export function reminderWords(d: DueReminder): { title: string; body: string | undefined } {
  const lead = d.which === "day_before" ? "Tomorrow" : "In two hours";
  return { title: `${lead}: ${d.entry.title}, ${hhmm(d.entry.starts_at)}`, body: d.entry.place ?? undefined };
}

/** Sunday from 18:00 London: the hour the week's question is offered to whoever has not answered it. */
export function letterPromptDue(now: Date): boolean {
  const clock = londonClock(now);
  const weekday = new Date(`${clock.date}T00:00:00Z`).getUTCDay();
  return weekday === 0 && clock.minutes >= EVENING;
}

export type FamilyTick = { appointments: number; letter: boolean; bills: number };

/**
 * The month's rows for the household bills marked monthly (lib/family/bills.ts;
 * 0180). Runs as whichever member's turn it is; the unique index makes a
 * second member's turn, or a second knock, write nothing more. Returns how
 * many rows this turn wrote.
 */
export async function addMonthlyBills(db: SupabaseClient, spaceId: string, now: Date): Promise<number> {
  const { data } = await db
    .from("household_costs")
    .select("id, title, amount_pence, paid_by, paid_on, category, recurs, recurs_from")
    .eq("space_id", spaceId)
    .or("recurs.eq.monthly,recurs_from.not.is.null")
    .order("paid_on")
    .limit(500);
  let wrote = 0;
  for (const row of monthlyBillsDue((data ?? []) as BillRow[], londonClock(now).date)) {
    const { error } = await db.from("household_costs").insert({ ...row, space_id: spaceId });
    if (!error) wrote += 1;
    else if (error.code !== "23505") console.error("[family] bill not added:", error.message); // 23505: another turn wrote this month's row first
  }
  return wrote;
}

/** One person's turn, as that person. */
export async function runFamilyTick(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<FamilyTick> {
  const out: FamilyTick = { appointments: 0, letter: false, bills: 0 };
  const ctx = await familyCtx(db, uid);
  if (!ctx) return out;
  out.bills = await addMonthlyBills(db, ctx.spaceId, now);

  const { data } = await db
    .from("family_entries")
    .select("id, title, starts_at, place, reminded, created_at")
    .eq("space_id", ctx.spaceId)
    .eq("kind", "appointment")
    .gt("starts_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + 36 * 3_600_000).toISOString())
    .limit(50);
  for (const due of dueReminders((data ?? []) as Appointment[], now, uid)) {
    // Claim it first: the row is changed only if this reminder has not been recorded, and it is sent only if it was.
    const { data: claimed } = await db
      .from("family_entries")
      .update({ reminded: { ...due.entry.reminded, [due.key]: now.toISOString() } })
      .eq("id", due.entry.id)
      .filter(`reminded->>${due.key}`, "is", null)
      .select("id");
    if (!claimed || claimed.length === 0) continue;
    const words = reminderWords(due);
    const sent = await interrupt(db, uid, { kind: "family_appointment", title: words.title, body: words.body, url: "/family", essential: true, atChosenTime: true, speak: words.title }, now);
    if (sent.sent) out.appointments += 1;
  }

  if (letterPromptDue(now)) {
    const today = londonClock(now).date;
    const q = questionFor(today, offsetFor(ctx.spaceId));
    const [answered, asked] = await Promise.all([
      db.from("family_entries").select("id").eq("space_id", ctx.spaceId).eq("kind", "letter").eq("created_by", uid).eq("prompt", q.question).gte("happened_on", q.week_of).limit(1),
      db.from("interruptions").select("id").eq("kind", "family_letter").gte("day", q.week_of).limit(1),
    ]);
    if ((answered.data ?? []).length === 0 && (asked.data ?? []).length === 0) {
      const sent = await interrupt(db, uid, { kind: "family_letter", title: "This week's question for the baby", body: q.question, url: "/family?tab=letters" }, now);
      out.letter = sent.sent;
    }
  }
  return out;
}
