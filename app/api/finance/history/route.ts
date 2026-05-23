import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSnapshotHistory } from "@/lib/finance/persistSnapshot";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_SHEETS_FINANCE_ID) {
    return NextResponse.json(
      { error: "Finance not configured" },
      { status: 503 }
    );
  }
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  const months = Math.min(
    60,
    Math.max(
      1,
      parseInt(new URL(req.url).searchParams.get("months") ?? "24", 10) || 24
    )
  );

  try {
    const supabase = createServerClient();
    const history = await getSnapshotHistory(supabase, uid, months);
    return NextResponse.json({ history });
  } catch (err) {
    console.error("[/api/finance/history GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
