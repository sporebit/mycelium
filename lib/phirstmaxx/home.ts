/**
 * PhirstMaxx Home (claude/phirstmaxx-spec.md §8): the next together-window,
 * what is on this week, proposals waiting for the caller, the newest
 * researched drops, and the research status line. One read per screen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineWindow } from "./engine/windows";
import { windowsFor } from "./fitting";
import { listPlans, type PlanFull } from "./plans";
import { researchStatus } from "./research/pipeline";
import type { PmCtx } from "./server";
import { listDrops, type DropWithThing } from "./things";

export type PlanView = PlanFull;
export type ResearchStatus = Awaited<ReturnType<typeof researchStatus>>;
export type HomeData = {
  me: string;
  people: Array<{ id: string; name: string; colour: string }>;
  next_window: EngineWindow | null;
  windows_this_week: number;
  on_this_week: PlanView[];
  waiting_for_me: PlanView[];
  drops: DropWithThing[];
  research: ResearchStatus | null;
};

export async function homeData(db: SupabaseClient, ctx: PmCtx, now: Date = new Date()): Promise<HomeData> {
  const t = now.getTime();
  const weekEnd = new Date(t + 7 * 86_400_000).toISOString();
  const [windows, plans, drops, research]: [EngineWindow[], PlanView[], DropWithThing[], ResearchStatus | null] = await Promise.all([
    windowsFor(db, ctx.spaceId, { start: t, end: t + 14 * 86_400_000 }).catch((e: unknown) => {
      console.error("[phirstmaxx] windows:", e);
      return [] as EngineWindow[];
    }),
    listPlans(db, ctx.spaceId, { status: ["proposed", "accepted"], from: new Date(t - 86_400_000).toISOString() }),
    listDrops(db, ctx, 8),
    researchStatus(db, ctx.spaceId).catch((e: unknown) => {
      console.error("[phirstmaxx] research status:", e);
      return null;
    }),
  ]);
  const live = windows.filter((w) => w.end > t);
  const firm = live.find((w) => w.firmness === "firm") ?? live[0] ?? null;
  const all = plans;
  return {
    me: ctx.uid,
    people: ctx.people.map((p) => ({ id: p.id, name: p.name, colour: p.colour })),
    next_window: firm,
    windows_this_week: live.filter((w) => w.firmness === "firm" && w.start < Date.parse(weekEnd)).length,
    on_this_week: all.filter((p) => p.status === "accepted" && p.starts_at < weekEnd && p.ends_at > now.toISOString()),
    // a proposal waits for me until I have answered it, whoever made it
    waiting_for_me: all.filter((p) => p.status === "proposed" && !p.responses.some((r) => r.person_id === ctx.uid)),
    drops,
    research,
  };
}
