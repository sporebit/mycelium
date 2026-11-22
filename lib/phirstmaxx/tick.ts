/**
 * PhirstMaxx — the fifteen-minute upkeep, for one person's space
 * (app/api/cron/phirstmaxx/route.ts; spec §6 upkeep, §7).
 *
 * A space has two people in it and the cron visits every user, so each
 * space is worked once: only by the person who was first into pm_people.
 * Everything runs as that person (RLS), so a notification sent here is
 * "from" PhirstMaxx but written under their membership.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { engineProposals, expireProposals, leaveByReminders, markConflicts } from "./plans";
import { rerunResearch } from "./research/pipeline";
import { pmCtx } from "./server";

export type TickResult = { expired: number; conflicts: number; cleared: number; proposed: number; rechecked: number; reminders: number; errors: string[] };

const HOUR = 3_600_000;

/** Things whose facts are due a look: the 90-day recheck, and anything with an accepted plan inside 48 h not checked in a day. */
export async function dueRechecks(db: SupabaseClient, spaceId: string, now: Date = new Date()): Promise<string[]> {
  const t = now.getTime();
  const [due, soon] = await Promise.all([
    db.from("pm_things").select("id").eq("space_id", spaceId).eq("status", "ready").lt("next_recheck_at", now.toISOString()).order("next_recheck_at").limit(3),
    db.from("pm_plans").select("thing_id").eq("space_id", spaceId).eq("status", "accepted").not("thing_id", "is", null).gt("starts_at", now.toISOString()).lt("starts_at", new Date(t + 48 * HOUR).toISOString()).limit(10),
  ]);
  const ids = new Set(((due.data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const planned = [...new Set(((soon.data ?? []) as Array<{ thing_id: string }>).map((r) => r.thing_id))];
  if (planned.length) {
    const { data } = await db.from("pm_things").select("id, last_researched_at").in("id", planned);
    for (const th of (data ?? []) as Array<{ id: string; last_researched_at: string | null }>) {
      if (!th.last_researched_at || t - Date.parse(th.last_researched_at) > 24 * HOUR) ids.add(th.id);
    }
  }
  return [...ids].slice(0, 5);
}

/** Null when this person has no family space, or is not the one who works it. */
export async function runPhirstmaxxTick(db: SupabaseClient, uid: string, now: Date = new Date()): Promise<TickResult | null> {
  const ctx = await pmCtx(db, uid);
  if (!ctx) return null;
  const { data: first } = await db.from("pm_people").select("person_id").eq("space_id", ctx.spaceId).order("created_at").limit(1).maybeSingle();
  if ((first as { person_id: string } | null)?.person_id !== uid) return null;

  const out: TickResult = { expired: 0, conflicts: 0, cleared: 0, proposed: 0, rechecked: 0, reminders: 0, errors: [] };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out.errors.push(`${name}: ${message}`);
      console.error(`[phirstmaxx/tick] ${name}:`, message);
    }
  };
  await step("expire", async () => {
    out.expired = await expireProposals(db, ctx.spaceId, now);
  });
  await step("conflicts", async () => {
    const r = await markConflicts(db, ctx, now);
    out.conflicts = r.flagged;
    out.cleared = r.cleared;
  });
  await step("engine", async () => {
    out.proposed = (await engineProposals(db, ctx, now)).length;
  });
  await step("recheck", async () => {
    for (const id of await dueRechecks(db, ctx.spaceId, now)) {
      await rerunResearch(db, ctx.spaceId, id);
      // the recheck is owed once; the pipeline sets the next date when it finishes
      await db.from("pm_things").update({ next_recheck_at: new Date(now.getTime() + 24 * HOUR).toISOString() }).eq("id", id);
      out.rechecked += 1;
    }
  });
  await step("reminders", async () => {
    out.reminders = await leaveByReminders(db, ctx, now);
  });
  return out;
}
