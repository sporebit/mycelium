import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { actOnItem, ensurePlan, type ItemAction } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { viewOf } from "@/lib/daily/view";
import { markActed } from "@/lib/nudges/interrupt";

export const runtime = "nodejs";

const ACTIONS = new Set(["start", "more_time", "done", "good_enough", "park", "not_now", "drop", "move", "swap", "first_step"]);

/**
 * POST /api/daily/items/[id] — one tap on one item of today's plan.
 *
 * { action: "start", minutes?, force? }   Start and a countdown; past the in-progress limit it answers 409 with the
 *                                         things in progress so one can be parked first (force: true skips the limit)
 * { action: "more_time", minutes? }       10 more minutes
 * { action: "done" } | { action: "good_enough", note? }
 * { action: "park", note? }               back to Next, with a "where I left off" note
 * { action: "not_now" }                   off today's card, no reason asked
 * { action: "move", to? }                 to tomorrow, or a date
 * { action: "drop" }
 * { action: "swap", with_ticket_id }      one of the two alternatives offered
 * { action: "first_step", text }
 *
 * Answers the whole Today view, so the card can redraw from one reply
 * inside the 300 ms the research asks for (rule 24).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  if (action === "swap" && typeof body.with_ticket_id !== "string") return NextResponse.json({ error: "with_ticket_id is required" }, { status: 400 });
  if (action === "first_step" && typeof body.text !== "string") return NextResponse.json({ error: "text is required" }, { status: 400 });

  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    const input = {
      action,
      minutes: typeof body.minutes === "number" ? body.minutes : undefined,
      force: body.force === true,
      note: typeof body.note === "string" ? body.note : undefined,
      to: typeof body.to === "string" ? body.to : undefined,
      with_ticket_id: typeof body.with_ticket_id === "string" ? body.with_ticket_id : "",
      text: typeof body.text === "string" ? body.text : "",
    } as unknown as ItemAction;
    const result = await actOnItem(db, uid, plan, id, input, { wipLimit: settings.wip_limit });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...(result.wip ? { wip: result.wip } : {}) }, { status: result.status });
    }
    // Acting on the item answers whatever nudge was sent about it.
    const item = plan.items.find((i) => i.id === id);
    if (item) void markActed(db, uid, { ticketId: item.ticket_id }, action).catch(() => undefined);
    return NextResponse.json({ ...(await viewOf(db, result.plan)), ...(result.won ? { just_won: true } : {}) });
  } catch (err) {
    console.error("[daily/items POST]", err);
    return NextResponse.json({ error: "That did not save. Nothing was lost; try again." }, { status: 500 });
  }
}
