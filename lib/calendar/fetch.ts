import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFamilyAppointments, fetchFamilySyncLine, type FamilySyncLine } from "./family";
import { googleFeedEvents } from "./google-feeds";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarName: string;
  calendarColour: string;
  location: string;
  description: string;
};

export type CalendarData = {
  events: CalendarEvent[];
  failedCalendars: string[];
  /** The Family calendar on Google: "Last synced 3 min ago" and its colour; absent when not connected (0184). */
  familySync?: FamilySyncLine | null;
  /** Whether Personal and UK holidays could be read at all: false means connect Google in Settings (0186). */
  googleConnected?: boolean;
};

const WINDOW_BACK_DAYS = 45;
const WINDOW_FORWARD_DAYS = 45;

async function fetchBirthdays(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from("people")
      .select("id, first_name, last_name, display_name, birthday")
      .is("deleted_at", null)
      .not("birthday", "is", null);
    if (error || !data) return [];

    const out: CalendarEvent[] = [];
    const startYear = windowStart.getFullYear();
    const endYear = windowEnd.getFullYear();

    for (const p of data as Array<{ id: string; first_name: string; last_name: string | null; display_name: string | null; birthday: string }>) {
      const name = p.display_name || `${p.first_name}${p.last_name ? ` ${p.last_name}` : ""}`;
      const [, mm, dd] = p.birthday.split("-").map(Number);

      for (let y = startYear; y <= endYear; y++) {
        const bday = new Date(y, mm - 1, dd);
        if (bday >= windowStart && bday <= windowEnd) {
          const iso = bday.toISOString();
          out.push({
            id: `birthday-${p.id}-${y}`,
            title: `${name}'s Birthday 🎂`,
            start: iso,
            end: iso,
            allDay: true,
            calendarName: "Birthdays",
            calendarColour: "#f56db5",
            location: "",
            description: "",
          });
        }
      }
    }
    return out;
  } catch (err) {
    console.error("[calendar] birthdays fetch failed:", err);
    return [];
  }
}

async function fetchEvents(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("start_at", windowStart.toISOString())
      .lte("start_at", windowEnd.toISOString());
    if (error || !data) return [];

    return (data as Array<{
      id: string;
      title: string;
      start_at: string;
      end_at: string | null;
      all_day: boolean;
      location: string | null;
      notes: string | null;
      colour: string;
    }>).map((e) => ({
      id: `event-${e.id}`,
      title: e.title,
      start: e.start_at,
      end: e.end_at || e.start_at,
      allDay: e.all_day,
      calendarName: "Events",
      calendarColour: e.colour || "#e8e6dd",
      location: e.location || "",
      description: e.notes || "",
    }));
  } catch (err) {
    console.error("[calendar] events fetch failed:", err);
    return [];
  }
}

async function fetchScheduledTasks(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, title, scheduled_at, time_estimate_min")
      .is("deleted_at", null)
      .is("completed_at", null)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString());
    if (error || !data) return [];
    return (data as Array<{
      id: string;
      title: string;
      scheduled_at: string;
      time_estimate_min: number | null;
    }>).map((t) => {
      const start = new Date(t.scheduled_at);
      const durationMs = (t.time_estimate_min ?? 30) * 60_000;
      const end = new Date(start.getTime() + durationMs);
      return {
        id: `task-${t.id}`,
        title: t.title,
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        calendarName: "Tasks",
        calendarColour: "#f5b56d",
        location: "",
        description: "",
      };
    });
  } catch (err) {
    console.error("[calendar] scheduled tasks fetch failed:", err);
    return [];
  }
}

function getPayday(year: number, month: number): Date {
  const sixteenth = new Date(year, month, 16);
  const dow = sixteenth.getDay();
  if (dow === 6 || dow === 0) return new Date(year, month, 14);
  return sixteenth;
}

function generatePaydays(
  windowStart: Date,
  windowEnd: Date,
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const d = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
  const endLimit = new Date(windowEnd);
  endLimit.setMonth(endLimit.getMonth() + 1);

  while (d <= endLimit) {
    const payday = getPayday(d.getFullYear(), d.getMonth());
    if (payday >= windowStart && payday <= windowEnd) {
      const iso = payday.toISOString();
      out.push({
        id: `payday-${d.getFullYear()}-${d.getMonth()}`,
        title: "💰 Payday",
        start: iso,
        end: iso,
        allDay: true,
        calendarName: "Payday",
        calendarColour: "#84f5b8",
        location: "",
        description: "",
      });
    }
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

async function fetchDirectDebits(
  supabase: SupabaseClient,
  windowStart: Date,
  windowEnd: Date,
): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, cost_amount, cost_period, renewal_date, status")
      .in("status", ["active", "trial"])
      .not("cost_amount", "is", null)
      .gt("cost_amount", 0)
      .not("renewal_date", "is", null);

    if (error || !data) return [];

    const out: CalendarEvent[] = [];

    for (const a of data as Array<{
      id: string;
      name: string;
      cost_amount: number;
      cost_period: string;
      renewal_date: string;
      status: string;
    }>) {
      const renewalDate = new Date(a.renewal_date + "T00:00:00");
      const dayOfMonth = renewalDate.getDate();
      const title = `💳 ${a.name} — £${a.cost_amount}`;

      if (a.cost_period === "monthly") {
        const d = new Date(windowStart.getFullYear(), windowStart.getMonth(), 1);
        const endLimit = new Date(windowEnd);
        endLimit.setMonth(endLimit.getMonth() + 1);

        while (d <= endLimit) {
          const y = d.getFullYear();
          const m = d.getMonth();
          const lastDay = new Date(y, m + 1, 0).getDate();
          const actualDay = Math.min(dayOfMonth, lastDay);
          const eventDate = new Date(y, m, actualDay);

          if (eventDate >= windowStart && eventDate <= windowEnd) {
            const iso = eventDate.toISOString();
            out.push({
              id: `bill-${a.id}-${y}-${m}`,
              title,
              start: iso,
              end: iso,
              allDay: true,
              calendarName: "Bills",
              calendarColour: "#6db8f5",
              location: "",
              description: "",
            });
          }
          d.setMonth(d.getMonth() + 1);
        }
      } else if (a.cost_period === "annual") {
        const startYear = windowStart.getFullYear();
        const endYear = windowEnd.getFullYear();
        for (let y = startYear; y <= endYear; y++) {
          const eventDate = new Date(y, renewalDate.getMonth(), renewalDate.getDate());
          if (eventDate >= windowStart && eventDate <= windowEnd) {
            const iso = eventDate.toISOString();
            out.push({
              id: `bill-${a.id}-${y}`,
              title,
              start: iso,
              end: iso,
              allDay: true,
              calendarName: "Bills",
              calendarColour: "#6db8f5",
              location: "",
              description: "",
            });
          }
        }
      }
    }

    return out;
  } catch (err) {
    console.error("[calendar] direct debits fetch failed:", err);
    return [];
  }
}

export async function getCalendarData(
  supabase: SupabaseClient,
): Promise<CalendarData> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - WINDOW_BACK_DAYS);
  const windowEnd = new Date(now);
  windowEnd.setDate(now.getDate() + WINDOW_FORWARD_DAYS);

  // Personal and UK holidays come through the caller's own Google connection
  // (lib/calendar/google-feeds.ts); the private iCal feed URLs retired 2026-11-24.
  const [feeds, scheduledTasks, birthdayEvents, customEvents, directDebits, familyAppointments, familySync] = await Promise.all([
    googleFeedEvents(supabase, windowStart, windowEnd, now),
    fetchScheduledTasks(supabase, windowStart, windowEnd),
    fetchBirthdays(supabase, windowStart, windowEnd),
    fetchEvents(supabase, windowStart, windowEnd),
    fetchDirectDebits(supabase, windowStart, windowEnd),
    fetchFamilyAppointments(supabase, windowStart, windowEnd),
    fetchFamilySyncLine(supabase, now),
  ]);
  const all: CalendarEvent[] = [...feeds.events];
  all.push(...scheduledTasks);
  all.push(...birthdayEvents);
  all.push(...customEvents);
  all.push(...directDebits);
  all.push(...familyAppointments);
  all.push(...generatePaydays(windowStart, windowEnd));

  all.sort((a, b) => a.start.localeCompare(b.start));
  return { events: all, failedCalendars: feeds.failed, familySync, googleConnected: feeds.connected };
}
