import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { migrateFromEntities } from "@/lib/people/migrate-from-entities";

export const runtime = "nodejs";

function userId(): string | null {
  return process.env.USER_ID ?? null;
}

export async function POST() {
  const uid = userId();
  if (!uid) return NextResponse.json({ error: "USER_ID missing" }, { status: 500 });
  try {
    const supabase = createServerClient();
    const stats = await migrateFromEntities(supabase, uid);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    console.error("[/api/people/migrate]", err);
    return NextResponse.json({ error: "migration failed" }, { status: 500 });
  }
}
