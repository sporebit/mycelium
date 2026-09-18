import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { findSimilar } from "@/lib/quotes/server";

export const runtime = "nodejs";

/** GET /api/quotes/similar?text=&exclude= — near-duplicates (> 0.6 trigram similarity) for the review card. */
export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") ?? "").trim();
  const exclude = req.nextUrl.searchParams.get("exclude");
  if (!text) return NextResponse.json({ similar: [] });
  try {
    const supabase = await createUserClient();
    const similar = await findSimilar(supabase, text, exclude);
    return NextResponse.json({ similar });
  } catch (err) {
    console.error("[/api/quotes/similar GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
