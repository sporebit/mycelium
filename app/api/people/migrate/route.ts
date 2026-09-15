import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/user";
import { migrateFromEntities } from "@/lib/people/migrate-from-entities";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createUserClient();
    const stats = await migrateFromEntities(supabase);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    console.error("[/api/people/migrate]", err);
    return NextResponse.json({ error: "migration failed" }, { status: 500 });
  }
}
