import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { principalUid } from "@/lib/tickets/server";
import { listGuides } from "@/lib/guides/list";

export const runtime = "nodejs";

/** GET /api/guides: the Guides list (Field guide design §4). Session, API token or API_SECRET; RLS decides what is seen. */
export async function GET() {
  const uid = await principalUid();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createUserClient();
    const guides = await listGuides(supabase);
    return NextResponse.json({ guides });
  } catch (err) {
    console.error("[/api/guides GET]", err);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
