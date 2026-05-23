import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Entity } from "@/lib/types/task";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

const SEARCH_LIMIT = 20;

export async function GET(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  try {
    const supabase = createServerClient();
    let query = supabase
      .from("entities")
      .select("id, user_id, name, kind")
      .eq("user_id", uid)
      .order("name", { ascending: true })
      .limit(SEARCH_LIMIT);

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ entities: (data ?? []) as Entity[] });
  } catch (err) {
    console.error("[/api/entities GET]", err);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = userId();
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: { name?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as { name?: unknown; kind?: unknown };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const kind = typeof body.kind === "string" && body.kind.trim() ? body.kind.trim() : "person";

  try {
    const supabase = createServerClient();
    // Reuse existing entity if name matches (case-insensitive)
    const existing = await supabase
      .from("entities")
      .select("id, user_id, name, kind")
      .eq("user_id", uid)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing.data) {
      return NextResponse.json({ entity: existing.data as Entity });
    }

    const { data, error } = await supabase
      .from("entities")
      .insert({ user_id: uid, name, kind })
      .select("id, user_id, name, kind")
      .single();
    if (error || !data) throw error ?? new Error("insert returned no row");
    return NextResponse.json({ entity: data as Entity });
  } catch (err) {
    console.error("[/api/entities POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
