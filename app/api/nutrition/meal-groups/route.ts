import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { ensureMealGroups } from "@/lib/nutrition/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const groups = await ensureMealGroups(supabase);
    return NextResponse.json({ meal_groups: groups });
  } catch (err) {
    console.error("[/api/nutrition/meal-groups GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    const supabase = await createUserClient();
    // Compute next position
    const { data: existing } = await supabase
      .from("meal_groups")
      .select("position")
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((existing?.[0]?.position as number | undefined) ?? -1) + 1;
    const { data, error } = await supabase
      .from("meal_groups")
      .insert({ name, position: nextPos })
      .select("id, name, position, created_at")
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ meal_group: data });
  } catch (err) {
    console.error("[/api/nutrition/meal-groups POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
