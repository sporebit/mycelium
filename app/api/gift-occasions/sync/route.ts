import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, ticketWriteGate } from "@/lib/tickets/server";
import { syncOccasions } from "@/lib/gifts/engine";

export const runtime = "nodejs";

/**
 * POST /api/gift-occasions/sync — the occasions engine for the caller, now
 * (spec §5): birthdays from People, the fixed calendar, roll-forward and
 * the date-of-birth reconcile. The same step the daily cron takes for
 * everyone; here so the page's "Refresh occasions" needs no secret and a
 * new birthday shows up without waiting for the morning.
 */
export async function POST() {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const result = await syncOccasions(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/api/gift-occasions/sync POST]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
