import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { sendMorningPrompt } from "@/lib/daily/prompts";

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
  if (!uid) return NextResponse.json({ ok: false, status: "error", error: "Unauthorized" }, { status: 401 });
  try {
    const db = await createUserClient();
    const res = await sendMorningPrompt(db, uid, { push: false });
    return NextResponse.json({ ok: true, status: "ok", prompted: res.prompted, say: res.say, today: res.today });
  } catch (err) {
    console.error("[daily/morning POST]", err);
    return NextResponse.json({ ok: false, status: "error", error: "Could not prepare today" }, { status: 500 });
  }
}
