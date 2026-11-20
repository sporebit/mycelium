import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { NUDGE_PRESETS } from "@/lib/nudges/nudge";
import { createUserClient } from "@/lib/supabase/user";
import { canNudge, openNudges, sendNudge } from "@/lib/system/nudges";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ ok: false, status: "error", error }, { status });

/**
 * GET /api/nudges — the nudges waiting for the signed-in person (the ones
 * sent TO them), newest first, and the wordings on offer for sending one.
 */
export async function GET(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);
  try {
    const db = await createUserClient();
    // ?ticket=<id>: may the caller nudge this one? (For the button on an item's page.)
    const ticket = req.nextUrl.searchParams.get("ticket");
    if (ticket) {
      const presets = NUDGE_PRESETS.map((p) => ({ key: p.key, label: p.label }));
      if (!/^[0-9a-f-]{36}$/i.test(ticket)) return NextResponse.json({ ok: true, status: "ok", can_nudge: false, presets });
      const can = await canNudge(db, uid, ticket);
      return NextResponse.json({ ok: true, status: "ok", can_nudge: can.can, ...(can.to ? { to: can.to } : {}), presets });
    }
    return NextResponse.json({ ok: true, status: "ok", open: await openNudges(db), presets: NUDGE_PRESETS.map((p) => ({ key: p.key, label: p.label })) });
  } catch (err) {
    console.error("[nudges GET]", err);
    return fail("Could not load nudges", 500);
  }
}

/**
 * POST /api/nudges { ticket_id, preset } — nudge whoever an item is for.
 * Allowed for any item the caller can see that is not their own (master
 * run §7). No limit, and it is outside the other person's interruption
 * budget: a person reaching for you is not the app nagging.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);
  const body = (await req.json().catch(() => ({}))) as { ticket_id?: unknown; preset?: unknown };
  const ticketId = typeof body.ticket_id === "string" && /^[0-9a-f-]{36}$/i.test(body.ticket_id) ? body.ticket_id : null;
  if (!ticketId) return fail("ticket_id required", 400);
  try {
    const db = await createUserClient();
    const res = await sendNudge(db, uid, ticketId, body.preset);
    if (!res.ok) return fail(res.error, res.status);
    return NextResponse.json({ ok: true, status: "sent" }, { status: 201 });
  } catch (err) {
    console.error("[nudges POST]", err);
    return fail("That did not send.", 500);
  }
}
