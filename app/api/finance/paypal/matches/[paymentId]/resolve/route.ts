import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { resolvePayment } from "@/lib/finance/paypal-match";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await ctx.params;

  let body: { transaction_id?: string };
  try {
    body = (await req.json()) as { transaction_id?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.transaction_id) {
    return NextResponse.json({ error: "transaction_id required" }, { status: 400 });
  }

  try {
    const supabase = await createUserClient();
    const { ok, error } = await resolvePayment(supabase, paymentId, body.transaction_id);
    if (!ok) {
      return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finance/paypal/matches/:id/resolve POST]", err);
    return NextResponse.json({ error: "resolve failed" }, { status: 500 });
  }
}
