import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const uid = process.env.USER_ID;
  if (!uid) {
    return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  }
  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from("memory_chunks")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    console.error("[/api/memory/stats]", err);
    return NextResponse.json({ error: "stats failed" }, { status: 500 });
  }
}
