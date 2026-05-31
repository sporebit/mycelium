import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  PURCHASE_LIST_TYPES,
  PURCHASE_URGENCIES,
  PURCHASE_WANT_OR_NEED,
  type Purchase,
  type PurchaseListType,
  type PurchaseUrgency,
  type PurchaseWantOrNeed,
} from "@/lib/types/purchase";

export const runtime = "nodejs";

const PURCHASE_SELECT =
  "id, user_id, title, amount, currency, want_or_need, urgency, list_type, project_id, completed_at, raw_capture_id, created_at, updated_at, projects(name)";

type PurchaseRow = Omit<Purchase, "project_name"> & {
  projects: { name: string } | { name: string }[] | null;
};

function serialize(row: PurchaseRow): Purchase {
  const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
  const { projects: _projects, ...rest } = row;
  void _projects;
  return { ...rest, project_name: proj?.name ?? null };
}

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
  const projectParam = url.searchParams.get("project_id");
  const listTypeParam = url.searchParams.get("list_type");

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("purchases")
      .select(PURCHASE_SELECT)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (completedParam === "true") {
      q = q.not("completed_at", "is", null);
    } else if (completedParam === "false") {
      q = q.is("completed_at", null);
    }
    if (projectParam === "null") {
      q = q.is("project_id", null);
    } else if (projectParam) {
      q = q.eq("project_id", projectParam);
    }
    if (
      listTypeParam &&
      PURCHASE_LIST_TYPES.includes(listTypeParam as PurchaseListType)
    ) {
      q = q.eq("list_type", listTypeParam);
    }
    const { data, error } = await q;
    if (error) throw error;
    const purchases = ((data ?? []) as unknown as PurchaseRow[]).map(serialize);
    return NextResponse.json({ purchases });
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
  list_type?: PurchaseListType;
  project_id?: string | null;
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
      list_type:
        body.list_type && PURCHASE_LIST_TYPES.includes(body.list_type)
          ? body.list_type
          : "shopping",
      project_id:
        body.project_id !== undefined ? body.project_id : null,
    };
    const { data, error } = await supabase
      .from("purchases")
      .insert(insertPayload)
      .select(PURCHASE_SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    return NextResponse.json({
      purchase: serialize(data as unknown as PurchaseRow),
    });
  } catch (err) {
    console.error("[/api/purchases POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
