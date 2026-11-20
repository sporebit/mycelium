/**
 * The notices before a scheduled switch, read and sent for one person. The
 * rule is in notices.ts; the sending goes through interrupt(), so each
 * notice is weighed against the day's budget and the quiet hours, written
 * to the ledger, and never repeated. A notice is the one thing that goes
 * while a focus timer is running (research rule 27: nothing fires during a
 * timer; scheduled switches get notices) — that is what the notice is for.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { interrupt } from "@/lib/nudges/interrupt";
import { londonNow } from "@/lib/tickets/categories";
import { todayLondon } from "@/lib/tickets/when";
import { currentWeek } from "./closeoutServer";
import { dueNotices, londonInstant, noticeKey, noticeKind, type Stage, type Switch } from "./notices";
import { dailySettings } from "./settings";
import { closeoutNotice, switchNotice } from "./words";

type TicketRow = { id: string; title: string; scheduled_on: string | null; time_from: string | null; scheduled_at: string | null };

/** Today's switches: tickets with a time today, and the close-out at its slot if the week is not closed. */
export async function switchesToday(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<Switch[]> {
  const day = todayLondon(now);
  const out: Switch[] = [];
  const { data } = await db
    .from("tickets")
    .select("id, title, scheduled_on, time_from, scheduled_at")
    .eq("owner", uid)
    .is("deleted_at", null)
    .is("completed_at", null)
    .or(`and(scheduled_on.eq.${day},time_from.not.is.null),and(scheduled_at.gte.${day}T00:00:00Z,scheduled_at.lt.${day}T23:59:59Z)`)
    .limit(50);
  for (const t of (data ?? []) as TicketRow[]) {
    const at = t.scheduled_on === day && t.time_from ? londonInstant(day, t.time_from) : t.scheduled_at;
    if (at) out.push({ id: t.id, title: t.title, at, kind: "ticket" });
  }
  const settings = await dailySettings(db);
  if (londonNow(now).isoDay === settings.closeout_day) {
    const { data: row } = await db.from("weekly_closeouts").select("started_at").eq("created_by", uid).eq("week", currentWeek(now)).maybeSingle();
    if (!(row as { started_at: string | null } | null)?.started_at) out.push({ id: "closeout", title: "The week's close-out", at: londonInstant(day, settings.closeout_time), kind: "closeout" });
  }
  return out;
}

async function sentToday(db: SupabaseClient, uid: string, day: string): Promise<Set<string>> {
  const { data } = await db.from("interruptions").select("kind, ticket_id").eq("created_by", uid).eq("day", day).in("kind", ["notice10", "notice2", "closeout"]).limit(200);
  const sent = new Set<string>();
  for (const r of (data ?? []) as Array<{ kind: string; ticket_id: string | null }>) {
    const stage: Stage = r.kind === "notice10" ? 10 : 2;
    if (r.kind === "closeout") {
      // the close-out's notice is one line, counted as both stages
      sent.add(noticeKey("closeout", 10));
      sent.add(noticeKey("closeout", 2));
    } else sent.add(noticeKey(r.ticket_id ?? "", stage));
  }
  return sent;
}

export type NoticesResult = { due: number; sent: number; held: string[] };

export async function runNotices(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<NoticesResult> {
  const day = todayLondon(now);
  const [switches, sent] = await Promise.all([switchesToday(db, uid, now), sentToday(db, uid, day)]);
  const due = dueNotices(switches, now, sent);
  const out: NoticesResult = { due: due.length, sent: 0, held: [] };
  for (const n of due) {
    const words = n.switch.kind === "closeout" ? closeoutNotice(n.minutes) : switchNotice(n.switch.title, n.minutes);
    const res = await interrupt(
      db,
      uid,
      {
        kind: n.switch.kind === "closeout" ? "closeout" : noticeKind(n.stage),
        title: words.title,
        body: words.body,
        url: n.switch.kind === "closeout" ? "/closeout" : "/today",
        ticketId: n.switch.kind === "ticket" ? n.switch.id : null,
        switchNotice: true,
        // A notice is worth saying aloud: the wall is the last channel, so a person with no phone to hand still hears it.
        channels: ["push", "telegram", "wall"],
        speak: n.stage === 2 ? words.title : null,
      },
      now,
    );
    if (res.sent) out.sent += 1;
    else out.held.push(res.reason);
  }
  return out;
}
