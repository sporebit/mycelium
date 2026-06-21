import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");

    const supabase = createServerClient();
    let query = supabase
      .from("spotify_plays")
      .select("*")
      .order("played_at", { ascending: false });

    if (from) query = query.gte("played_at", `${from}T00:00:00Z`);
    if (to) query = query.lte("played_at", `${to}T23:59:59Z`);

    const { data, error } = await query.limit(1000);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ plays: data });
  } catch (err) {
    console.error("[spotify/plays GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
