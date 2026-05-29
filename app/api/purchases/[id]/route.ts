import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  PURCHASE_URGENCIES,
  PURCHASE_WANT_OR_NEED,
  type Purchase,
} from "@/lib/types/purchase";

export const runtime = "nodejs";

const PURCHASE_SELECT =
  "id, user_id, title, amount, currency, want_or_need, urgency, completed_at, raw_capture_id, created_at, updated_at";

const ALLOWED_FIELDS = new Set([
  "title",
  "amount",
  "currency",
  "want_or_need",
  "urgency",
  "completed_at",
]);

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
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
    if (k === "urgency") {
      if (v === null) continue;
      if (
        typeof v !== "string" ||
        !PURCHASE_URGENCIES.includes(v as (typeof PURCHASE_URGENCIES)[number])
      ) {
        continue;
      }
    }
    if (k === "want_or_need") {
      if (v === null) {
        update.want_or_need = null;
        continue;
      }
      if (
        typeof v !== "string" ||
        !PURCHASE_WANT_OR_NEED.includes(
          v as (typeof PURCHASE_WANT_OR_NEED)[number],
        )
      ) {
        continue;
      }
    }
    if (k === "title" && typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) continue;
      update.title = trimmed;
      continue;
    }
    if (k === "currency" && typeof v === "string") {
      update.currency = v.trim().toUpperCase() || "GBP";
      continue;
    }
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("purchases")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(PURCHASE_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ purchase: data as Purchase });
  } catch (err) {
    console.error("[/api/purchases/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("purchases")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/purchases/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
