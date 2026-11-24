/**
 * The two Google calendars the calendar page shows beside everything from
 * the database: the connected account's own calendar ("Personal") and the
 * UK public holidays Google publishes. Both are read through the OAuth
 * connection (Settings → Integrations), which replaced the private iCal
 * feeds in GOOGLE_CALENDAR_ICAL_URLS on 2026-11-24: a feed URL is a secret
 * that never expires and is the same for everyone, where the connection is
 * one person's, revocable, and already carries the Family calendar.
 *
 * The read is cached for five minutes per connected account, because it is
 * the slow part of the page and the briefing and the day log read it too. A
 * successful read stamps user_settings.google_last_synced_at (0186) so the
 * Integrations row can say when the connection last did its work.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listEventsPage, markGoogleSynced, type GoogleCalendarEvent } from "@/lib/google/calendar";
import type { CalendarEvent } from "./fetch";

export type GoogleFeed = { id: string; name: string; colour: string };

export const GOOGLE_FEEDS: readonly GoogleFeed[] = [
  { id: "primary", name: "Personal", colour: "#84f5b8" },
  { id: "en.uk#holiday@group.v.calendar.google.com", name: "UK holidays", colour: "#f5d56d" },
];

export type GoogleFeedResult = {
  events: CalendarEvent[];
  /** Feed names Google would not serve this time. */
  failed: string[];
  /** Whether a Google connection exists for this person at all. */
  connected: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_EVENTS = 250;
const cache = new Map<string, { data: GoogleFeedResult; expiresAt: number }>();

/** Drop what is cached (tests, and a disconnect). */
export function clearGoogleFeedCache(): void {
  cache.clear();
}

/** Google's event shape onto the page's, inside the window; a recurring series arrives already expanded (singleEvents). */
export function eventsFromGoogle(items: readonly GoogleCalendarEvent[], feed: GoogleFeed, windowStart: Date, windowEnd: Date): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const ev of items) {
    if ((ev as { status?: string }).status === "cancelled") continue;
    const startRaw = ev.start?.dateTime ?? ev.start?.date;
    const endRaw = ev.end?.dateTime ?? ev.end?.date ?? startRaw;
    if (!startRaw) continue;
    const allDay = !ev.start?.dateTime;
    const start = allDay ? new Date(`${startRaw}T00:00:00`) : new Date(startRaw);
    // Google's all-day end is the day after the last day; the page wants the last day itself.
    const end = allDay ? new Date(new Date(`${endRaw}T00:00:00`).getTime() - 1) : new Date(endRaw!);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end < windowStart || start > windowEnd) continue;
    out.push({
      id: `${feed.name}:${ev.id ?? start.toISOString()}`,
      title: ev.summary ?? "(Untitled)",
      start: start.toISOString(),
      end: end.toISOString(),
      allDay,
      calendarName: feed.name,
      calendarColour: feed.colour,
      location: ev.location ?? "",
      description: ev.description ?? "",
    });
  }
  return out;
}

/**
 * Personal and UK holidays for this person's window. No connection → no
 * events and nothing "failed" (the page says connect instead). A feed Google
 * refuses is named in `failed`, the others still show.
 */
export async function googleFeedEvents(supabase: SupabaseClient, windowStart: Date, windowEnd: Date, now: Date = new Date()): Promise<GoogleFeedResult> {
  const { data } = await supabase.from("user_settings").select("id, google_refresh_token, google_account_email").limit(1).maybeSingle();
  const row = data as { id: string; google_refresh_token: string | null; google_account_email: string | null } | null;
  if (!row?.google_refresh_token) return { events: [], failed: [], connected: false };

  const key = row.google_account_email ?? row.id;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now.getTime()) return cached.data;

  const failed: string[] = [];
  const events: CalendarEvent[] = [];
  await Promise.all(
    GOOGLE_FEEDS.map(async (feed) => {
      try {
        const page = await listEventsPage(supabase, feed.id, { timeMin: windowStart.toISOString(), timeMax: windowEnd.toISOString(), maxResults: MAX_EVENTS });
        if (page.status === 401 || page.status === 403) throw new Error("Google refused the connection; reconnect in Settings → Integrations.");
        if (!page.body) throw new Error(`Google answered ${page.status}`);
        events.push(...eventsFromGoogle(page.body.items ?? [], feed, windowStart, windowEnd));
      } catch (err) {
        console.error(`[calendar] Google feed '${feed.name}' failed:`, err instanceof Error ? err.message : err);
        failed.push(feed.name);
      }
    }),
  );
  const result: GoogleFeedResult = { events, failed, connected: true };
  if (failed.length < GOOGLE_FEEDS.length) {
    // at least one calendar answered: the connection works
    await markGoogleSynced(supabase, now).catch(() => undefined);
    cache.set(key, { data: result, expiresAt: now.getTime() + CACHE_TTL_MS });
  }
  return result;
}
