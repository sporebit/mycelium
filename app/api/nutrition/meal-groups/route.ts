import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { ensureMealGroups } from "@/lib/nutrition/db";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function GET() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const groups = await ensureMealGroups(supabase, uid);
    return NextResponse.json({ meal_groups: groups });
  } catch (err) {
    console.error("[/api/nutrition/meal-groups GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const supabase = createServerClient();
    // Compute next position
    const { data: existing } = await supabase
      .from("meal_groups")
      .select("position")
      .eq("user_id", uid)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;
    const { data, error } = await supabase
      .from("meal_groups")
      .insert({ user_id: uid, name, position: nextPos })
      .select("id, user_id, name, position, created_at")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ meal_group: data });
  } catch (err) {
    console.error("[/api/nutrition/meal-groups POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
