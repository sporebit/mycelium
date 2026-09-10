import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const monthsBack = body.monthsBack ?? 6;

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("spend_by_month", {
    p_months_back: monthsBack,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
