import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  const url = new URL(req.url);
  const view = url.searchParams.get("view");

  try {
    const supabase = createServerClient();

    if (view === "history") {
      const { data, error } = await supabase
        .from("pc_components")
        .select("*")
        .eq("user_id", uid)
        .not("date_removed", "is", null)
        .order("date_removed", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ components: data ?? [] });
    }

    // Default: current build (date_removed is null)
    const { data, error } = await supabase
      .from("pc_components")
      .select("*")
      .eq("user_id", uid)
      .is("date_removed", null)
      .order("category")
      .order("name");
    if (error) throw error;
    return NextResponse.json({ components: data ?? [] });
  } catch (err) {
    console.error("[/api/pc-build GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

type CreatePayload = {
  category: string;
  name: string;
  brand?: string | null;
  specs?: string | null;
  purchase_date?: string | null;
  price_paid?: number | null;
  currency?: string;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid)
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });

  let body: CreatePayload;
  try {
    body = (await req.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!body.category?.trim() || !body.name?.trim()) {
    return NextResponse.json(
      { error: "category + name required" },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("pc_components")
      .insert({
        user_id: uid,
        category: body.category.trim(),
        name: body.name.trim(),
        brand: body.brand?.trim() || null,
        specs: body.specs?.trim() || null,
        purchase_date: body.purchase_date || null,
        price_paid: body.price_paid ?? null,
        currency: body.currency?.trim() || "GBP",
        notes: body.notes?.trim() || null,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ component: data });
  } catch (err) {
    console.error("[/api/pc-build POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
