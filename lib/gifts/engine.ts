/**
 * The two daily jobs, per person, as that person (spec §5, §6). Called by
 * /api/cron/gift-occasions and /api/cron/gift-reminders (on the tick) and
 * by POST /api/gift-occasions/sync when the page asks. Every step is safe
 * to run twice: the plan is keyed on (person, kind, year) and the unique
 * index backs it; the task is created once per occasion; a nudge day is
 * checked against the interruptions ledger before it is sent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { interrupt } from "@/lib/nudges/interrupt";
import { londonClock } from "@/lib/daylog/day";
import { moveTicket } from "@/lib/tickets/server";
import { dobFixes, plan, type PersonBirthday } from "./occasions";
import { decide, longestLead, nudgeCounts, nudgeText, taskDue, taskTitle, type OccasionGifts } from "./reminders";
import { listOccasions } from "./server";
import { personName, type OccasionRow } from "./types";

export type SyncResult = { created: number; moved: number; people: number };

/** Seed, roll forward and reconcile with People birthdays. Logs a count (spec §12 flag 7). */
export async function syncOccasions(db: SupabaseClient, now: Date = new Date()): Promise<SyncResult> {
  const today = londonClock(now).date;
  const [existing, peopleRes] = await Promise.all([
    listOccasions(db, { includePast: true, includeArchived: true, today }),
    db.from("people").select("id, display_name, first_name, last_name, birthday").eq("tier", "person").is("deleted_at", null).is("archived_at", null).not("birthday", "is", null).limit(2000),
  ]);
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  const people: PersonBirthday[] = ((peopleRes.data ?? []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null; birthday: string | null }>).map((p) => ({
    id: p.id,
    name: p.display_name?.trim() || p.first_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Someone",
    birthday: p.birthday,
  }));

  let moved = 0;
  for (const fix of dobFixes(existing, people, today)) {
    const { error } = await db.from("gift_occasions").update({ occurs_on: fix.occurs_on, name: fix.name, updated_at: new Date().toISOString() }).eq("id", fix.id);
    if (!error) moved += 1;
  }

  let created = 0;
  for (const seed of plan(existing, people, today)) {
    // one at a time: a clash on the unique index (a parallel run) is skipped, not fatal
    const { error } = await db.from("gift_occasions").insert(seed);
    if (!error) created += 1;
    else if (error.code !== "23505") console.error("[gifts] occasion not created:", error.message);
  }
  console.log(`[gifts] occasions: ${created} created, ${moved} moved, ${people.length} people with a birthday`);
  return { created, moved, people: people.length };
}

export type RemindResult = { tasks: number; nudges: number; occasions: number };

/** The reminders (spec §6): the task when the window opens, the vague nudge on each lead day and the final one. */
export async function runReminders(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<RemindResult> {
  const today = londonClock(now).date;
  const occasions = await listOccasions(db, { today });
  if (occasions.length === 0) return { tasks: 0, nudges: 0, occasions: 0 };
  const ids = occasions.map((o) => o.id);
  const { data: giftRows } = await db.from("gifts").select("occasion_id, status").in("occasion_id", ids).limit(5000);
  const giftsBy = new Map<string, OccasionGifts>();
  for (const g of (giftRows ?? []) as Array<{ occasion_id: string; status: OccasionGifts[number]["status"] }>) giftsBy.set(g.occasion_id, [...(giftsBy.get(g.occasion_id) ?? []), { status: g.status }]);

  let tasks = 0;
  let nudgeDue = false;
  let horizon = 0;
  for (const o of occasions) {
    const d = decide(o, giftsBy.get(o.id) ?? [], today);
    if (!d) continue;
    if (d.open_task) {
      const id = await openTask(db, uid, o, today);
      if (id) tasks += 1;
    }
    if (d.nudge !== null) {
      nudgeDue = true;
      horizon = Math.max(horizon, longestLead(o), typeof d.nudge === "number" ? d.nudge : 0);
    }
  }

  let nudges = 0;
  if (nudgeDue) {
    // one line a day at most, whatever fired, and never the same day twice
    const { data: already } = await db.from("interruptions").select("id").eq("created_by", uid).eq("kind", "gifts").eq("day", today).limit(1);
    if (!already || already.length === 0) {
      const counts = nudgeCounts(
        occasions.map((occasion) => ({ occasion, gifts: giftsBy.get(occasion.id) ?? [] })),
        today,
        horizon || 30,
      );
      if (counts.occasions > 0) {
        const res = await interrupt(db, uid, { kind: "gifts", title: nudgeText(counts), url: "/organisation/gifts" }, now);
        if (res.sent) nudges += 1;
      }
    }
  }
  return { tasks, nudges, occasions: occasions.length };
}

/** "Gift for Kirsty — birthday, 23 May", due a week before, in Next; its id kept on the occasion so it is made once. */
async function openTask(db: SupabaseClient, uid: string, o: OccasionRow, today: string): Promise<string | null> {
  const who = personName(o.person);
  const title = taskTitle(o, who);
  const { data, error } = await db
    .from("tickets")
    .insert({ title, owner: uid, source: "ui", kind: "task", deadline_on: taskDue(o, today), priority_score: 0.5, description: `The window for ${o.name} has opened. The list is at /organisation/gifts.` })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[gifts] reminder task not created:", error?.message);
    return null;
  }
  const id = (data as { id: string }).id;
  try {
    await moveTicket(db, id, "next");
  } catch {
    /* it is still a ticket, in Inbox */
  }
  const { error: upErr } = await db.from("gift_occasions").update({ reminder_task_id: id, updated_at: new Date().toISOString() }).eq("id", o.id).is("reminder_task_id", null);
  if (upErr) console.error("[gifts] reminder task id not stored:", upErr.message);
  return id;
}
