import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson } from "@/lib/tickets/server";
import { isMark, recurringView, setMark } from "@/lib/finance/billsServer";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET /api/finance/recurring — bills and subscriptions found in the
 * imported transactions: how often, how much, when next, whether the price
 * has risen, and what the person has said about each. Worked out afresh
 * each time; nothing is stored but the marks.
 */
export async function GET() {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  try {
    return NextResponse.json(await recurringView(await createUserClient()));
  } catch (err) {
    console.error("[/api/finance/recurring GET]", err);
    return bad("fetch failed", 500);
  }
}

/** POST { key, mark: "keep" | "cancel" | "not_recurring" | null, note? } — say something about one, or take it back. */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  if (!uid) return bad("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return bad("bad json");
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (key.length < 3 || key.length > 80) return bad("key is the payment's key.");
  if (body.mark !== null && !isMark(body.mark)) return bad("mark is keep, cancel, not_recurring or null.");
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  try {
    await setMark(await createUserClient(), key, body.mark, note);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finance/recurring POST]", err);
    return bad("That did not save.", 500);
  }
}
