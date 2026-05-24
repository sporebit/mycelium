import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { JOURNAL_SELECT, type JournalEntry } from "@/lib/journal/types";

export const runtime = "nodejs";

const ALLOWED_FIELDS = new Set(["raw_text", "tags", "mood", "summary"]);

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("journal_entries")
      .select(JOURNAL_SELECT)
      .eq("user_id", uid)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ entry: data as JournalEntry });
  } catch (err) {
    console.error("[/api/journal/:id GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = process.env.USER_ID;
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
    update[k] = v;
  }
  update.updated_at = new Date().toISOString();

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("journal_entries")
      .update(update)
      .eq("id", id)
      .eq("user_id", uid)
      .select(JOURNAL_SELECT)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ entry: data as JournalEntry });
  } catch (err) {
    console.error("[/api/journal/:id PATCH]", err);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("journal_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/journal/:id DELETE]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
