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
          .from("tasks")
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

    // Check tasks
    const { data: task } = await supabase
      .from("tasks")
      .select("id, scheduled_at")
      .eq("google_event_id", ge.id)
      .maybeSingle();

    if (task) {
      const current = task.scheduled_at
        ? new Date(task.scheduled_at).toISOString()
        : null;
      const incoming = new Date(gStart).toISOString();
      if (current !== incoming) {
        await supabase
          .from("tasks")
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
