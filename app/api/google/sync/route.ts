import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { pullFromGoogle } from "@/lib/google/sync";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createUserClient();
    const result = await pullFromGoogle(supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[google/sync GET]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createUserClient();
    const result = await pullFromGoogle(supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[google/sync POST]", err);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
