import type { SupabaseClient } from "@supabase/supabase-js";
import { updateUserSettings } from "@/lib/settings/userSettingsRow";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  return { id, secret };
}

// Every function here takes the caller's client: request routes pass their
// user client, the google-sync cron passes one from withUser().
export async function getAccessToken(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_settings")
    .select(
      "google_access_token, google_refresh_token, google_token_expires_at",
    )
    .maybeSingle();

  if (!data?.google_refresh_token) return null;

  const expiresAt = data.google_token_expires_at
    ? new Date(data.google_token_expires_at).getTime()
    : 0;

  if (data.google_access_token && Date.now() < expiresAt - 60_000) {
    return data.google_access_token;
  }

  const { id, secret } = credentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: data.google_refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Google answers 400 invalid_grant once a refresh token is revoked or
    // expired; nothing short of a fresh OAuth round trip fixes that. Record
    // it so Settings → Integrations can say "reconnect" instead of
    // "connected" while every sync quietly does nothing (MYC-147).
    let reason = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; error_description?: string };
      if (body.error) reason = body.error_description ? `${body.error}: ${body.error_description}` : body.error;
    } catch {
      /* no JSON body */
    }
    console.error("[google] token refresh failed", res.status, reason);
    await updateUserSettings(
      supabase,
      { google_sync_error: `${new Date().toISOString()} ${reason}`.slice(0, 300) },
      { select: "id" },
    );
    return null;
  }

  const json = await res.json();
  const newExpiresAt = new Date(
    Date.now() + (json.expires_in ?? 3600) * 1000,
  ).toISOString();

  await updateUserSettings(
    supabase,
    {
      google_access_token: json.access_token,
      google_token_expires_at: newExpiresAt,
      google_sync_error: null,
      ...(json.refresh_token
        ? { google_refresh_token: json.refresh_token }
        : {}),
    },
    { select: "id" },
  );

  return json.access_token;
}

async function calFetch<T = unknown>(
  supabase: SupabaseClient,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await getAccessToken(supabase);
  if (!token) return null;

  const res = await fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 204) return null;
  if (!res.ok) {
    console.error(`[google/calendar] ${path} → ${res.status}`);
    return null;
  }
  return res.json();
}

export type GoogleCalendarEvent = {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  [key: string]: unknown;
};

export async function listEvents(
  supabase: SupabaseClient,
  calendarId = "primary",
  timeMin?: string,
  timeMax?: string,
  maxResults = 50,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);

  const res = await calFetch<{ items?: GoogleCalendarEvent[] }>(
    supabase,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );
  return res?.items ?? [];
}

export async function createEvent(
  supabase: SupabaseClient,
  event: GoogleCalendarEvent,
  calendarId = "primary",
): Promise<GoogleCalendarEvent | null> {
  return calFetch<GoogleCalendarEvent>(
    supabase,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(event) },
  );
}

export async function updateEvent(
  supabase: SupabaseClient,
  eventId: string,
  event: Partial<GoogleCalendarEvent>,
  calendarId = "primary",
): Promise<GoogleCalendarEvent | null> {
  return calFetch<GoogleCalendarEvent>(
    supabase,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(event) },
  );
}

export async function deleteEvent(
  supabase: SupabaseClient,
  eventId: string,
  calendarId = "primary",
): Promise<boolean> {
  const token = await getAccessToken(supabase);
  if (!token) return false;

  const res = await fetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return res.ok || res.status === 204 || res.status === 410;
}

// ─── The Family calendar (0184; family calendar spec §4) ─────────────────
//
// Everything below answers with the HTTP status as well as the body, because
// the family sync has to tell apart "gone" (410: the sync token has lapsed,
// start again), "someone else changed it first" (412: the etag no longer
// matches) and "the token is dead" (401/403: reconnect) from a plain failure.
// `calFetch` above folds all of those into null, which the ticket/event/drop
// pushes are happy with; the family sync is not.

export type CalResponse<T> = { status: number; body: T | null; etag: string | null };

export type GoogleCalendarListEntry = { id: string; summary?: string; primary?: boolean; accessRole?: string; backgroundColor?: string };
export type GoogleAclRule = { id?: string; role: string; scope: { type: string; value?: string } };
export type GoogleEventsPage = { items?: GoogleSyncEvent[]; nextPageToken?: string; nextSyncToken?: string };
/** A Google event as the sync sees it: cancelled instances come through with `status: "cancelled"` and little else. */
export type GoogleSyncEvent = GoogleCalendarEvent & {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  iCalUID?: string;
  updated?: string;
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
  reminders?: { useDefault?: boolean; overrides?: Array<{ method: string; minutes: number }> };
};

export async function calRequest<T = unknown>(supabase: SupabaseClient, path: string, init?: RequestInit): Promise<CalResponse<T>> {
  const token = await getAccessToken(supabase);
  if (!token) return { status: 401, body: null, etag: null };
  const res = await fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const etag = res.headers.get("etag");
  if (res.status === 204) return { status: 204, body: null, etag };
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  if (!res.ok) console.error(`[google/calendar] ${init?.method ?? "GET"} ${path} → ${res.status}`);
  return { status: res.status, body, etag };
}

/** The account's calendars, as the picker lists them. Only ids and names leave this function. */
export async function listCalendars(supabase: SupabaseClient): Promise<CalResponse<GoogleCalendarListEntry[]>> {
  const r = await calRequest<{ items?: GoogleCalendarListEntry[] }>(supabase, "/users/me/calendarList?minAccessRole=writer&maxResults=250");
  return { ...r, body: r.body?.items ?? (r.status < 300 ? [] : null) };
}

export async function createCalendar(supabase: SupabaseClient, summary: string, timeZone = "Europe/London"): Promise<CalResponse<GoogleCalendarListEntry>> {
  return calRequest<GoogleCalendarListEntry>(supabase, "/calendars", { method: "POST", body: JSON.stringify({ summary, timeZone }) });
}

export async function getCalendar(supabase: SupabaseClient, calendarId: string): Promise<CalResponse<GoogleCalendarListEntry>> {
  return calRequest<GoogleCalendarListEntry>(supabase, `/calendars/${encodeURIComponent(calendarId)}`);
}

export async function listAcl(supabase: SupabaseClient, calendarId: string): Promise<CalResponse<GoogleAclRule[]>> {
  const r = await calRequest<{ items?: GoogleAclRule[] }>(supabase, `/calendars/${encodeURIComponent(calendarId)}/acl`);
  return { ...r, body: r.body?.items ?? (r.status < 300 ? [] : null) };
}

/** Share the calendar with one address. `writer` is Google's "Make changes to events". */
export async function insertAcl(supabase: SupabaseClient, calendarId: string, email: string, role: "reader" | "writer" = "writer"): Promise<CalResponse<GoogleAclRule>> {
  return calRequest<GoogleAclRule>(supabase, `/calendars/${encodeURIComponent(calendarId)}/acl?sendNotifications=true`, {
    method: "POST",
    body: JSON.stringify({ role, scope: { type: "user", value: email } }),
  });
}

/**
 * One page of events. With a sync token Google sends only what changed since
 * (including cancellations); without one it is a full read of the window.
 * A 410 means the token has lapsed and the caller starts again without it.
 */
export async function listEventsPage(
  supabase: SupabaseClient,
  calendarId: string,
  opts: { syncToken?: string | null; pageToken?: string | null; timeMin?: string; timeMax?: string; maxResults?: number },
): Promise<CalResponse<GoogleEventsPage>> {
  const params = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: String(opts.maxResults ?? 250) });
  if (opts.syncToken) params.set("syncToken", opts.syncToken);
  else {
    if (opts.timeMin) params.set("timeMin", opts.timeMin);
    if (opts.timeMax) params.set("timeMax", opts.timeMax);
  }
  if (opts.pageToken) params.set("pageToken", opts.pageToken);
  return calRequest<GoogleEventsPage>(supabase, `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
}

export async function getEvent(supabase: SupabaseClient, calendarId: string, eventId: string): Promise<CalResponse<GoogleSyncEvent>> {
  return calRequest<GoogleSyncEvent>(supabase, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
}

export async function insertEvent(supabase: SupabaseClient, calendarId: string, event: GoogleCalendarEvent): Promise<CalResponse<GoogleSyncEvent>> {
  return calRequest<GoogleSyncEvent>(supabase, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(event) });
}

/** Change an event, only if it is still the version we last saw (If-Match); a 412 says it is not. */
export async function patchEvent(supabase: SupabaseClient, calendarId: string, eventId: string, event: Partial<GoogleCalendarEvent>, etag: string | null): Promise<CalResponse<GoogleSyncEvent>> {
  return calRequest<GoogleSyncEvent>(supabase, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : {},
    body: JSON.stringify(event),
  });
}

/** Remove an event. 404 and 410 count as done: it is not there, which is what was asked. */
export async function removeEvent(supabase: SupabaseClient, calendarId: string, eventId: string): Promise<CalResponse<null>> {
  const r = await calRequest<null>(supabase, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  if (r.status === 404 || r.status === 410) return { ...r, status: 204 };
  return r;
}

export type GoogleChannel = { id: string; resourceId: string; expiration?: string };

/** Ask Google to POST to `address` when the calendar changes. Channels last a week at most; the cron renews them. */
export async function watchEvents(supabase: SupabaseClient, calendarId: string, channel: { id: string; token: string; address: string; ttlSeconds?: number }): Promise<CalResponse<GoogleChannel>> {
  return calRequest<GoogleChannel>(supabase, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id: channel.id, type: "web_hook", address: channel.address, token: channel.token, params: { ttl: String(channel.ttlSeconds ?? 6 * 24 * 3600) } }),
  });
}

export async function stopChannel(supabase: SupabaseClient, channel: { id: string; resourceId: string }): Promise<CalResponse<null>> {
  return calRequest<null>(supabase, "/channels/stop", { method: "POST", body: JSON.stringify(channel) });
}
