import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccessToken,
  createEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  type GoogleCalendarEvent,
} from "./calendar";

const TZ = "Europe/London";

// Every function here takes the caller's client: request routes pass their
// user client, the google-sync cron passes one from withUser().
export async function isGoogleConnected(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_settings")
    .select("google_refresh_token")
    .maybeSingle();
  return !!data?.google_refresh_token;
}

function oneHourLater(iso: string): string {
  return new Date(new Date(iso).getTime() + 3600_000).toISOString();
}

// ─── PUSH: Myphelium2 → Google ──────────────────────────────────

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type TicketForCalendar = {
  id: string;
  title: string;
  description?: string | null;
  /** timed (legacy): a one-hour event */
  scheduled_at?: string | null;
  /** dated (tickets spec §4.4): an all-day event */
  scheduled_on?: string | null;
  /** a weekend pick (spec §18 R6) spans Saturday–Sunday: deadline_on is the Sunday */
  deadline_on?: string | null;
  due_window?: string | null;
  google_event_id?: string | null;
  category?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

/**
 * Bring a ticket's Google event in line with the ticket (MYC-40). Decided
 * from state, not from which field changed, so every write path can call
 * it after the fact: dated and open → create or update (all-day for a
 * `scheduled_on` date, one hour for a `scheduled_at` time); undated, done or
 * cancelled → delete and forget the id. Soft: never throws, never blocks.
 */
/** The event a ticket should have on the calendar, or null when it should have none (pure). */
export function ticketCalendarEvent(t: TicketForCalendar): GoogleCalendarEvent | null {
  const closed = t.category === "done" || t.category === "cancelled" || !!t.completed_at || !!t.cancelled_at;
  if (closed) return null;
  if (t.scheduled_at) return { summary: t.title, description: t.description ?? "", start: { dateTime: t.scheduled_at, timeZone: TZ }, end: { dateTime: oneHourLater(t.scheduled_at), timeZone: TZ } };
  if (t.scheduled_on) {
    // A weekend pick is one all-day event across Saturday and Sunday (end is exclusive).
    const last = t.due_window === "weekend" && t.deadline_on && t.deadline_on > t.scheduled_on ? t.deadline_on : t.scheduled_on;
    return { summary: t.title, description: t.description ?? "", start: { date: t.scheduled_on }, end: { date: nextDay(last) } };
  }
  return null;
}

export async function syncTicketToGoogle(supabase: SupabaseClient, t: TicketForCalendar): Promise<"created" | "updated" | "removed" | "none"> {
  try {
    if (!(await isGoogleConnected(supabase))) return "none";
    const event = ticketCalendarEvent(t);
    if (!event) {
      if (!t.google_event_id) return "none";
      await deleteEvent(supabase, t.google_event_id);
      await supabase.from("tickets").update({ google_event_id: null }).eq("id", t.id);
      return "removed";
    }
    if (t.google_event_id) {
      await updateEvent(supabase, t.google_event_id, event);
      return "updated";
    }
    const created = await createEvent(supabase, event);
    if (created?.id) await supabase.from("tickets").update({ google_event_id: created.id }).eq("id", t.id);
    return created?.id ? "created" : "none";
  } catch (err) {
    console.error("[google/sync] syncTicketToGoogle failed:", err);
    return "none";
  }
}

export async function pushTaskToGoogle(
  supabase: SupabaseClient,
  task: {
  id: string;
  title: string;
  description?: string | null;
  scheduled_at: string;
  google_event_id?: string | null;
  },
): Promise<void> {
  try {
    if (!(await isGoogleConnected(supabase))) return;

    const event: GoogleCalendarEvent = {
      summary: task.title,
      description: task.description ?? "",
      start: { dateTime: task.scheduled_at, timeZone: TZ },
      end: { dateTime: oneHourLater(task.scheduled_at), timeZone: TZ },
    };

    if (task.google_event_id) {
      await updateEvent(supabase, task.google_event_id, event);
    } else {
      const created = await createEvent(supabase, event);
      if (created?.id) {
        await supabase
          .from("tickets")
          .update({ google_event_id: created.id })
          .eq("id", task.id);
      }
    }
  } catch (err) {
    console.error("[google/sync] pushTaskToGoogle failed:", err);
  }
}

export async function pushEventToGoogle(
  supabase: SupabaseClient,
  evt: {
  id: string;
  title: string;
  start_at: string;
  end_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  notes?: string | null;
  google_event_id?: string | null;
  },
): Promise<void> {
  try {
    if (!(await isGoogleConnected(supabase))) return;

    const start = evt.all_day
      ? { date: evt.start_at.slice(0, 10), timeZone: TZ }
      : { dateTime: evt.start_at, timeZone: TZ };
    const end = evt.all_day
      ? { date: (evt.end_at ?? evt.start_at).slice(0, 10), timeZone: TZ }
      : { dateTime: evt.end_at ?? oneHourLater(evt.start_at), timeZone: TZ };

    const event: GoogleCalendarEvent = {
      summary: evt.title,
      description: evt.notes ?? "",
      start,
      end,
      location: evt.location ?? undefined,
    };

    if (evt.google_event_id) {
      await updateEvent(supabase, evt.google_event_id, event);
    } else {
      const created = await createEvent(supabase, event);
      if (created?.id) {
        await supabase
          .from("events")
          .update({ google_event_id: created.id })
          .eq("id", evt.id);
      }
    }
  } catch (err) {
    console.error("[google/sync] pushEventToGoogle failed:", err);
  }
}

export async function pushDropToGoogle(
  supabase: SupabaseClient,
  drop: {
  id: string;
  name: string;
  brand: string;
  drop_date: string;
  drop_type?: string;
  retail_price?: number | null;
  product_url?: string | null;
  notes?: string | null;
  google_event_id?: string | null;
  },
): Promise<void> {
  try {
    if (!(await isGoogleConnected(supabase))) return;

    const desc = [
      drop.retail_price ? `Retail: £${drop.retail_price}` : null,
      drop.product_url,
      drop.notes,
    ]
      .filter(Boolean)
      .join("\n");

    const event: GoogleCalendarEvent = {
      summary: `${drop.brand} — ${drop.name} (${drop.drop_type ?? "drop"})`,
      description: desc,
      start: { dateTime: drop.drop_date, timeZone: TZ },
      end: { dateTime: oneHourLater(drop.drop_date), timeZone: TZ },
    };

    if (drop.google_event_id) {
      await updateEvent(supabase, drop.google_event_id, event);
    } else {
      const created = await createEvent(supabase, event);
      if (created?.id) {
        await supabase
          .from("drops")
          .update({ google_event_id: created.id })
          .eq("id", drop.id);
      }
    }
  } catch (err) {
    console.error("[google/sync] pushDropToGoogle failed:", err);
  }
}

export async function removeGoogleEvent(
  supabase: SupabaseClient,
  table: "tasks" | "events" | "drops",
  googleEventId: string | null | undefined,
): Promise<void> {
  if (!googleEventId) return;
  try {
    if (!(await isGoogleConnected(supabase))) return;
    await deleteEvent(supabase, googleEventId);
  } catch (err) {
    console.error(`[google/sync] removeGoogleEvent(${table}) failed:`, err);
  }
}

// ─── PULL: Google → Myphelium2 ──────────────────────────────────

export type SyncResult = { synced: number; updated: string[] };

export async function pullFromGoogle(
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, updated: [] };

  if (!(await isGoogleConnected(supabase))) return result;

  const token = await getAccessToken(supabase);
  if (!token) return result;

  const now = new Date().toISOString();
  const future = new Date(Date.now() + 30 * 86400_000).toISOString();
  const gEvents = await listEvents(supabase, "primary", now, future, 250);

  result.synced = gEvents.length;

  for (const ge of gEvents) {
    if (!ge.id) continue;
    const gStart = ge.start.dateTime ?? ge.start.date;
    if (!gStart) continue;

    // Check tasks — an all-day event moves scheduled_on, a timed one scheduled_at (MYC-40)
    const { data: task } = await supabase
      .from("tickets")
      .select("id, scheduled_at, scheduled_on")
      .eq("google_event_id", ge.id)
      .maybeSingle();

    if (task) {
      if (ge.start.date && !ge.start.dateTime) {
        if (task.scheduled_on !== ge.start.date) {
          await supabase
            .from("tickets")
            .update({ scheduled_on: ge.start.date, updated_at: new Date().toISOString() })
            .eq("id", task.id);
          result.updated.push(`task: ${ge.summary ?? ge.id}`);
        }
        continue;
      }
      const current = task.scheduled_at
        ? new Date(task.scheduled_at).toISOString()
        : null;
      const incoming = new Date(gStart).toISOString();
      if (current !== incoming) {
        await supabase
          .from("tickets")
          .update({ scheduled_at: incoming, updated_at: new Date().toISOString() })
          .eq("id", task.id);
        result.updated.push(`task: ${ge.summary ?? ge.id}`);
      }
      continue;
    }

    // Check events
    const { data: evt } = await supabase
      .from("events")
      .select("id, start_at")
      .eq("google_event_id", ge.id)
      .maybeSingle();

    if (evt) {
      const current = new Date(evt.start_at).toISOString();
      const incoming = new Date(gStart).toISOString();
      if (current !== incoming) {
        const gEnd = ge.end?.dateTime ?? ge.end?.date;
        await supabase
          .from("events")
          .update({
            start_at: incoming,
            ...(gEnd ? { end_at: new Date(gEnd).toISOString() } : {}),
          })
          .eq("id", evt.id);
        result.updated.push(`event: ${ge.summary ?? ge.id}`);
      }
      continue;
    }

    // Check drops
    const { data: drop } = await supabase
      .from("drops")
      .select("id, drop_date")
      .eq("google_event_id", ge.id)
      .maybeSingle();

    if (drop) {
      const current = drop.drop_date
        ? new Date(drop.drop_date).toISOString()
        : null;
      const incoming = new Date(gStart).toISOString();
      if (current !== incoming) {
        await supabase
          .from("drops")
          .update({ drop_date: incoming, updated_at: new Date().toISOString() })
          .eq("id", drop.id);
        result.updated.push(`drop: ${ge.summary ?? ge.id}`);
      }
    }
  }

  return result;
}
