/**
 * The Family calendar on Google (0184; claude/family-calendar-spec.md §4).
 *
 * One Google calendar, "Family", in Phil's own account, shared to Kirsty, is
 * the same calendar as the family space's appointments. This file is the
 * traffic between them:
 *
 *   pull   Google → family_entries, incrementally with Google's sync token
 *          (a full read of the rolling window on the first run and when
 *          Google answers 410). Cancelled events delete their row.
 *   push   family_entries → Google, straight after a write here. Updates
 *          carry If-Match; a 412 means the other side moved first, and the
 *          later change wins (Google on a tie). A push that fails goes on
 *          the jobs queue and is retried; never dropped.
 *   watch  a push channel so a change on either phone reaches here within
 *          seconds; the cron renews it before it lapses.
 *   health once a day: refresh the token and read one page. A dead token
 *          is written down, shown as "Reconnect needed", pushed to the owner
 *          once a day and raised as a ticket once.
 *
 * Only the chosen calendar is ever read or written (spec D4). Every Google
 * call goes through the OWNER's connection (their user_settings tokens), so
 * anything that runs as another member hands the Google part to
 * withUser(owner). The rows themselves are written as whoever is acting,
 * under the family's row rules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken, createCalendar, getCalendar, insertAcl, insertEvent, listAcl, listCalendars, listEventsPage, patchEvent, removeEvent, getEvent, stopChannel, watchEvents, type GoogleAclRule, type GoogleCalendarListEntry, type GoogleSyncEvent } from "@/lib/google/calendar";
import { registerJobHandler } from "@/lib/jobs/handlers";
import { enqueueJob } from "@/lib/jobs/queue";
import { interrupt } from "@/lib/nudges/interrupt";
import { londonClock } from "@/lib/daylog/day";
import { statusIdFor } from "@/lib/tickets/server";
import { withUser } from "@/lib/system/withUser";
import { allowedAccounts } from "@/lib/google/oauth";
import { aclRefusal, aclStrangers, decideIncoming, ENTRY_PROP, entryColumnsFromEvent, eventFromEntry, FAMILY_CALENDAR_NAME, FAMILY_PARTNER_ACCOUNT, GUARDED_CALENDAR_ERROR, isGuardedCalendar, queueLine, readAcl, staleness, syncWindow, type AclEntry, type EntryRow, type Staleness } from "./map";

export const PUSH_JOB = "family_calendar_push";
const SYNC_COLS = "id, space_id, calendar_id, calendar_summary, owner_user_id, sync_token, last_synced_at, last_sync_error, last_sync_error_at, channel_id, channel_resource_id, channel_token, channel_expires_at, channel_error, google_reminders, health_checked_at, health_ok, health_error, health_nudged_on, acl_blocked, updated_at";
const ENTRY_COLS = "id, title, body, place, starts_at, ends_at, all_day, ext_id, ext_etag, ext_updated_at, updated_at, kind, source";
/** The push channel is renewed when it has less than this left. */
const RENEW_BEFORE_MS = 2 * 24 * 3_600_000;
/** The health check runs when the last one is older than this (so once a day, from a 15-minute tick). */
const HEALTH_EVERY_MS = 20 * 3_600_000;
export const HEALTH_TICKET_MARK = { family_calendar: "reconnect" } as const;
/** The ticket the daily ACL check raises when someone else has been given the calendar (D7). */
export const ACL_TICKET_MARK = { family_calendar: "acl" } as const;

export type SyncRow = {
  id: string;
  space_id: string;
  calendar_id: string | null;
  calendar_summary: string | null;
  owner_user_id: string | null;
  sync_token: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  last_sync_error_at: string | null;
  channel_id: string | null;
  channel_resource_id: string | null;
  channel_token: string | null;
  channel_expires_at: string | null;
  channel_error: string | null;
  google_reminders: boolean;
  health_checked_at: string | null;
  health_ok: boolean | null;
  health_error: string | null;
  health_nudged_on: string | null;
  /** Who else holds the calendar, when the ACL check found a stranger (0187). Writes stop while set. */
  acl_blocked: string | null;
  updated_at: string;
};

type PushAction = "create" | "update" | "delete";

// ---------------------------------------------------------------------------
// The row

export async function getSyncRow(db: SupabaseClient, spaceId: string): Promise<SyncRow | null> {
  const { data, error } = await db.from("family_calendar_sync").select(SYNC_COLS).eq("space_id", spaceId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SyncRow | null) ?? null;
}

async function ensureSyncRow(db: SupabaseClient, spaceId: string): Promise<SyncRow> {
  const have = await getSyncRow(db, spaceId);
  if (have) return have;
  const { data, error } = await db.from("family_calendar_sync").insert({ space_id: spaceId }).select(SYNC_COLS).single();
  if (error) throw new Error(error.message);
  return data as SyncRow;
}

async function patchSync(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("family_calendar_sync").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

async function log(db: SupabaseClient, spaceId: string, row: { entry_id?: string | null; ext_id?: string | null; direction: "in" | "out"; action: string; detail?: Record<string, unknown> }): Promise<void> {
  const { error } = await db.from("family_calendar_sync_log").insert({ space_id: spaceId, entry_id: row.entry_id ?? null, ext_id: row.ext_id ?? null, direction: row.direction, action: row.action, detail: row.detail ?? {} });
  if (error) console.error("[family/calendar] log failed:", error.message);
}

/** Run `fn` with a client acting as the connection's owner; the caller's own client when they are the owner. */
async function asOwner<T>(db: SupabaseClient, uid: string, row: SyncRow, fn: (ownerDb: SupabaseClient) => Promise<T>): Promise<T> {
  if (!row.owner_user_id) throw new Error("The Family calendar has no owner connection.");
  if (row.owner_user_id === uid) return fn(db);
  return withUser(row.owner_user_id, fn);
}

// ---------------------------------------------------------------------------
// Choosing, creating and sharing the calendar (spec §4.1)

export type CalendarChoice = { id: string; summary: string; primary: boolean };

/** The owner's calendars for the picker: ids and names only, never their events. */
export async function calendarsForPicker(ownerDb: SupabaseClient): Promise<{ ok: true; calendars: CalendarChoice[] } | { ok: false; status: number; error: string }> {
  const r = await listCalendars(ownerDb);
  if (r.status === 401 || r.status === 403) return { ok: false, status: 409, error: "Google is not connected, or needs reconnecting, in Settings → Integrations." };
  if (!r.body) return { ok: false, status: 502, error: `Google did not answer (${r.status}).` };
  // Google's family-group calendar is never offered (D7)
  return { ok: true, calendars: r.body.filter((c) => !isGuardedCalendar(c.id)).map((c) => ({ id: c.id, summary: c.summary ?? c.id, primary: !!c.primary })) };
}

/**
 * Make this calendar the Family calendar. The old sync token and channel are
 * dropped, a full pull runs, and the push channel is started. Only a
 * calendar the owner can write to is accepted.
 */
export async function chooseCalendar(db: SupabaseClient, uid: string, spaceId: string, calendarId: string, now: Date = new Date()): Promise<{ ok: true; row: SyncRow; pulled: PullResult } | { ok: false; status: number; error: string }> {
  if (isGuardedCalendar(calendarId)) return { ok: false, status: 403, error: GUARDED_CALENDAR_ERROR };
  const got = await getCalendar(db, calendarId);
  if (got.status === 401 || got.status === 403) return { ok: false, status: 409, error: "Google is not connected, or needs reconnecting, in Settings → Integrations." };
  if (!got.body) return { ok: false, status: 404, error: "Google has no calendar with that id." };
  // D7: who else holds it? Refused, naming them, before anything is saved.
  const acl = await checkAcl(db, calendarId);
  if (!acl.ok) return { ok: false, status: acl.status, error: acl.error };
  const have = await ensureSyncRow(db, spaceId);
  if (have.channel_id && have.channel_resource_id) await stopChannel(db, { id: have.channel_id, resourceId: have.channel_resource_id }).catch(() => undefined);
  await patchSync(db, have.id, {
    calendar_id: calendarId,
    calendar_summary: got.body.summary ?? calendarId,
    owner_user_id: uid,
    sync_token: null,
    last_sync_error: null,
    last_sync_error_at: null,
    channel_id: null,
    channel_resource_id: null,
    channel_token: null,
    channel_expires_at: null,
    channel_error: null,
    health_ok: true,
    health_error: null,
    health_checked_at: now.toISOString(),
    acl_blocked: null,
  });
  let row = (await getSyncRow(db, spaceId))!;
  const pulled = await pullFamilyCalendar(db, row, now);
  await ensureChannel(db, row, now).catch((e) => console.error("[family/calendar] channel:", e));
  row = (await getSyncRow(db, spaceId))!;
  return { ok: true, row, pulled };
}

/** Create a calendar called "Family" in the owner's account and choose it. */
export async function createFamilyCalendar(db: SupabaseClient, uid: string, spaceId: string, name: string = FAMILY_CALENDAR_NAME): Promise<ReturnType<typeof chooseCalendar>> {
  const made = await createCalendar(db, name);
  if (made.status === 401 || made.status === 403) return { ok: false, status: 409, error: "Google is not connected, or needs reconnecting, in Settings → Integrations." };
  if (!made.body?.id) return { ok: false, status: 502, error: `Google did not create the calendar (${made.status}).` };
  return chooseCalendar(db, uid, spaceId, made.body.id);
}

export async function shareCalendar(ownerDb: SupabaseClient, row: SyncRow, email: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!row.calendar_id) return { ok: false, status: 409, error: "Choose the Family calendar first." };
  const r = await insertAcl(ownerDb, row.calendar_id, email, "writer");
  if (r.status === 401 || r.status === 403) return { ok: false, status: 409, error: "Google is not connected, or needs reconnecting." };
  if (r.status >= 300) return { ok: false, status: 502, error: `Google refused the share (${r.status}).` };
  return { ok: true };
}

/** The share list as the owner sees it on the tab: everyone on the ACL, strangers marked, so Phil can see Kirsty has it and nobody else does (D7). */
export async function currentAcl(ownerDb: SupabaseClient, row: SyncRow): Promise<AclEntry[]> {
  if (!row.calendar_id) return [];
  const [r, allowed] = await Promise.all([listAcl(ownerDb, row.calendar_id), familyAclAllowed(ownerDb)]);
  return readAcl((r.body ?? []) as GoogleAclRule[], allowed);
}

/**
 * The two addresses the calendar may be shared with: the connected account
 * (GOOGLE_ALLOWED_ACCOUNTS, and the address Google reported at connect time,
 * which is the same person) and Kirsty's (FAMILY_PARTNER_ACCOUNT). `db` is
 * the owner's client.
 */
export async function familyAclAllowed(ownerDb: SupabaseClient): Promise<string[]> {
  const { data } = await ownerDb.from("user_settings").select("google_account_email").maybeSingle();
  const own = ((data as { google_account_email?: string | null } | null)?.google_account_email ?? "").trim().toLowerCase();
  return Array.from(new Set([...allowedAccounts(), ...(own ? [own] : []), FAMILY_PARTNER_ACCOUNT.toLowerCase()]));
}

export type AclCheck = { ok: true; acl: AclEntry[] } | { ok: false; status: number; error: string; strangers: string[] };

/**
 * D7, the rule itself: read the calendar's ACL and refuse it if anyone but
 * the two allowed accounts holds it — a user, a group, a domain or the public
 * — naming who. An ACL Google will not show (a calendar shared *to* the owner
 * rather than owned) is refused too: only a calendar of the owner's own can
 * be the Family calendar (D2). `db` is the owner's client.
 */
export async function checkAcl(ownerDb: SupabaseClient, calendarId: string, when: "choose" | "health" = "choose"): Promise<AclCheck> {
  const [r, allowed] = await Promise.all([listAcl(ownerDb, calendarId), familyAclAllowed(ownerDb)]);
  if (r.status === 401) return { ok: false, status: 409, error: "Google is not connected, or needs reconnecting, in Settings → Integrations.", strangers: [] };
  if (r.status === 403 || r.status === 404) return { ok: false, status: 409, error: `Google will not show who this calendar is shared with (${r.status}); only a calendar in your own account can be the Family calendar.`, strangers: [] };
  if (!r.body) return { ok: false, status: 502, error: `Google did not answer about the calendar's sharing (${r.status}).`, strangers: [] };
  const rules = r.body as GoogleAclRule[];
  const strangers = aclStrangers(rules, allowed);
  if (strangers.length) return { ok: false, status: 403, error: aclRefusal(strangers, when), strangers };
  return { ok: true, acl: readAcl(rules, allowed) };
}

/** Forget the calendar: stop the channel, clear the row. Rows already here stay; their ext ids are kept so a reconnect finds them. */
export async function disconnectCalendar(db: SupabaseClient, row: SyncRow): Promise<void> {
  if (row.channel_id && row.channel_resource_id) await stopChannel(db, { id: row.channel_id, resourceId: row.channel_resource_id }).catch(() => undefined);
  await patchSync(db, row.id, { calendar_id: null, calendar_summary: null, sync_token: null, channel_id: null, channel_resource_id: null, channel_token: null, channel_expires_at: null, channel_error: null, last_sync_error: null });
}

// ---------------------------------------------------------------------------
// Pull: Google → Mycelium (spec §4.2)

export type PullResult = { ok: boolean; created: number; updated: number; deleted: number; skipped: number; full: boolean; error?: string };

export async function pullFamilyCalendar(db: SupabaseClient, row: SyncRow, now: Date = new Date()): Promise<PullResult> {
  const out: PullResult = { ok: false, created: 0, updated: 0, deleted: 0, skipped: 0, full: !row.sync_token };
  if (!row.calendar_id) return { ...out, error: "no calendar chosen" };
  if (isGuardedCalendar(row.calendar_id)) return { ...out, error: GUARDED_CALENDAR_ERROR };
  let syncToken: string | null = row.sync_token;
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  let restarted = false;
  const window = syncWindow(now);
  try {
    for (let pages = 0; pages < 40; pages++) {
      const page = await listEventsPage(db, row.calendar_id, { syncToken, pageToken, ...(syncToken ? {} : window) });
      if (page.status === 410 && !restarted) {
        // the token has lapsed: start again from a full read
        restarted = true;
        syncToken = null;
        pageToken = null;
        out.full = true;
        await log(db, row.space_id, { direction: "in", action: "full_sync", detail: { why: "410" } });
        continue;
      }
      if (page.status === 401 || page.status === 403) throw new Error("Google refused the connection; reconnect in Settings → Integrations.");
      if (!page.body) throw new Error(`Google did not answer (${page.status}).`);
      for (const ev of page.body.items ?? []) {
        const did = await applyIncoming(db, row, ev);
        out[did] += 1;
      }
      if (page.body.nextPageToken) {
        pageToken = page.body.nextPageToken;
        continue;
      }
      nextSyncToken = page.body.nextSyncToken ?? null;
      break;
    }
    await patchSync(db, row.id, { sync_token: nextSyncToken ?? syncToken, last_synced_at: now.toISOString(), last_sync_error: null, last_sync_error_at: null });
    out.ok = true;
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchSync(db, row.id, { last_sync_error: message.slice(0, 300), last_sync_error_at: now.toISOString() }).catch(() => undefined);
    return { ...out, error: message };
  }
}

/** One incoming event onto the rows. Returns which counter it moved. */
async function applyIncoming(db: SupabaseClient, row: SyncRow, ev: GoogleSyncEvent): Promise<"created" | "updated" | "deleted" | "skipped"> {
  const { data: existing } = await db.from("family_entries").select(ENTRY_COLS).eq("space_id", row.space_id).eq("ext_provider", "google").eq("ext_id", ev.id).maybeSingle();
  const have = (existing as EntryRow | null) ?? null;

  if (ev.status === "cancelled") {
    if (!have) return "skipped";
    const { error } = await db.from("family_entries").delete().eq("id", have.id).eq("space_id", row.space_id);
    if (error) throw new Error(error.message);
    await log(db, row.space_id, { entry_id: have.id, ext_id: ev.id, direction: "in", action: "deleted" });
    return "deleted";
  }

  const cols = entryColumnsFromEvent(ev);
  if (!cols) return "skipped";

  if (have) {
    const decision = decideIncoming(have, ev.updated);
    if (decision.action === "skip") return "skipped";
    if (decision.action === "keep_local_push") {
      // ours is newer: Google's copy is the one overwritten
      await log(db, row.space_id, { entry_id: have.id, ext_id: ev.id, direction: "out", action: "overwritten", detail: { google_updated: ev.updated, local_updated: have.updated_at, kept: "mycelium" } });
      await pushEntry(db, row, have.id, "update");
      return "skipped";
    }
    const { error } = await db
      .from("family_entries")
      .update({ ...cols, updated_at: cols.ext_updated_at ?? new Date().toISOString() })
      .eq("id", have.id)
      .eq("space_id", row.space_id);
    if (error) throw new Error(error.message);
    await log(db, row.space_id, { entry_id: have.id, ext_id: ev.id, direction: "in", action: decision.overwrote_local ? "overwritten" : "updated", detail: decision.overwrote_local ? { google_updated: ev.updated, local_updated: have.updated_at, kept: "google" } : {} });
    return "updated";
  }

  // Not seen under this id. An event made here carries its row id; after a
  // disconnect and reconnect that row has lost nothing but its ext_id, so
  // re-link it rather than make a twin.
  const ours = ev.extendedProperties?.private?.[ENTRY_PROP];
  if (ours) {
    const { data: linked } = await db.from("family_entries").select("id").eq("id", ours).eq("space_id", row.space_id).maybeSingle();
    if (linked) {
      const { error } = await db
        .from("family_entries")
        .update({ ...cols, updated_at: cols.ext_updated_at ?? new Date().toISOString() })
        .eq("id", ours)
        .eq("space_id", row.space_id);
      if (error) throw new Error(error.message);
      await log(db, row.space_id, { entry_id: ours, ext_id: ev.id, direction: "in", action: "updated", detail: { relinked: true } });
      return "updated";
    }
  }
  const { data: made, error } = await db
    .from("family_entries")
    .insert({ ...cols, space_id: row.space_id, source: "google", created_by: row.owner_user_id, updated_at: cols.ext_updated_at ?? new Date().toISOString() })
    .select("id")
    .single();
  if (error) {
    // 23505: the same event landed twice in one run (a page boundary); the row is there.
    if (error.code === "23505") return "skipped";
    throw new Error(error.message);
  }
  await log(db, row.space_id, { entry_id: (made as { id: string }).id, ext_id: ev.id, direction: "in", action: "created" });
  return "created";
}

// ---------------------------------------------------------------------------
// Push: Mycelium → Google (spec §4.3)

export type PushResult = { done: boolean; action: PushAction; status?: number; error?: string };

/**
 * Bring Google's copy of one row in line with the row. `db` must be the
 * OWNER's client. A row that has gone (deleted here) is removed over there
 * by its ext_id, which the caller passes because the row no longer holds it.
 */
export async function pushEntry(db: SupabaseClient, row: SyncRow, entryId: string, action: PushAction, extId?: string | null): Promise<PushResult> {
  if (!row.calendar_id) return { done: true, action };
  // never written, and not retried either: the row is wrong, not Google (D7)
  if (isGuardedCalendar(row.calendar_id)) return { done: true, action, error: GUARDED_CALENDAR_ERROR };
  // the daily check found a stranger on the calendar (D7): nothing is written until they are gone; the change waits on the queue
  if (row.acl_blocked) return { done: false, action, status: 423, error: row.acl_blocked };
  const cal = row.calendar_id;

  if (action === "delete") {
    if (!extId) return { done: true, action };
    const r = await removeEvent(db, cal, extId);
    if (r.status === 204 || r.status === 200) {
      await log(db, row.space_id, { entry_id: entryId, ext_id: extId, direction: "out", action: "deleted" });
      return { done: true, action };
    }
    return { done: false, action, status: r.status, error: `Google answered ${r.status}` };
  }

  const { data } = await db.from("family_entries").select(ENTRY_COLS).eq("id", entryId).eq("space_id", row.space_id).maybeSingle();
  const entry = (data as (EntryRow & { kind: string }) | null) ?? null;
  if (!entry) return { done: true, action }; // gone since: nothing to send
  if (entry.kind !== "appointment") {
    // no longer an appointment: take it off the calendar if it was there
    if (entry.ext_id) return pushEntry(db, row, entryId, "delete", entry.ext_id);
    return { done: true, action };
  }
  const body = eventFromEntry(entry, row.google_reminders);
  if (!body) return { done: true, action };

  if (!entry.ext_id) {
    const r = await insertEvent(db, cal, body);
    if (!r.body?.id) return { done: false, action: "create", status: r.status, error: `Google answered ${r.status}` };
    await db
      .from("family_entries")
      .update({ ext_provider: "google", ext_id: r.body.id, ext_etag: r.body.etag ?? null, ext_ical_uid: r.body.iCalUID ?? null, ext_updated_at: r.body.updated ?? null, updated_at: r.body.updated ?? new Date().toISOString() })
      .eq("id", entryId)
      .eq("space_id", row.space_id);
    await log(db, row.space_id, { entry_id: entryId, ext_id: r.body.id, direction: "out", action: "created" });
    return { done: true, action: "create" };
  }

  let r = await patchEvent(db, cal, entry.ext_id, body, entry.ext_etag);
  if (r.status === 412) {
    // Someone changed it on Google since we last looked. Later change wins, Google on a tie.
    const theirs = await getEvent(db, cal, entry.ext_id);
    if (theirs.body) {
      const decision = decideIncoming(entry, theirs.body.updated);
      if (decision.action !== "keep_local_push") {
        const cols = entryColumnsFromEvent(theirs.body);
        if (cols) {
          await db.from("family_entries").update({ ...cols, updated_at: cols.ext_updated_at ?? new Date().toISOString() }).eq("id", entryId).eq("space_id", row.space_id);
          await log(db, row.space_id, { entry_id: entryId, ext_id: entry.ext_id, direction: "in", action: "overwritten", detail: { google_updated: theirs.body.updated, local_updated: entry.updated_at, kept: "google", via: "412" } });
        }
        return { done: true, action: "update" };
      }
      await log(db, row.space_id, { entry_id: entryId, ext_id: entry.ext_id, direction: "out", action: "overwritten", detail: { google_updated: theirs.body.updated, local_updated: entry.updated_at, kept: "mycelium", via: "412" } });
    }
    r = await patchEvent(db, cal, entry.ext_id, body, null);
  }
  if (r.status === 404 || r.status === 410) {
    // deleted over there while we were editing: the row stays, the link goes, and it is made again
    await db.from("family_entries").update({ ext_id: null, ext_etag: null, ext_updated_at: null }).eq("id", entryId).eq("space_id", row.space_id);
    return pushEntry(db, row, entryId, "create");
  }
  if (!r.body?.id) return { done: false, action: "update", status: r.status, error: `Google answered ${r.status}` };
  await db
    .from("family_entries")
    .update({ ext_etag: r.body.etag ?? null, ext_updated_at: r.body.updated ?? null, updated_at: r.body.updated ?? new Date().toISOString() })
    .eq("id", entryId)
    .eq("space_id", row.space_id);
  await log(db, row.space_id, { entry_id: entryId, ext_id: entry.ext_id, direction: "out", action: "updated" });
  return { done: true, action: "update" };
}

/**
 * Called after every write to a family appointment (lib/family/resources.ts).
 * Soft: it never throws and never blocks the save. The Google part runs as
 * the owner; a failure, or no connection right now, puts the change on the
 * queue so it is retried and counted (spec §4.4 "2 changes waiting").
 */
export async function afterEntryWrite(db: SupabaseClient, uid: string, spaceId: string, entryId: string, action: PushAction, extId?: string | null): Promise<void> {
  try {
    const row = await getSyncRow(db, spaceId);
    if (!row?.calendar_id || !row.owner_user_id) return; // not connected: nothing to do
    if (action === "delete" && !extId) return; // never reached Google: nothing to remove
    const result = await asOwner(db, uid, row, (ownerDb) => pushEntry(ownerDb, row, entryId, action, extId));
    if (result.done) return;
    await queuePush(db, spaceId, entryId, action, extId ?? null, result.error ?? "push failed");
    if (result.status === 401 || result.status === 403) await patchSync(db, row.id, { last_sync_error: "Google refused the connection; reconnect in Settings → Integrations.", last_sync_error_at: new Date().toISOString() }).catch(() => undefined);
  } catch (err) {
    console.error("[family/calendar] afterEntryWrite:", err);
    await queuePush(db, spaceId, entryId, action, extId ?? null, err instanceof Error ? err.message : String(err)).catch((e) => console.error("[family/calendar] queue failed:", e));
  }
}

async function queuePush(db: SupabaseClient, spaceId: string, entryId: string, action: PushAction, extId: string | null, why: string): Promise<void> {
  const q = await enqueueJob(db, {
    kind: PUSH_JOB,
    payload: { space_id: spaceId, entry_id: entryId, action, ext_id: extId },
    lane: "cloud",
    dedupeKey: `${PUSH_JOB}:${entryId}:${action}`,
    maxAttempts: 8,
  });
  if (!q.duplicate) await log(db, spaceId, { entry_id: entryId, ext_id: extId, direction: "out", action: "queued", detail: { why: why.slice(0, 200), action } });
}

/** How many changes are waiting to reach Google for this space. */
export async function queuedPushes(db: SupabaseClient, spaceId: string): Promise<number> {
  const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", PUSH_JOB).eq("payload->>space_id", spaceId).in("status", ["queued", "claimed"]);
  return count ?? 0;
}

// The queued push, run by the cloud job runner (lib/jobs/cloud.ts) as the
// job's owner, who hands the Google call to the connection's owner.
registerJobHandler(PUSH_JOB, {
  run: async (job, db) => {
    const p = job.payload as { space_id?: string; entry_id?: string; action?: PushAction; ext_id?: string | null };
    if (!p.space_id || !p.entry_id || !p.action) throw new Error("push job needs space_id, entry_id and action");
    const row = await getSyncRow(db, p.space_id);
    if (!row?.calendar_id || !row.owner_user_id) return { done: true, why: "not connected" };
    const result = await asOwner(db, job.created_by ?? row.owner_user_id, row, (ownerDb) => pushEntry(ownerDb, row, p.entry_id!, p.action!, p.ext_id ?? null));
    if (!result.done) throw new Error(result.error ?? "push failed");
    await log(db, p.space_id, { entry_id: p.entry_id, ext_id: p.ext_id ?? null, direction: "out", action: "retried", detail: { action: p.action } });
    return { done: true };
  },
  apply: async () => undefined,
  onGiveUp: async (job, error, db) => {
    const p = job.payload as { space_id?: string; entry_id?: string; ext_id?: string | null };
    if (p.space_id) await log(db, p.space_id, { entry_id: p.entry_id ?? null, ext_id: p.ext_id ?? null, direction: "out", action: "failed", detail: { error: error.slice(0, 300) } });
  },
});

// ---------------------------------------------------------------------------
// The push channel (spec §4.2)

function pushAddress(): string | null {
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) return null; // Google only posts to https
  return `${base}/api/google/push`;
}

/** Start the channel, or renew it when it has under two days left. `db` is the owner's client. */
export async function ensureChannel(db: SupabaseClient, row: SyncRow, now: Date = new Date()): Promise<"kept" | "started" | "unavailable"> {
  if (!row.calendar_id) return "unavailable";
  const address = pushAddress();
  if (!address) {
    await patchSync(db, row.id, { channel_error: "No public https address (PUBLIC_BASE_URL); the 15-minute poll is doing the work." });
    return "unavailable";
  }
  const left = row.channel_expires_at ? Date.parse(row.channel_expires_at) - now.getTime() : -1;
  if (row.channel_id && left > RENEW_BEFORE_MS) return "kept";
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, "");
  const r = await watchEvents(db, row.calendar_id, { id, token, address });
  if (!r.body?.resourceId) {
    // Most often: the receiving domain is not verified in Google Cloud (checklist step 2.8). The poll still runs.
    await patchSync(db, row.id, { channel_error: `Google refused the push channel (${r.status}). Instant updates are off; the 15-minute poll is doing the work.` });
    return "unavailable";
  }
  if (row.channel_id && row.channel_resource_id) await stopChannel(db, { id: row.channel_id, resourceId: row.channel_resource_id }).catch(() => undefined);
  await patchSync(db, row.id, {
    channel_id: id,
    channel_resource_id: r.body.resourceId,
    channel_token: token,
    channel_expires_at: r.body.expiration ? new Date(Number(r.body.expiration)).toISOString() : new Date(now.getTime() + 6 * 86_400_000).toISOString(),
    channel_error: null,
  });
  return "started";
}

// ---------------------------------------------------------------------------
// Health (spec §4.4)

export type HealthResult = { ok: boolean; error?: string; nudged: boolean; ticket: boolean; acl_blocked?: string | null };

/**
 * Refresh the token, read one page, and read the ACL again (D7). On failure:
 * write it down, tell the owner once a day (a push with the link, inside the
 * budget) and raise one ticket. A stranger on the ACL also stops every write
 * until the next check finds them gone. `db` is the owner's client.
 */
export async function healthCheck(db: SupabaseClient, row: SyncRow, now: Date = new Date()): Promise<HealthResult> {
  if (!row.calendar_id || !row.owner_user_id) return { ok: true, nudged: false, ticket: false };
  let error: string | null = null;
  let aclBlocked: string | null = null;
  const token = await getAccessToken(db);
  if (!token) {
    const { data } = await db.from("user_settings").select("google_sync_error, google_refresh_token").maybeSingle();
    const s = data as { google_sync_error?: string | null; google_refresh_token?: string | null } | null;
    error = !s?.google_refresh_token ? "Google is not connected." : (s.google_sync_error ?? "Google refused the token.");
  } else {
    const page = await listEventsPage(db, row.calendar_id, { maxResults: 1, ...syncWindow(now) });
    if (page.status === 401 || page.status === 403) error = `Google refused the Family calendar (${page.status}).`;
    else if (!page.body) error = `Google did not answer (${page.status}).`;
    else {
      const acl = await checkAcl(db, row.calendar_id, "health");
      if (!acl.ok) {
        error = acl.error;
        if (acl.strangers.length) aclBlocked = acl.error.slice(0, 1000);
      }
    }
  }
  const checkedAt = now.toISOString();
  if (!error) {
    await patchSync(db, row.id, { health_checked_at: checkedAt, health_ok: true, health_error: null, acl_blocked: null });
    await log(db, row.space_id, { direction: "in", action: "health", detail: { ok: true, ...(row.acl_blocked ? { acl_cleared: true } : {}) } });
    return { ok: true, nudged: false, ticket: false, acl_blocked: null };
  }
  const today = londonClock(now).date;
  const nudge = row.health_nudged_on !== today;
  await patchSync(db, row.id, { health_checked_at: checkedAt, health_ok: false, health_error: error.slice(0, 300), acl_blocked: aclBlocked, ...(nudge ? { health_nudged_on: today } : {}) });
  await log(db, row.space_id, { direction: "in", action: "health", detail: { ok: false, error: error.slice(0, 300), ...(aclBlocked ? { acl_blocked: true } : {}) } });
  let nudged = false;
  let ticket = false;
  if (nudge) {
    const sent = aclBlocked
      ? await interrupt(db, row.owner_user_id, { kind: "family_calendar_acl", title: `${FAMILY_CALENDAR_NAME} is shared with someone else`, body: error, url: "/family" }, now).catch(() => null)
      : await interrupt(db, row.owner_user_id, { kind: "family_calendar_reconnect", title: "The Family calendar needs Google reconnecting", body: error, url: "/other/settings?tab=integrations" }, now).catch(() => null);
    nudged = !!sent && sent.sent;
    ticket = await (aclBlocked ? ensureAclTicket(db, row.owner_user_id, error, today) : ensureReconnectTicket(db, row.owner_user_id, error, today)).catch(() => false);
  }
  return { ok: false, error, nudged, ticket, acl_blocked: aclBlocked };
}

/** One open ticket at a time about this; dated today so it sits in the queue. */
async function ensureReconnectTicket(db: SupabaseClient, uid: string, error: string, today: string): Promise<boolean> {
  return ensureHealthTicket(db, uid, today, {
    mark: HEALTH_TICKET_MARK,
    title: "Reconnect Google for the Family calendar",
    description: `The daily check found the Family calendar's Google connection is not working: ${error}\n\nSettings → Integrations → RECONNECT (sign in as the one allowed account). Then open Family → Calendar and press Sync now.\n\n/other/settings?tab=integrations`,
  });
}

/** D7: someone else has been given the calendar since it was chosen. One open ticket at a time; dated today. */
async function ensureAclTicket(db: SupabaseClient, uid: string, error: string, today: string): Promise<boolean> {
  return ensureHealthTicket(db, uid, today, {
    mark: ACL_TICKET_MARK,
    title: `${FAMILY_CALENDAR_NAME} is shared with someone it should not be`,
    description: `The daily check (${today}) read the calendar's sharing list. ${error}\n\nMycelium has stopped writing to the calendar until they are removed; appointments made meanwhile wait on the queue. Google Calendar → Settings → ${FAMILY_CALENDAR_NAME} → Share with specific people → remove everyone but the two of you (and nothing under "Access permissions for events"). Then Family → Calendar → Sync now.\n\n/family`,
  });
}

async function ensureHealthTicket(db: SupabaseClient, uid: string, today: string, t: { mark: Record<string, string>; title: string; description: string }): Promise<boolean> {
  const { data: open } = await db.from("tickets").select("id").contains("meta", t.mark).is("deleted_at", null).is("completed_at", null).is("cancelled_at", null).limit(1);
  if (open && open.length > 0) return false;
  const { data: profile } = await db.from("profiles").select("personal_space_id").eq("id", uid).maybeSingle();
  const spaceId = (profile as { personal_space_id?: string | null } | null)?.personal_space_id ?? null;
  const row: Record<string, unknown> = {
    title: t.title,
    description: t.description,
    kind: "task",
    where_ctx: "anywhere",
    tools: ["phone", "pc"],
    time_window: "anytime",
    points: 1,
    scheduled_on: today,
    source: "claude",
    owner: uid,
    priority_score: 0.8,
    meta: t.mark,
  };
  if (spaceId) {
    row.space_id = spaceId;
    const status = await statusIdFor(db, spaceId, "next");
    if (status) row.status_id = status;
  }
  const ins = await db.from("tickets").insert(row);
  if (ins.error) throw new Error(ins.error.message);
  return true;
}

// ---------------------------------------------------------------------------
// The tick (every 15 minutes) and the status line

export type TickResult = { spaces: number; pulled: number; channels: number; health: number; errors: string[] };

/** For the connections this person owns: pull, keep the channel alive, and once a day check health. */
export async function runFamilyCalendarTick(ownerDb: SupabaseClient, uid: string, now: Date = new Date()): Promise<TickResult> {
  const out: TickResult = { spaces: 0, pulled: 0, channels: 0, health: 0, errors: [] };
  const { data, error } = await ownerDb.from("family_calendar_sync").select(SYNC_COLS).eq("owner_user_id", uid).not("calendar_id", "is", null).limit(20);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as SyncRow[]) {
    out.spaces += 1;
    try {
      const pulled = await pullFamilyCalendar(ownerDb, row, now);
      if (pulled.ok) out.pulled += 1;
      else if (pulled.error) out.errors.push(pulled.error);
      if ((await ensureChannel(ownerDb, row, now)) === "started") out.channels += 1;
      const lastHealth = row.health_checked_at ? Date.parse(row.health_checked_at) : 0;
      if (now.getTime() - lastHealth > HEALTH_EVERY_MS) {
        await healthCheck(ownerDb, row, now);
        out.health += 1;
      }
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}

export type CalendarStatus = {
  connected: boolean;
  calendar: { id: string; summary: string } | null;
  owner_is_me: boolean;
  owner_id: string | null;
  staleness: Staleness;
  last_synced_at: string | null;
  last_error: string | null;
  queue: number;
  queue_line: string | null;
  health: { ok: boolean | null; error: string | null; checked_at: string | null };
  /** D7: who else holds the calendar, when the daily check found someone; writes are stopped while set. */
  acl_blocked: string | null;
  channel: { on: boolean; expires_at: string | null; error: string | null };
  google_reminders: boolean;
  /** Whether this person has a Google connection of their own (so they could choose a calendar). */
  google_connected: boolean;
  google_account: string | null;
  needs_reconnect: boolean;
};

export async function calendarStatus(db: SupabaseClient, uid: string, spaceId: string, now: Date = new Date()): Promise<CalendarStatus> {
  const [row, queue, settings] = await Promise.all([
    getSyncRow(db, spaceId),
    queuedPushes(db, spaceId),
    db.from("user_settings").select("google_refresh_token, google_sync_error, google_account_email").maybeSingle(),
  ]);
  const s = (settings.data ?? null) as { google_refresh_token?: string | null; google_sync_error?: string | null; google_account_email?: string | null } | null;
  const googleConnected = !!s?.google_refresh_token;
  const ownerIsMe = !!row?.owner_user_id && row.owner_user_id === uid;
  return {
    connected: !!row?.calendar_id,
    calendar: row?.calendar_id ? { id: row.calendar_id, summary: row.calendar_summary ?? row.calendar_id } : null,
    owner_is_me: ownerIsMe,
    owner_id: row?.owner_user_id ?? null,
    staleness: staleness(row?.last_synced_at, now),
    last_synced_at: row?.last_synced_at ?? null,
    last_error: row?.last_sync_error ?? null,
    queue,
    queue_line: queueLine(queue),
    health: { ok: row?.health_ok ?? null, error: row?.health_error ?? null, checked_at: row?.health_checked_at ?? null },
    acl_blocked: row?.acl_blocked ?? null,
    channel: { on: !!row?.channel_id && !row.channel_error, expires_at: row?.channel_expires_at ?? null, error: row?.channel_error ?? null },
    google_reminders: row?.google_reminders ?? false,
    google_connected: googleConnected,
    google_account: s?.google_account_email ?? null,
    needs_reconnect: (ownerIsMe && googleConnected && !!s?.google_sync_error) || row?.health_ok === false,
  };
}

export type { GoogleCalendarListEntry };
