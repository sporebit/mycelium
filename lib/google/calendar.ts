import { createServerClient } from "@/lib/supabase/server";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const UID = () => process.env.USER_ID ?? "default";

function credentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  return { id, secret };
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("user_settings")
    .select(
      "google_access_token, google_refresh_token, google_token_expires_at",
    )
    .eq("user_id", UID())
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
    console.error("[google] token refresh failed", res.status);
    return null;
  }

  const json = await res.json();
  const newExpiresAt = new Date(
    Date.now() + (json.expires_in ?? 3600) * 1000,
  ).toISOString();

  await supabase
    .from("user_settings")
    .update({
      google_access_token: json.access_token,
      google_token_expires_at: newExpiresAt,
      ...(json.refresh_token
        ? { google_refresh_token: json.refresh_token }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", UID());

  return json.access_token;
}

async function calFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await getAccessToken();
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
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );
  return res?.items ?? [];
}

export async function createEvent(
  event: GoogleCalendarEvent,
  calendarId = "primary",
): Promise<GoogleCalendarEvent | null> {
  return calFetch<GoogleCalendarEvent>(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(event) },
  );
}

export async function updateEvent(
  eventId: string,
  event: Partial<GoogleCalendarEvent>,
  calendarId = "primary",
): Promise<GoogleCalendarEvent | null> {
  return calFetch<GoogleCalendarEvent>(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(event) },
  );
}

export async function deleteEvent(
  eventId: string,
  calendarId = "primary",
): Promise<boolean> {
  const token = await getAccessToken();
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
