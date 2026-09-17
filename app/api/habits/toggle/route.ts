import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { doneOn, setDone } from "@/lib/habits/store";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";
import { localDateKey } from "@/lib/util/date";

export const runtime = "nodejs";

/**
 * POST /api/habits/toggle  { id, done?: boolean, date?: "YYYY-MM-DD" }
 * One-tap habit tile (Flag 5). Omitting `done` flips the current state.
 * Writes a ticket_completions row and mirrors the daily-log JSON.
 */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  const body = await readJson<{ id?: string; done?: boolean; date?: string }>(req);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : localDateKey();
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    let done = body.done;
    if (typeof done !== "boolean") {
      const current = await doneOn(supabase, date);
      done = !current.includes(body.id);
    }
    const ids = await setDone(supabase, body.id, date, done, uid);
    return NextResponse.json({ date, done: ids });
  } catch (err) {
    console.error("[/api/habits/toggle POST]", err);
    const msg = err instanceof Error ? err.message : "toggle failed";
    return NextResponse.json({ error: msg }, { status: msg === "unknown habit" ? 404 : 500 });
  }
}
