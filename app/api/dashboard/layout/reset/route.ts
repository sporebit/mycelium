import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createUserClient();
    const { error } = await supabase
      .from("dashboard_layouts")
      .delete();
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
