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

const ALLOWED_FIELDS = new Set([
  "name",
  "email",
  "url",
  "category",
  "status",
  "cost_amount",
  "cost_currency",
  "cost_period",
  "renewal_date",
  "payment_method",
  "opened_date",
  "notes",
]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k === "status" && !STATUSES.includes(v as string)) continue;
    if (k === "category" && !CATEGORIES.includes(v as string)) continue;
    if (k === "cost_period" && v !== null && !PERIODS.includes(v as string)) continue;
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("accounts")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
    }
    return NextResponse.json({ account: data });
  } catch (err) {
    console.error("[/api/finance/service-accounts/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/finance/service-accounts/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
