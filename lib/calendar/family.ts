/**
 * The family's appointments on the Calendar page (MYC-186). They are
 * family_entries of kind "appointment", read as the caller, so every member
 * of the family team sees them and nobody else does. Each is marked as the
 * family's by its calendar name, beside the Google Calendar feeds, tasks,
 * birthdays, events and bills already there.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent } from "./fetch";

export const FAMILY_CALENDAR = { name: "Family", colour: "#c79bf5" } as const;
/** An appointment with no end is shown as an hour. */
const APPOINTMENT_MS = 60 * 60_000;

export type FamilyAppointmentRow = { id: string; title: string; starts_at: string; place: string | null; body: string | null; ends_at?: string | null; all_day?: boolean | null };

/** Pure: rows to calendar events, inside the window, soonest first. */
export function familyEvents(rows: readonly FamilyAppointmentRow[], windowStart: Date, windowEnd: Date): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of rows) {
    const start = new Date(r.starts_at);
    if (Number.isNaN(start.getTime()) || start < windowStart || start > windowEnd) continue;
    out.push({
      id: `family-${r.id}`,
      title: r.title,
      start: start.toISOString(),
      // an end and all-day arrive with the Google sync (0184); an appointment made here without an end is an hour
      end: r.ends_at && Date.parse(r.ends_at) > start.getTime() ? new Date(r.ends_at).toISOString() : new Date(start.getTime() + APPOINTMENT_MS).toISOString(),
      allDay: !!r.all_day,
      calendarName: FAMILY_CALENDAR.name,
      calendarColour: FAMILY_CALENDAR.colour,
      location: r.place ?? "",
      description: r.body ?? "",
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchFamilyAppointments(supabase: SupabaseClient, windowStart: Date, windowEnd: Date): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from("family_entries")
      .select("id, title, starts_at, place, body, ends_at, all_day")
      .eq("kind", "appointment")
      .gte("starts_at", windowStart.toISOString())
      .lte("starts_at", windowEnd.toISOString())
      .order("starts_at")
      .limit(500);
    if (error || !data) return [];
    return familyEvents(data as FamilyAppointmentRow[], windowStart, windowEnd);
  } catch (err) {
    console.error("[calendar] family appointments fetch failed:", err);
    return [];
  }
}

export type FamilySyncLine = { label: string; level: "ok" | "amber" | "red" | "never"; error: string | null };

/**
 * "Last synced 3 min ago" for the calendar page (family calendar spec §4.4):
 * null when no Family calendar is connected on Google. The sync row is
 * readable by every family member, so this works for either phone.
 */
export async function fetchFamilySyncLine(supabase: SupabaseClient, now: Date = new Date()): Promise<FamilySyncLine | null> {
  try {
    const { data } = await supabase.from("family_calendar_sync").select("last_synced_at, last_sync_error, health_ok, health_error").not("calendar_id", "is", null).limit(1).maybeSingle();
    const row = data as { last_synced_at: string | null; last_sync_error: string | null; health_ok: boolean | null; health_error: string | null } | null;
    if (!row) return null;
    const { staleness } = await import("@/lib/family/calendar/map");
    const s = staleness(row.last_synced_at, now);
    return { label: s.label, level: s.level, error: row.health_ok === false ? row.health_error ?? "Reconnect needed" : row.last_sync_error };
  } catch {
    return null;
  }
}
