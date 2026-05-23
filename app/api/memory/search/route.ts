import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getQueryEmbedding } from "@/lib/memory/embedCache";
import { searchChunks, enrichSources, buildMatches } from "@/lib/memory/search";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }

  let body: { query?: unknown; limit?: unknown; threshold?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }
  const limit =
    typeof body.limit === "number" && body.limit > 0 && body.limit <= 50
      ? Math.floor(body.limit)
      : 20;
  const threshold =
    typeof body.threshold === "number" &&
    body.threshold >= 0 &&
    body.threshold < 1
      ? body.threshold
      : 0.3;

  try {
    const embedding = await getQueryEmbedding(query);
    const supabase = createServerClient();
    const chunks = await searchChunks(supabase, uid, embedding, limit, threshold);
    const enrichedMap = await enrichSources(supabase, chunks);
    const matches = buildMatches(chunks, enrichedMap);
    return NextResponse.json({
      matches,
      query_embedding_dims: embedding.length,
    });
  } catch (err) {
    console.error("[/api/memory/search]", err);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
