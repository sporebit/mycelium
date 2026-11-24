/**
 * The Family calendar, both ways, as pure functions (family calendar spec
 * §4.2, §4.3, §4.4). A Google event and a family appointment are the same
 * thing seen from two sides; this file is the translation and the rules,
 * with no I/O, so the rules can be pinned by tests:
 *
 *   - a Google event becomes the columns of a family_entries row, and a row
 *     becomes the body of a Google event;
 *   - when both sides changed since the last sync, the later change wins
 *     and Google wins a tie (spec §4.3), and the loser is written down;
 *   - "Last synced 3 min ago" and its colour (spec §4.4).
 *
 * All-day events are stored with starts_at at London midnight and
 * `all_day = true`; the day on the timeline is the event's date.
 */
import { londonClock } from "@/lib/daylog/day";

export const TZ = "Europe/London";
/** An appointment with no end is an hour long, as the calendar page already assumes. */
const HOUR_MS = 3_600_000;
/** The key under which an event made here carries its row id, so a full sync after a reconnect re-links instead of duplicating. */
export const ENTRY_PROP = "mycelium_entry";

export type GoogleEventIn = {
  id: string;
  status?: string;
  etag?: string;
  iCalUID?: string;
  updated?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export type EntryRow = {
  id: string;
  title: string;
  body: string | null;
  place: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean;
  ext_id: string | null;
  ext_etag: string | null;
  ext_updated_at: string | null;
  updated_at: string;
};

/** The columns a Google event sets on a family_entries row. Null when the event cannot be an appointment (no start). */
export function entryColumnsFromEvent(ev: GoogleEventIn): Record<string, unknown> | null {
  const allDay = !!ev.start?.date && !ev.start?.dateTime;
  const startIso = allDay ? londonMidnight(ev.start!.date!) : ev.start?.dateTime ? new Date(ev.start.dateTime).toISOString() : null;
  if (!startIso) return null;
  let endIso: string | null = null;
  if (allDay && ev.end?.date) endIso = londonMidnight(ev.end.date);
  else if (ev.end?.dateTime) endIso = new Date(ev.end.dateTime).toISOString();
  if (endIso && endIso < startIso) endIso = startIso;
  const title = (ev.summary ?? "").trim().slice(0, 200) || "(No title)";
  return {
    kind: "appointment",
    title,
    body: (ev.description ?? "").trim().slice(0, 20_000) || null,
    place: (ev.location ?? "").trim().slice(0, 200) || null,
    starts_at: startIso,
    ends_at: endIso,
    all_day: allDay,
    happened_on: allDay ? ev.start!.date : londonClock(new Date(startIso)).date,
    ext_provider: "google",
    ext_id: ev.id,
    ext_etag: ev.etag ?? null,
    ext_ical_uid: ev.iCalUID ?? null,
    ext_updated_at: ev.updated ? new Date(ev.updated).toISOString() : null,
    recurring_event_id: ev.recurringEventId ?? null,
  };
}

/** The instant a London calendar day begins, from YYYY-MM-DD. */
export function londonMidnight(date: string): string {
  // Noon UTC on that date is the same London day whatever the offset; back off to the day's start.
  const noon = new Date(`${date}T12:00:00Z`);
  const { minutes } = londonClock(noon);
  return new Date(noon.getTime() - minutes * 60_000).toISOString();
}

/** The next calendar day, for all-day ends (Google's end date is exclusive). */
export function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type GoogleEventOut = {
  summary: string;
  description: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  reminders: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
  extendedProperties: { private: Record<string, string> };
};

/** The body of the Google event a row should be. Null for a row with no time (not an appointment yet). */
export function eventFromEntry(row: Pick<EntryRow, "id" | "title" | "body" | "place" | "starts_at" | "ends_at" | "all_day">, googleReminders: boolean): GoogleEventOut | null {
  if (!row.starts_at) return null;
  const startMs = Date.parse(row.starts_at);
  if (Number.isNaN(startMs)) return null;
  let start: GoogleEventOut["start"];
  let end: GoogleEventOut["end"];
  if (row.all_day) {
    const day = londonClock(new Date(startMs)).date;
    const endDay = row.ends_at ? londonClock(new Date(Date.parse(row.ends_at))).date : nextDate(day);
    start = { date: day };
    end = { date: endDay > day ? endDay : nextDate(day) };
  } else {
    const endMs = row.ends_at ? Math.max(Date.parse(row.ends_at), startMs) : startMs + HOUR_MS;
    start = { dateTime: new Date(startMs).toISOString(), timeZone: TZ };
    end = { dateTime: new Date(endMs).toISOString(), timeZone: TZ };
  }
  return {
    summary: row.title,
    description: row.body ?? "",
    ...(row.place ? { location: row.place } : {}),
    start,
    end,
    // Mycelium reminds for its own appointments; Google stays quiet unless asked (spec §4.3: no double buzz).
    reminders: googleReminders ? { useDefault: true } : { useDefault: false, overrides: [] },
    extendedProperties: { private: { [ENTRY_PROP]: row.id } },
  };
}

export type Decision =
  | { action: "skip"; why: "unchanged" }
  | { action: "apply_google"; overwrote_local: boolean }
  | { action: "keep_local_push"; };

/**
 * What to do with an incoming change to a row we already hold (spec §4.3).
 *   - Google's `updated` equals what we stored: nothing new; skip.
 *   - Only Google changed since the last sync: apply it.
 *   - Both changed: the later wins; Google wins a tie. A Mycelium edit that
 *     loses is "overwritten" and goes in the log; one that wins is pushed.
 */
export function decideIncoming(row: Pick<EntryRow, "ext_updated_at" | "updated_at">, googleUpdated: string | null | undefined): Decision {
  const g = googleUpdated ? Date.parse(googleUpdated) : NaN;
  const seen = row.ext_updated_at ? Date.parse(row.ext_updated_at) : NaN;
  if (!Number.isNaN(g) && !Number.isNaN(seen) && g <= seen) return { action: "skip", why: "unchanged" };
  const local = Date.parse(row.updated_at);
  // did we change it since we last saw Google's copy? (a row that never synced counts as changed)
  const localChanged = Number.isNaN(seen) ? true : local > seen + 1000;
  if (!localChanged) return { action: "apply_google", overwrote_local: false };
  if (Number.isNaN(g) || g >= local) return { action: "apply_google", overwrote_local: true };
  return { action: "keep_local_push" };
}

/**
 * The calendar the family shares is "Phirsty Life", a calendar Phil made in
 * his own account (decision D10, 2026-11-23: permanent, no .ics subscription).
 */
export const FAMILY_CALENDAR_NAME = "Phirsty Life";

/**
 * Google's own family-group calendar (shown as "Premium Calendar"; its id is
 * `family<hex>@group.calendar.google.com`). Decision D7 (2026-11-23): Mycelium
 * never offers it in the picker, never lets it be chosen, and never reads or
 * writes it, whatever the row says. The friends in Phil's Google family
 * groups are reached by sharing Phirsty Life with them (an ACL entry), never
 * through the group calendar.
 */
export const GOOGLE_FAMILY_GROUP_RE = /^family[0-9a-f]{6,}@group\.calendar\.google\.com$/i;
export function isGuardedCalendar(id: string | null | undefined): boolean {
  return !!id && GOOGLE_FAMILY_GROUP_RE.test(id.trim());
}
export const GUARDED_CALENDAR_ERROR = "That is Google's own family-group calendar; Mycelium never reads or writes it. Choose Phirsty Life.";

/**
 * The second of the two accounts Phirsty Life may be shared with (decision
 * D8, 2026-11-23: Kirsty's Gmail is her Mycelium login and her calendar
 * address). The first is the connected account itself, the one named in
 * GOOGLE_ALLOWED_ACCOUNTS. Nobody else, ever (D7).
 */
export const FAMILY_PARTNER_ACCOUNT = "kirstykjpetco@gmail.com";

/** One entry of a Google calendar's ACL, as acl.list returns it. */
export type AclRule = { role: string; scope: { type: string; value?: string } };

/** The share list as people read it: who, and what they may do. `stranger` is true for anyone outside `allowed`. */
export type AclEntry = { who: string; role: string; scope: string; stranger: boolean };

/** A human name for an ACL scope: the address for a user, "group …", "everyone at …", or "anyone with the link / the public". */
export function describeScope(scope: AclRule["scope"]): string {
  const v = (scope.value ?? "").trim();
  switch (scope.type) {
    case "user":
      return v || "an unnamed account";
    case "group":
      return `the group ${v || "(unnamed)"}`;
    case "domain":
      return `everyone at ${v || "(unnamed domain)"}`;
    case "default":
      return "the public (anyone with the link)";
    default:
      return `${scope.type} ${v}`.trim();
  }
}

/**
 * Read an ACL the way D7 wants it read: every entry is either one of the
 * allowed addresses (a `user` scope, matched case-insensitively) or a
 * stranger. A group, a domain or the public is always a stranger, whatever it
 * is called, because Mycelium cannot see who is behind it. Google lists the
 * owner on their own calendar too; the owner is in `allowed`.
 */
export function readAcl(rules: readonly AclRule[], allowed: readonly string[]): AclEntry[] {
  const ok = new Set(allowed.map((a) => a.trim().toLowerCase()).filter(Boolean));
  return rules
    .filter((r) => r.role && r.role !== "none") // "none" is Google's way of saying "removed"
    .map((r) => {
      const who = describeScope(r.scope);
      const stranger = !(r.scope.type === "user" && ok.has((r.scope.value ?? "").trim().toLowerCase()));
      return { who, role: r.role, scope: r.scope.type, stranger };
    });
}

/** The strangers on an ACL, named with their role, for the refusal and the ticket. */
export function aclStrangers(rules: readonly AclRule[], allowed: readonly string[]): string[] {
  return readAcl(rules, allowed)
    .filter((e) => e.stranger)
    .map((e) => `${e.who} (${roleWords(e.role)})`);
}

/** Google's role names in the words the Share dialog uses. */
export function roleWords(role: string): string {
  switch (role) {
    case "owner":
      return "owner";
    case "writer":
      return "can change events";
    case "reader":
      return "sees all details";
    case "freeBusyReader":
      return "sees free/busy only";
    default:
      return role;
  }
}

/** The sentence that refuses a calendar, or stops writing to one, because of who else holds it. */
export function aclRefusal(strangers: readonly string[], when: "choose" | "health"): string {
  const list = strangers.join(", ");
  const head = `${FAMILY_CALENDAR_NAME} may be shared with the two of you and nobody else, but this calendar is also shared with ${list}.`;
  return when === "choose"
    ? `${head} Remove them in Google Calendar (Settings → Share with specific people), then choose it again.`
    : `${head} Mycelium has stopped writing to it; new appointments wait. Remove them in Google Calendar (Settings → Share with specific people), then press Sync now.`;
}

export type Staleness = { label: string; level: "ok" | "amber" | "red" | "never" };

/** "Last synced 3 min ago", coloured by how stale it is (spec §4.4: over an hour amber, over a day red). */
export function staleness(lastSyncedAt: string | null | undefined, now: Date = new Date()): Staleness {
  if (!lastSyncedAt) return { label: "Never synced", level: "never" };
  const ms = now.getTime() - Date.parse(lastSyncedAt);
  if (Number.isNaN(ms)) return { label: "Never synced", level: "never" };
  const min = Math.max(0, Math.round(ms / 60_000));
  const label =
    min < 1 ? "Last synced just now" : min < 60 ? `Last synced ${min} min ago` : min < 1440 ? `Last synced ${Math.round(min / 60)} h ago` : `Last synced ${Math.round(min / 1440)} day${Math.round(min / 1440) === 1 ? "" : "s"} ago`;
  return { label, level: min > 1440 ? "red" : min > 60 ? "amber" : "ok" };
}

/** The rolling window the full sync reads: 30 days back, 18 months on (spec §4.2). */
export function syncWindow(now: Date = new Date()): { timeMin: string; timeMax: string } {
  const min = new Date(now.getTime() - 30 * 86_400_000);
  const max = new Date(now);
  max.setUTCMonth(max.getUTCMonth() + 18);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

/** The line under the calendar: what is waiting to reach Google (spec §4.4). */
export function queueLine(waiting: number): string | null {
  if (waiting <= 0) return null;
  return waiting === 1 ? "1 change waiting to reach Google" : `${waiting} changes waiting to reach Google`;
}
