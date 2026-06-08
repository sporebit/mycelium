import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = process.env.USER_ID ?? null;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const monthsBack = body.monthsBack ?? 6;

  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("spend_by_month", {
    p_user_id: uid,
    p_months_back: monthsBack,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
