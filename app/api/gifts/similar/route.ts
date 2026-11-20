import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { findSimilarGifts, isUuid } from "@/lib/gifts/server";

export const runtime = "nodejs";

/** GET /api/gifts/similar?title=&person=<id>&label=&exclude=<id> — near-duplicates for the same recipient (spec §4.7), for the review card and the add form. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const title = (sp.get("title") ?? "").trim();
  if (!title) return NextResponse.json({ similar: [] });
  const person = sp.get("person");
  const label = sp.get("label");
  const exclude = sp.get("exclude");
  try {
    const supabase = await createUserClient();
    const similar = await findSimilarGifts(supabase, title, { for_person_id: isUuid(person) ? person : null, for_label: label?.trim() || null }, isUuid(exclude) ? exclude : null);
    return NextResponse.json({ similar });
  } catch (err) {
    console.error("[/api/gifts/similar GET]", err);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
