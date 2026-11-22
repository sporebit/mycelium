/**
 * PhirstMaxx — the one file that touches another section's tables (spec §3).
 *
 * Everything PhirstMaxx needs from the rest of Mycelium goes through here,
 * so the coupling is in one place:
 *
 *   familyBusyEvents      appointments on the Family calendar (family_entries)
 *                         as busy time for everyone (spec §4). PhirstMaxx's
 *                         own plans are left out: they are known from
 *                         pm_plans, and counting them here would make every
 *                         accepted plan look like a conflict with itself.
 *   writePlanToCalendar   an accepted plan becomes a Family appointment,
 *                         through lib/family/resources.ts so it reaches
 *                         Google the same way a hand-made one does (0184).
 *   removePlanFromCalendar the appointment goes when the plan is cancelled.
 *   seedTimelineNote      a done plan leaves a "Did …" note on the family
 *                         timeline, prompting a photo (spec §7).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRow, deleteRow } from "@/lib/family/resources";
import type { FamilyCtx } from "@/lib/family/server";
import { londonDate } from "./engine";
import { allLegsInWords } from "./legs";
import type { PmPlan, PmPlanLeg } from "./types";

export type BusyEvent = { id: string; title: string; start: number; end: number };

const DEFAULT_EVENT_MINUTES = 60;

/**
 * Family appointments overlapping [startIso, endIso), as busy spans. An
 * appointment with no end is taken as an hour. All-day entries are left out:
 * they are birthdays and reminders, not time anyone is away.
 */
export async function familyBusyEvents(db: SupabaseClient, spaceId: string, startIso: string, endIso: string): Promise<BusyEvent[]> {
  const { data, error } = await db
    .from("family_entries")
    .select("id, title, starts_at, ends_at, all_day, source")
    .eq("space_id", spaceId)
    .eq("kind", "appointment")
    .not("starts_at", "is", null)
    .lt("starts_at", endIso)
    .gte("starts_at", new Date(Date.parse(startIso) - 24 * 3_600_000).toISOString())
    .order("starts_at")
    .limit(500);
  if (error) throw new Error(`family_entries: ${error.message}`);
  const from = Date.parse(startIso);
  const out: BusyEvent[] = [];
  for (const r of (data ?? []) as Array<{ id: string; title: string; starts_at: string; ends_at: string | null; all_day: boolean | null; source: string | null }>) {
    if (r.all_day || r.source === "phirstmaxx") continue;
    const start = Date.parse(r.starts_at);
    const end = r.ends_at ? Date.parse(r.ends_at) : start + DEFAULT_EVENT_MINUTES * 60_000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= from) continue;
    out.push({ id: r.id, title: r.title, start, end: Math.max(end, start + 60_000) });
  }
  return out;
}

type ThingBits = { name: string; address: string | null };

async function thingBits(db: SupabaseClient, thingId: string | null): Promise<ThingBits | null> {
  if (!thingId) return null;
  const { data } = await db.from("pm_things").select("name, address").eq("id", thingId).maybeSingle();
  return (data as ThingBits | null) ?? null;
}

/**
 * The accepted plan as a Family appointment. Returns the family_entries id.
 * The caller stores it on pm_plans.calendar_entry_id. Throws when the
 * family side refused (the plan stays accepted; the write is retried by hand
 * or the next accept).
 */
export async function writePlanToCalendar(db: SupabaseClient, ctx: FamilyCtx, plan: PmPlan, legs: readonly PmPlanLeg[], names: Record<string, string> = {}): Promise<string> {
  const thing = await thingBits(db, plan.thing_id);
  const words = allLegsInWords(legs, names);
  const body = [words || null, plan.notes || null].filter(Boolean).join("\n\n") || null;
  const r = await createRow(
    "entries",
    { kind: "appointment", title: plan.title.slice(0, 200), starts_at: plan.starts_at, ends_at: plan.ends_at, place: thing ? (thing.address ?? thing.name).slice(0, 200) : null, body },
    ctx,
    { source: "phirstmaxx" },
  );
  if (!r.ok) throw new Error(`Family calendar refused the plan: ${r.error}`);
  return (r.value as { id: string }).id;
}

/** Take the plan's appointment off the Family calendar; quiet when there is none or it has already gone. */
export async function removePlanFromCalendar(db: SupabaseClient, ctx: FamilyCtx, plan: PmPlan): Promise<boolean> {
  if (!plan.calendar_entry_id) return false;
  const r = await deleteRow("entries", plan.calendar_entry_id, ctx);
  if (!r.ok && r.status !== 404) throw new Error(`Family calendar refused the removal: ${r.error}`);
  return r.ok;
}

/** "Did Hackfall Woods" on the family timeline, on the plan's day, asking for a photo. Returns the entry id. */
export async function seedTimelineNote(db: SupabaseClient, ctx: FamilyCtx, plan: PmPlan, note?: string | null): Promise<string> {
  const thing = await thingBits(db, plan.thing_id);
  const what = thing?.name ?? plan.title;
  const r = await createRow(
    "entries",
    {
      kind: "note",
      title: `Did ${what}`.slice(0, 200),
      body: (note ?? "").trim() || null,
      happened_on: londonDate(Date.parse(plan.starts_at)),
      place: thing ? (thing.address ?? thing.name).slice(0, 200) : null,
      prompt: "Add a photo from the day?",
    },
    ctx,
    { source: "phirstmaxx" },
  );
  if (!r.ok) throw new Error(`Family timeline refused the note: ${r.error}`);
  return (r.value as { id: string }).id;
}
