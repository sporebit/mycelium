import { NextRequest, NextResponse } from "next/server";
import { actOnItem, ensurePlan, type ItemAction } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { viewOf } from "@/lib/daily/view";
import { markActed } from "@/lib/nudges/interrupt";
import { unauthorised, wallDevice, wallPerson } from "@/lib/system/wallRequest";
import { withUser } from "@/lib/system/withUser";

export const runtime = "nodejs";

/** The taps a wall offers: finish, start, not today. The rest stay on the phone and the desk. */
const ACTIONS = new Set(["done", "start", "not_now"]);

/** POST /api/wall/person/items/[id] { action } — one tap on one of the unlocked person's items, as them. Answers the Today view. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const device = await wallDevice();
  if (!device) return unauthorised("wall_unpaired");
  const person = await wallPerson(device);
  if (!person) return unauthorised("locked");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  try {
    return await withUser(person.uid, async (db) => {
      const settings = await dailySettings(db);
      const plan = await ensurePlan(db, person.uid, undefined, { freeMinutes: settings.free_minutes });
      const result = await actOnItem(db, person.uid, plan, id, { action } as unknown as ItemAction, { wipLimit: settings.wip_limit });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      const item = plan.items.find((i) => i.id === id);
      if (item) void markActed(db, person.uid, { ticketId: item.ticket_id }, action).catch(() => undefined);
      return NextResponse.json({ ...(await viewOf(db, result.plan)), ...(result.won ? { just_won: true } : {}) });
    });
  } catch (err) {
    console.error("[wall/person/items]", err);
    return NextResponse.json({ error: "That did not save. Nothing was lost; try again." }, { status: 500 });
  }
}
