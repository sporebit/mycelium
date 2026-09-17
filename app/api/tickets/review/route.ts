import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { buildReview, sealReview } from "@/lib/tickets/review";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

/** GET /api/tickets/review — the weekly-review payload (spec §8.4). */
export async function GET() {
  try {
    const supabase = await createUserClient();
    const payload = await buildReview(supabase);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[/api/tickets/review GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST { note? } — seal this week's review (idempotent per week). */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  const body = (await readJson<{ note?: string }>(req)) ?? {};
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const payload = await buildReview(supabase);
    if (payload.sealed_at) return NextResponse.json({ ok: true, week: payload.week, sealed_at: payload.sealed_at, already: true });
    const summary = {
      inbox: payload.inbox.length,
      waiting: payload.waiting.length,
      projects_without_next: payload.projectsWithoutNext.length,
      someday: payload.someday.length,
      stale: payload.stale.length,
      done_unverified: payload.doneUnverified.length,
      week_ahead: payload.weekAhead.length,
    };
    const sealed = await sealReview(supabase, summary, typeof body.note === "string" ? body.note : undefined);
    return NextResponse.json({ ok: true, ...sealed, summary });
  } catch (err) {
    console.error("[/api/tickets/review POST]", err);
    return NextResponse.json({ error: "seal failed" }, { status: 500 });
  }
}
