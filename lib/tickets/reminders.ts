/**
 * Reminders on tickets (spec §8.3 reminders fold): kind = reminder with a
 * remind_at. Sending is shared by /api/cron/reminders (the external
 * cron-job.org schedule that already exists) and /api/cron/tickets-checkins.
 * A recurring reminder re-arms in place from its RRULE; a one-off marks
 * remind_sent_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { reminderKeyboard, sendToPhil } from "./notify";
import { londonDateTimeToIso, londonTimeOf, nextOccurrence } from "./recur";

type DueRow = {
  id: string;
  ticket_key: string | null;
  title: string;
  remind_at: string;
  recurrence_rrule: string | null;
  scheduled_on: string | null;
  created_at: string;
};

export async function sendDueReminders(db: SupabaseClient, today: string): Promise<{ sent: number; rearmed: number }> {
  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("tickets")
    .select("id, ticket_key, title, remind_at, recurrence_rrule, scheduled_on, created_at, ticket_status:ticket_statuses!inner(category)")
    .eq("kind", "reminder")
    .is("deleted_at", null)
    .is("remind_sent_at", null)
    .lte("remind_at", nowIso)
    .in("ticket_status.category", ["inbox", "backlog", "next", "doing", "waiting"])
    .order("remind_at")
    .limit(20);
  let sent = 0;
  let rearmed = 0;
  for (const r of (data ?? []) as unknown as DueRow[]) {
    const key = r.ticket_key ?? r.id.slice(0, 8);
    const ok = await sendToPhil(`⏰ ${r.title}`, reminderKeyboard(r.id, key));
    if (!ok) continue;
    sent += 1;
    await db.from("ticket_activity").insert({ ticket_id: r.id, action: "reminder", field: "remind_at", from_value: null, to_value: "sent" });
    if (r.recurrence_rrule) {
      const start = (r.scheduled_on ?? r.remind_at ?? r.created_at).slice(0, 10);
      const next = nextOccurrence(r.recurrence_rrule, start, today);
      if (next) {
        await db
          .from("tickets")
          .update({ remind_at: londonDateTimeToIso(next, londonTimeOf(r.remind_at)), scheduled_on: next, remind_sent_at: null, updated_at: nowIso })
          .eq("id", r.id);
        rearmed += 1;
        continue;
      }
    }
    await db.from("tickets").update({ remind_sent_at: nowIso, updated_at: nowIso }).eq("id", r.id);
  }
  return { sent, rearmed };
}
