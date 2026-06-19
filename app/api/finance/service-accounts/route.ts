import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATUSES = ["active", "cancelled", "paused", "trial"];
const PERIODS = ["monthly", "annual", "one_off"];
const CATEGORIES = [
  "Entertainment",
  "Productivity",
  "Infrastructure",
  "Finance",
  "Health",
  "Shopping",
  "Other",
];

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("status", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ accounts: data ?? [] });
  } catch (err) {
    console.error("[/api/finance/service-accounts GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreateBody = {
  name?: string;
  email?: string | null;
  url?: string | null;
  category?: string;
  status?: string;
  cost_amount?: number | null;
  cost_currency?: string;
  cost_period?: string | null;
  renewal_date?: string | null;
  payment_method?: string | null;
  opened_date?: string | null;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const status = body.status && STATUSES.includes(body.status) ? body.status : "active";
  const category = body.category && CATEGORIES.includes(body.category) ? body.category : "Other";
  const cost_period = body.cost_period && PERIODS.includes(body.cost_period) ? body.cost_period : null;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        name,
        email: body.email?.trim() || null,
        url: body.url?.trim() || null,
        category,
        status,
        cost_amount: typeof body.cost_amount === "number" ? body.cost_amount : null,
        cost_currency: body.cost_currency?.trim() || "GBP",
        cost_period,
        renewal_date: body.renewal_date || null,
        payment_method: body.payment_method?.trim() || null,
        opened_date: body.opened_date || null,
        notes: body.notes?.trim() || null,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    return NextResponse.json({ account: data });
  } catch (err) {
    console.error("[/api/finance/service-accounts POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
