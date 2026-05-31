import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  const kind = url.searchParams.get("kind");
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100)
  );

  try {
    const supabase = createServerClient();
    let q = supabase
      .from("raw_captures")
      .select(
        "id, source, raw_text, audio_url, classification, llm_source, routed_to, routed_id, created_at"
      )
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (source && source !== "all") q = q.eq("source", source);
    if (kind && kind !== "all") q = q.eq("classification->>kind", kind);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ captures: data ?? [] });
  } catch (err) {
    console.error("[/api/captures GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
