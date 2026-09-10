import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ aliases: [] });

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("exercise_aliases")
    .select("id, canonical_name, alias, created_at")
    .ilike("canonical_name", name)
    .order("alias", { ascending: true });

  if (error) {
    console.error("[/api/fitness/exercise-aliases GET]", error);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
  return NextResponse.json({ aliases: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const canonical = (body.canonical_name as string)?.trim();
  const alias = (body.alias as string)?.trim();
  if (!canonical || !alias) {
    return NextResponse.json({ error: "canonical_name and alias required" }, { status: 400 });
  }

  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("exercise_aliases")
    .insert({ canonical_name: canonical, alias })
    .select("id, canonical_name, alias, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "alias already exists" }, { status: 409 });
    }
    console.error("[/api/fitness/exercise-aliases POST]", error);
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }
  return NextResponse.json({ alias: data }, { status: 201 });
}
