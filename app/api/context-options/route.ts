import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import {
  CONTEXT_FIELDS,
  type ContextField,
  type ContextOption,
} from "@/lib/types/context";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const field = url.searchParams.get("field");

  try {
    const supabase = await createUserClient();
    let q = supabase
      .from("context_options")
      .select("id, field, value, label, icon, use_count, created_at")
      .order("use_count", { ascending: false })
      .order("label", { ascending: true });
    if (field && CONTEXT_FIELDS.includes(field as ContextField)) {
      q = q.eq("field", field);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ options: (data ?? []) as ContextOption[] });
  } catch (err) {
    console.error("[/api/context-options GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { field?: string; value?: string; label?: string; icon?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const field = body.field;
  const value = body.value?.trim();
  const label = body.label?.trim();
  if (
    !field ||
    !CONTEXT_FIELDS.includes(field as ContextField) ||
    !value ||
    !label
  ) {
    return NextResponse.json(
      { error: "field, value, label required" },
      { status: 400 },
    );
  }
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("context_options")
      .upsert(
        { field,
          value,
          label,
          icon: body.icon ?? null,
        },
        { onConflict: "space_id,field,value" },
      )
      .select("id, field, value, label, icon, use_count, created_at")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ option: data });
  } catch (err) {
    console.error("[/api/context-options POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
