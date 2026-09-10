import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const { count, error } = await supabase
      .from("memory_chunks")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 });
  } catch (err) {
    console.error("[/api/memory/stats]", err);
    return NextResponse.json({ error: "stats failed" }, { status: 500 });
  }
}
