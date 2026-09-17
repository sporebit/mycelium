/** The old /api/reminders row shape, read off a `kind = reminder` ticket. */

export const REMINDER_SELECT =
  "id, space_id, ticket_key, title, remind_at, remind_sent_at, recurrence_rrule, cancelled_at, completed_at, meta, created_at";

export type ReminderTicketRow = {
  id: string;
  space_id?: string | null;
  ticket_key: string | null;
  title: string;
  remind_at: string | null;
  remind_sent_at: string | null;
  recurrence_rrule: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export function recurrenceFromRrule(rrule: string | null, meta?: Record<string, unknown> | null): string | null {
  const legacy = typeof meta?.legacy_recurrence === "string" ? (meta.legacy_recurrence as string) : null;
  if (legacy) return legacy;
  if (!rrule) return null;
  if (/FREQ=DAILY/i.test(rrule)) return "daily";
  if (/FREQ=WEEKLY/i.test(rrule)) return "weekly";
  if (/FREQ=MONTHLY/i.test(rrule)) return "monthly";
  return rrule;
}

export function rruleFromRecurrence(recurrence: string | null | undefined): string | null {
  const r = (recurrence ?? "").trim().toLowerCase();
  if (r === "daily") return "FREQ=DAILY";
  if (r === "weekly") return "FREQ=WEEKLY";
  if (r === "monthly") return "FREQ=MONTHLY";
  if (/^(RRULE:)?FREQ=/i.test(r)) return r.toUpperCase().replace(/^RRULE:/, "");
  return null;
}

export function reminderFromTicket(t: ReminderTicketRow) {
  return {
    id: t.id,
    key: t.ticket_key,
    message: t.title,
    due_at: t.remind_at ?? t.created_at,
    recurrence: recurrenceFromRrule(t.recurrence_rrule, t.meta),
    sent_at: t.remind_sent_at ?? (t.completed_at && !t.recurrence_rrule ? t.completed_at : null),
    cancelled: !!t.cancelled_at,
    created_at: t.created_at,
  };
}
