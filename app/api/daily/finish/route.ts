import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { exitFinishLine, type FinishExit, finishLineFor } from "@/lib/daily/finishServer";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

const EXITS = new Set<FinishExit>(["finish", "good_enough", "drop"]);
const fail = (error: string, status: number) => NextResponse.json({ ok: false, status: "error", error }, { status });

/**
 * GET /api/daily/finish — the finish line: at most three things that are
 * 80% done or more, each with what is left and the step to take now
 * (research rule 22).
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);
  try {
    const db = await createUserClient();
    return NextResponse.json({ ok: true, status: "ok", items: await finishLineFor(db, uid) });
  } catch (err) {
    console.error("[daily/finish GET]", err);
    return fail("Could not load the finish line", 500);
  }
}

/**
 * POST /api/daily/finish { ticket_id, exit: "finish" | "good_enough" | "drop" }
 * One of the three exits, for something that is on the line now. Answers
 * the line as it stands afterwards.
 */
export async function POST(req: NextRequest) {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return fail("Unauthorized", 401);
  const body = (await req.json().catch(() => ({}))) as { ticket_id?: unknown; exit?: unknown };
  const ticketId = typeof body.ticket_id === "string" && /^[0-9a-f-]{36}$/i.test(body.ticket_id) ? body.ticket_id : null;
  const exit = typeof body.exit === "string" && EXITS.has(body.exit as FinishExit) ? (body.exit as FinishExit) : null;
  if (!ticketId || !exit) return fail("ticket_id and exit (finish, good_enough or drop) are required", 400);
  try {
    const db = await createUserClient();
    const res = await exitFinishLine(db, uid, ticketId, exit);
    if (!res.ok) return fail(res.error, res.status);
    return NextResponse.json({ ok: true, status: "ok", exit, items: res.items });
  } catch (err) {
    console.error("[daily/finish POST]", err);
    return fail("That did not save. Nothing was changed.", 500);
  }
}
