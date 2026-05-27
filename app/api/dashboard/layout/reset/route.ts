import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("dashboard_layouts")
      .delete()
      .eq("user_id", uid);
    if (error) {
      console.error("[/api/dashboard/layout/reset]", error);
      return NextResponse.json({ error: "reset failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/dashboard/layout/reset]", err);
    return NextResponse.json({ error: "reset failed" }, { status: 500 });
  }
}
