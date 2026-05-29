import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  PURCHASE_URGENCIES,
  PURCHASE_WANT_OR_NEED,
  type Purchase,
  type PurchaseUrgency,
  type PurchaseWantOrNeed,
} from "@/lib/types/purchase";

export const runtime = "nodejs";

const PURCHASE_SELECT =
  "id, user_id, title, amount, currency, want_or_need, urgency, completed_at, raw_capture_id, created_at, updated_at";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const completedParam = url.searchParams.get("completed");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("purchases")
      .select(PURCHASE_SELECT)
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (completedParam === "true") {
      q = q.not("completed_at", "is", null);
    } else if (completedParam === "false") {
      q = q.is("completed_at", null);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ purchases: (data ?? []) as Purchase[] });
  } catch (err) {
    console.error("[/api/purchases GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  title?: string;
  amount?: number | null;
  currency?: string;
  want_or_need?: PurchaseWantOrNeed | null;
  urgency?: PurchaseUrgency;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const insertPayload = {
      user_id: uid,
      title,
      amount: typeof body.amount === "number" ? body.amount : null,
      currency:
        typeof body.currency === "string" && body.currency.trim()
          ? body.currency.trim().toUpperCase()
          : "GBP",
      want_or_need:
        body.want_or_need &&
        PURCHASE_WANT_OR_NEED.includes(body.want_or_need)
          ? body.want_or_need
          : null,
      urgency:
        body.urgency && PURCHASE_URGENCIES.includes(body.urgency)
          ? body.urgency
          : "someday",
    };
    const { data, error } = await supabase
      .from("purchases")
      .insert(insertPayload)
      .select(PURCHASE_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    return NextResponse.json({ purchase: data as Purchase });
  } catch (err) {
    console.error("[/api/purchases POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
