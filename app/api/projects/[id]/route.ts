import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from "@/lib/types/project";
import { PROJECT_SELECT_TICKETS, projectTicketFields } from "@/lib/tickets/projects";

export const runtime = "nodejs";

const PROJECT_SELECT = PROJECT_SELECT_TICKETS;

const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "status",
  "colour",
]);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const project = data as Project;
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("project_id", id)
      .is("completed_at", null);
    project.task_count = count ?? 0;

    // Cost rollup from linked purchases. Estimated = sum of amount on
    // every linked purchase, completed or not. Actual = sum of amount
    // on completed ones only. We pick the currency of the most common
    // linked purchase so the project displays a single symbol; mixed
    // currencies fall back to GBP.
    const { data: purchaseRows } = await supabase
      .from("purchases")
      .select("amount, currency, completed_at")
      .is("deleted_at", null)
      .eq("project_id", id);
    type PurchaseAggRow = {
      amount: number | string | null;
      currency: string | null;
      completed_at: string | null;
    };
    const rows = (purchaseRows ?? []) as PurchaseAggRow[];
    let estimated = 0;
    let actual = 0;
    const currencyCounts = new Map<string, number>();
    for (const r of rows) {
      const amt =
        typeof r.amount === "number"
          ? r.amount
          : typeof r.amount === "string"
            ? Number(r.amount) || 0
            : 0;
      estimated += amt;
      if (r.completed_at) actual += amt;
      const cur = r.currency ?? "GBP";
      currencyCounts.set(cur, (currencyCounts.get(cur) ?? 0) + 1);
    }
    let costCurrency = "GBP";
    let best = -1;
    for (const [cur, n] of currencyCounts.entries()) {
      if (n > best) {
        best = n;
        costCurrency = cur;
      }
    }
    project.estimated_cost = Math.round(estimated * 100) / 100;
    project.actual_cost = Math.round(actual * 100) / 100;
    project.cost_currency = costCurrency;
    project.linked_purchase_count = rows.length;

    return NextResponse.json({ project });
  } catch (err) {
    console.error("[/api/projects/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

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

  const update: Record<string, unknown> = { ...projectTicketFields(body) };
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (
      k === "status" &&
      v !== null &&
      !PROJECT_STATUSES.includes(v as ProjectStatus)
    ) {
      continue;
    }
    if (k === "name" && typeof v === "string") {
      const trimmed = v.trim();
      if (!trimmed) continue;
      update.name = trimmed;
      continue;
    }
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("projects")
      .update(update)
      .eq("id", id)
      .select(PROJECT_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ project: data as Project });
  } catch (err) {
    console.error("[/api/projects/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "true";

  try {
    const supabase = await createUserClient();
    if (hard) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, mode: "hard" });
    }
    // Soft delete = mark archived.
    const { data, error } = await supabase
      .from("projects")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(PROJECT_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, mode: "soft", project: data as Project });
  } catch (err) {
    console.error("[/api/projects/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
