import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { ensurePlan } from "@/lib/daily/server";
import { dailySettings } from "@/lib/daily/settings";
import { viewOf } from "@/lib/daily/view";
import { LABELS, nextUp } from "@/lib/daily/words";

export const runtime = "nodejs";

/**
 * GET /api/daily/say — the focus card as one line, for an iPhone automation
 * to show: "Next up: boiler quote. First step: find the email. About 5 min."
 * Used by the pause before a scroll app opens (research rule 31): the line,
 * then Close app / Continue. No lecture, only what is next.
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ ok: false, status: "error", error: "Unauthorized" }, { status: 401 });
  try {
    const db = await createUserClient();
    const settings = await dailySettings(db);
    const view = await viewOf(db, await ensurePlan(db, uid, undefined, { freeMinutes: settings.free_minutes }));
    const card = view.current;
    const say = card ? nextUp({ title: card.title, firstStep: card.first_step, minutes: card.minutes }) : view.won ? LABELS.dayWon : LABELS.nothingToday;
    return NextResponse.json({ ok: true, status: "ok", say, won: view.won, left: view.counts.left });
  } catch (err) {
    console.error("[daily/say GET]", err);
    return NextResponse.json({ ok: false, status: "error", error: "Could not load today" }, { status: 500 });
  }
}
