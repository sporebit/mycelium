import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { closeDay, type CloseDecision, ensurePlan, FINISHED_STATES, summarise } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { cardOf, viewOf } from "@/lib/daily/view";
import { eveningPrompt } from "@/lib/daily/words";
import { interrupt, markActed } from "@/lib/nudges/interrupt";

export const runtime = "nodejs";

const DECISIONS = new Set(["done", "good_enough", "tomorrow", "drop", "keep"]);
/** The evening close holds ten cards at most (research rule 18). */
const MAX_CLOSE_CARDS = 10;

/**
 * GET /api/daily/close — what the evening close shows, in order: what got
 * done first, then the items still open (done / tomorrow / drop), then any
 * ticket whose date slipped a week ago. Capture review cards and
 * low-confidence finance cards are added to the same deck by their own
 * features; the deck as a whole stays within MAX_CLOSE_CARDS.
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    const view = await viewOf(db, plan);
    const finished = plan.items.filter((i) => FINISHED_STATES.includes(i.state)).map(cardOf);
    const open = plan.items.filter((i) => i.state === "planned" || i.state === "started").map(cardOf);
    return NextResponse.json({
      day: plan.day,
      status: plan.status,
      won: view.won,
      finished,
      open: open.slice(0, MAX_CLOSE_CARDS),
      slipped: view.slipped.slice(0, Math.max(0, MAX_CLOSE_CARDS - open.length)),
      summary: plan.status === "closed" ? plan.summary : summarise(plan),
    });
  } catch (err) {
    console.error("[daily/close GET]", err);
    return NextResponse.json({ error: "Could not load the close" }, { status: 500 });
  }
}

/**
 * POST /api/daily/close
 *   { action: "prompt" }                       the phone was plugged in: offer the close (one prompt per day)
 *   { decisions?: [{ item_id, decision }] }    close the day; anything undecided moves to tomorrow
 * "Close the day" always works, with or without decisions.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; decisions?: unknown };
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });

    if (body.action === "prompt") {
      if (plan.status === "closed") return NextResponse.json({ ok: true, prompted: false, say: "Day closed." });
      const s = summarise(plan);
      const left = plan.items.filter((i) => i.state === "planned" || i.state === "started").length;
      const words = eveningPrompt(s.done, left);
      const res = await interrupt(db, uid, { kind: "evening", essential: true, title: words.title, body: words.body, url: "/close" });
      return NextResponse.json({ ok: true, prompted: res.sent, say: `${words.title}. ${words.body}` });
    }

    const decisions: CloseDecision[] = Array.isArray(body.decisions)
      ? (body.decisions as Array<Record<string, unknown>>)
          .filter((d) => typeof d?.item_id === "string" && typeof d?.decision === "string" && DECISIONS.has(d.decision as string))
          .map((d) => ({ item_id: d.item_id as string, decision: d.decision as CloseDecision["decision"] }))
      : [];
    const closed = await closeDay(db, uid, plan, decisions);
    void markActed(db, uid, { kind: "evening" }, "closed").catch(() => undefined);
    return NextResponse.json({ ok: true, day: closed.day, status: closed.status, summary: closed.summary });
  } catch (err) {
    console.error("[daily/close POST]", err);
    return NextResponse.json({ error: "The day did not close. Nothing was lost; try again." }, { status: 500 });
  }
}
