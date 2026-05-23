import { NextResponse } from "next/server";
import ICAL from "ical.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Feed = { name: string; colour: string; url: string };

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

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const WINDOW_BACK_DAYS = 7;
const WINDOW_FORWARD_DAYS = 7;
const RECUR_SAFETY_LIMIT = 500;

let memoryCache:
  | { data: { events: CalendarEvent[]; failedCalendars: string[] }; expiresAt: number }
  | null = null;

function readFeeds(): Feed[] {
  const raw = process.env.GOOGLE_CALENDAR_ICAL_URLS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error("[calendar] GOOGLE_CALENDAR_ICAL_URLS is not an array");
      return [];
    }
    return parsed.filter(
      (x: unknown): x is Feed =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Feed).url === "string" &&
        typeof (x as Feed).name === "string"
    );
  } catch (err) {
    console.error(
      "[calendar] Failed to parse GOOGLE_CALENDAR_ICAL_URLS — it must be a single-line JSON array OR wrapped in double-quotes for multi-line. Error:",
      err
    );
    return [];
  }
}

async function fetchIcs(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseFeed(
  icsText: string,
  feed: Feed,
  windowStart: Date,
  windowEnd: Date
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);

      if (event.isRecurring()) {
        const iter = event.iterator();
        let safety = 0;
        while (safety++ < RECUR_SAFETY_LIMIT) {
          const next = iter.next();
          if (!next) break;
          const startJs = next.toJSDate();
          if (startJs > windowEnd) break;

          const details = event.getOccurrenceDetails(next);
          const occStart = details.startDate.toJSDate();
          const occEnd = details.endDate.toJSDate();
          if (occEnd < windowStart) continue;

          out.push({
            id: `${event.uid}@${details.startDate.toString()}`,
            title: event.summary ?? "(Untitled)",
            start: occStart.toISOString(),
            end: occEnd.toISOString(),
            allDay: details.startDate.isDate,
            calendarName: feed.name,
            calendarColour: feed.colour,
            location: event.location ?? "",
            description: event.description ?? "",
          });
        }
      } else {
        const startJs = event.startDate.toJSDate();
        const endJs = event.endDate.toJSDate();
        if (endJs < windowStart || startJs > windowEnd) continue;
        out.push({
          id: event.uid ?? `${feed.name}-${startJs.toISOString()}`,
          title: event.summary ?? "(Untitled)",
          start: startJs.toISOString(),
          end: endJs.toISOString(),
          allDay: event.startDate.isDate,
          calendarName: feed.name,
          calendarColour: feed.colour,
          location: event.location ?? "",
          description: event.description ?? "",
        });
      }
    } catch (err) {
      console.error(`[calendar] event parse failed in '${feed.name}':`, err);
    }
  }
  return out;
}

async function getCalendarData(): Promise<{
  events: CalendarEvent[];
  failedCalendars: string[];
}> {
  if (memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.data;
  }

  const feeds = readFeeds();
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - WINDOW_BACK_DAYS);
  const windowEnd = new Date(now);
  windowEnd.setDate(now.getDate() + WINDOW_FORWARD_DAYS);

  const failed: string[] = [];
  const all: CalendarEvent[] = [];

  await Promise.all(
    feeds.map(async (feed) => {
      try {
        const text = await fetchIcs(feed.url, FETCH_TIMEOUT_MS);
        const events = parseFeed(text, feed, windowStart, windowEnd);
        all.push(...events);
      } catch (err) {
        console.error(`[calendar] feed '${feed.name}' failed:`, err);
        failed.push(feed.name);
      }
    })
  );

  all.sort((a, b) => a.start.localeCompare(b.start));
  const data = { events: all, failedCalendars: failed };
  memoryCache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

export async function GET() {
  try {
    const data = await getCalendarData();
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[calendar GET] unexpected error:", err);
    return NextResponse.json(
      { events: [], failedCalendars: [], error: "calendar fetch failed" },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
