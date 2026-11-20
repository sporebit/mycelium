import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { goneQuiet, quietHrefs, quietQuestion } from "@/lib/dormant/features";
import { featureStatesFor } from "@/lib/dormant/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

/**
 * GET /api/dormant — which features the person has stopped using, each
 * against its own rhythm (master run §6). `quiet` is for the dashboard
 * card, biggest gap first; `hrefs` are the navigation entries to dim;
 * `question` is the one line the weekly close-out asks. Read from the rows
 * the features keep, so it is true history; opening a page never counts.
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ ok: false, status: "error", error: "Unauthorized" }, { status: 401 });
  try {
    const states = await featureStatesFor(await createUserClient());
    return NextResponse.json({ ok: true, status: "ok", quiet: goneQuiet(states), hrefs: quietHrefs(states), question: quietQuestion(states) });
  } catch (err) {
    console.error("[dormant GET]", err);
    // The marks are an aid, not a function: without them the app works as before.
    return NextResponse.json({ ok: true, status: "ok", quiet: [], hrefs: [], question: null, unavailable: true });
  }
}
