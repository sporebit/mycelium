import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { familyCtx } from "@/lib/family/server";
import { calendarsForPicker, calendarStatus, chooseCalendar, createFamilyCalendar, currentAcl, disconnectCalendar, getSyncRow, pullFamilyCalendar, shareCalendar } from "@/lib/family/calendar/sync";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";
export const maxDuration = 60;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/family/calendar — where the Family calendar stands (family
 * calendar spec §4.1, §4.4): which Google calendar, whose connection, when
 * it last synced and how stale that is, what is waiting to reach Google, the
 * daily health check, the push channel. With `?pick=1` the owner also gets
 * their calendars for the picker and the calendar's share list; those two
 * come from Google through the caller's own connection, so a member who is
 * not the owner sees the status alone.
 */
export async function GET(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    const supabase = await createUserClient();
    const ctx = await familyCtx(supabase, uid, req.nextUrl.searchParams.get("space"));
    if (!ctx) return bad("No family space.", 404);
    const status = await calendarStatus(supabase, uid, ctx.spaceId);
    const out: Record<string, unknown> = { status };
    if (req.nextUrl.searchParams.get("pick") === "1" && status.google_connected) {
      const [picker, row] = await Promise.all([calendarsForPicker(supabase), getSyncRow(supabase, ctx.spaceId)]);
      out.calendars = picker.ok ? picker.calendars : [];
      out.picker_error = picker.ok ? null : picker.error;
      out.acl = row && status.owner_is_me ? await currentAcl(supabase, row).catch(() => []) : [];
    }
    return NextResponse.json(out);
  } catch (err) {
    console.error("[/api/family/calendar GET]", err);
    return bad("fetch failed", 500);
  }
}

/**
 * POST { action, space? }:
 *   choose { calendar_id }   make that Google calendar the Family calendar (full pull, channel started)
 *   create { name? }         create "Family" in the caller's Google account and choose it
 *   share { email }          share the Family calendar with one address, "Make changes to events"
 *   sync                     pull now (any member; the pull runs as the owner)
 *   reminders { on }         whether events made here carry Google's own reminder
 *   disconnect               forget the calendar (rows stay)
 * choose, create and share need the caller's own Google connection; a member
 * without one is told to ask the owner.
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  try {
    const supabase = await createUserClient();
    const ctx = await familyCtx(supabase, uid, typeof body.space === "string" ? body.space : null);
    if (!ctx) return bad("No family space.", 404);
    const action = String(body.action ?? "");

    if (action === "choose" || action === "create") {
      const r = action === "choose" ? await chooseCalendar(supabase, uid, ctx.spaceId, String(body.calendar_id ?? "").trim()) : await createFamilyCalendar(supabase, uid, ctx.spaceId, typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : "Family");
      if (!r.ok) return bad(r.error, r.status);
      return NextResponse.json({ status: await calendarStatus(supabase, uid, ctx.spaceId), pulled: r.pulled });
    }

    const row = await getSyncRow(supabase, ctx.spaceId);
    if (action === "share") {
      if (!row) return bad("Choose the Family calendar first.", 409);
      if (row.owner_user_id !== uid) return bad("Only the person whose Google account holds the calendar can share it.", 403);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return bad("That is not an email address.");
      const r = await shareCalendar(supabase, row, email);
      if (!r.ok) return bad(r.error, r.status);
      return NextResponse.json({ ok: true, acl: await currentAcl(supabase, row).catch(() => []) });
    }
    if (action === "sync") {
      if (!row?.calendar_id || !row.owner_user_id) return bad("The Family calendar is not connected.", 409);
      const pulled = row.owner_user_id === uid ? await pullFamilyCalendar(supabase, row) : await withUser(row.owner_user_id, (db) => pullFamilyCalendar(db, row));
      return NextResponse.json({ pulled, status: await calendarStatus(supabase, uid, ctx.spaceId) });
    }
    if (action === "reminders") {
      if (!row) return bad("Choose the Family calendar first.", 409);
      const { error } = await supabase.from("family_calendar_sync").update({ google_reminders: body.on === true, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) return bad(error.message, error.code === "42501" ? 403 : 400);
      return NextResponse.json({ status: await calendarStatus(supabase, uid, ctx.spaceId) });
    }
    if (action === "disconnect") {
      if (!row) return NextResponse.json({ status: await calendarStatus(supabase, uid, ctx.spaceId) });
      if (row.owner_user_id && row.owner_user_id !== uid) return bad("Only the person whose Google account holds the calendar can disconnect it.", 403);
      await disconnectCalendar(supabase, row);
      return NextResponse.json({ status: await calendarStatus(supabase, uid, ctx.spaceId) });
    }
    return bad("action is choose, create, share, sync, reminders or disconnect.");
  } catch (err) {
    console.error("[/api/family/calendar POST]", err);
    return bad("failed", 500);
  }
}
