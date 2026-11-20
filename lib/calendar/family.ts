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

export type FamilyAppointmentRow = { id: string; title: string; starts_at: string; place: string | null; body: string | null };

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
      end: new Date(start.getTime() + APPOINTMENT_MS).toISOString(),
      allDay: false,
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
      .select("id, title, starts_at, place, body")
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
