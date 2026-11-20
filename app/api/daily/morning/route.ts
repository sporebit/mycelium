import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { ensurePlan, markPrompted } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { viewOf } from "@/lib/daily/view";
import { morningPrompt, spoken } from "@/lib/daily/words";
import { interrupt } from "@/lib/nudges/interrupt";

export const runtime = "nodejs";

/**
 * POST /api/daily/morning — the morning pick (master run §6).
 *
 * Called by an iPhone automation when the alarm is stopped, so the day
 * starts from something that already happens and nothing depends on
 * remembering to open the app (research rule 1). It makes sure today has a
 * plan, sends one prompt, and starts the 45-minute clock after which an
 * untouched plan applies itself (rule 16): no decision is asked for in the
 * first half hour awake.
 *
 * Safe to call more than once: the plan is created once and the prompt is
 * sent once per day. Answers `say`, one line the Shortcut can show or speak.
 */
export async function POST() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const plan = await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes });
    const view = await viewOf(db, plan);
    const card = view.current ? { title: view.current.title, firstStep: view.current.first_step, minutes: view.current.minutes } : null;
    const words = morningPrompt(card, Math.max(0, view.counts.left - 1));

    let prompted = false;
    if (!plan.prompted_at && plan.status !== "closed") {
      await markPrompted(db, plan.id);
      const res = await interrupt(db, uid, {
        kind: "morning",
        essential: true,
        title: words.title,
        body: words.body,
        url: "/today",
        ticketId: view.current?.ticket_id ?? null,
        speak: card ? spoken(card) : null,
      });
      prompted = res.sent;
    }
    return NextResponse.json({ ok: true, prompted, say: `${words.title}. ${words.body}`, today: view });
  } catch (err) {
    console.error("[daily/morning POST]", err);
    return NextResponse.json({ error: "Could not prepare today" }, { status: 500 });
  }
}
