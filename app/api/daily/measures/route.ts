import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { PRINCIPAL_USER_HEADER } from "@/lib/auth/gate";
import { createUserClient } from "@/lib/supabase/user";
import { measuresHistory } from "@/lib/daily/closeoutServer";
import { measureRows } from "@/lib/daily/measures";

export const runtime = "nodejs";

/**
 * GET /api/daily/measures — every month measured so far (research §6),
 * newest first, each as the table the close-out shows: this month beside
 * the one before. Kept off the home screen; this is the one place to look.
 */
export async function GET() {
  const uid = (await headers()).get(PRINCIPAL_USER_HEADER);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const months = await measuresHistory(await createUserClient(), uid);
    return NextResponse.json({ months: months.map((m, i) => ({ month: m.month, measures: m, rows: measureRows(m, months[i + 1] ?? null) })) });
  } catch (err) {
    console.error("[daily/measures GET]", err);
    return NextResponse.json({ error: "Could not load the measures" }, { status: 500 });
  }
}
