import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  ROUTING_RULE_SELECT,
  invalidateRoutingRulesCache,
  type RoutingRule,
} from "@/lib/router/rules";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set([
  "display_name",
  "description",
  "examples",
  "enabled",
  "priority",
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
    if (k === "display_name" || k === "description") {
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      update[k] = trimmed;
      continue;
    }
    if (k === "examples") {
      if (v === null) {
        update.examples = null;
        continue;
      }
      if (!Array.isArray(v)) continue;
      update.examples = (v as unknown[])
        .map((e) => (typeof e === "string" ? e.trim() : ""))
        .filter(Boolean);
      continue;
    }
    if (k === "enabled") {
      if (typeof v !== "boolean") continue;
      update.enabled = v;
      continue;
    }
    if (k === "priority") {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      update.priority = Math.round(v);
      continue;
    }
  }
  update.updated_at = new Date().toISOString();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("routing_rules")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(ROUTING_RULE_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    invalidateRoutingRulesCache(uid);
    return NextResponse.json({ rule: data as RoutingRule });
  } catch (err) {
    console.error("[/api/routing-rules/:id PATCH]", err);
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
      .from("routing_rules")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    invalidateRoutingRulesCache(uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/routing-rules/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
