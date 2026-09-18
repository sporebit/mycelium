import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid, readJson, ticketWriteGate } from "@/lib/tickets/server";

export const runtime = "nodejs";

const SELECT = "id, name, kind, colour, sort_order, archived_at, created_at";

/** GET /api/areas — the caller's areas (0116 + kind from 0121), archived hidden unless ?all=1. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createUserClient();
    let q = supabase.from("areas").select(SELECT).order("sort_order").order("name");
    if (req.nextUrl.searchParams.get("all") !== "1") q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ areas: data ?? [] });
  } catch (err) {
    console.error("[/api/areas GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}

/** POST { name, kind?: technical|life, colour? } — owners/admins only in a team space (RLS decides). */
export async function POST(req: NextRequest) {
  const uid = await principalUid();
  const body = await readJson<{ name?: string; kind?: string; colour?: string | null }>(req);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const kind = body?.kind === "technical" ? "technical" : "life";
  try {
    const supabase = await createUserClient();
    const limited = await ticketWriteGate(supabase, uid);
    if (limited) return limited;
    const { data, error } = await supabase
      .from("areas")
      .insert({ name, kind, colour: typeof body?.colour === "string" ? body.colour : null })
      .select(SELECT)
      .single();
    if (error || !data) throw error ?? new Error("insert failed");
    return NextResponse.json({ area: data }, { status: 201 });
  } catch (err) {
    console.error("[/api/areas POST]", err);
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
