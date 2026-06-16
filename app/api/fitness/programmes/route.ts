import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Programme } from "@/lib/fitness/types";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("include_archived") === "true";
  try {
    const supabase = createServerClient();
    let q = supabase
      .from("workout_programmes")
      .select("id, user_id, name, description, created_at, updated_at, archived_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (!includeArchived) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ programmes: (data ?? []) as Programme[] });
  } catch (err) {
    console.error("[/api/fitness/programmes GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: { name?: string; description?: string };
  try {
    body = (await req.json()) as { name?: string; description?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workout_programmes")
      .insert({ user_id: uid, name, description: body.description ?? null })
      .select("id, user_id, name, description, created_at, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ programme: data as Programme });
  } catch (err) {
    console.error("[/api/fitness/programmes POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
